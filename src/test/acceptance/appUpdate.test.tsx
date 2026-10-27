import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { buildResponsesCsv } from '../../lib/exportCsv'
import { DEFAULT_PAYLOAD } from '../../lib/defaultSchema'
import { printQuestions } from '../../screens/PrintSurveyScreen'
import { makeDevice, makeServer, P, renderApp } from '../helpers'

async function openSurvey(version: string | null, os = 'android') {
  const p = P(1, '간*자', '8800', 'A', { app_version: version, app_os: os })
  const server = makeServer([p])
  const { engine } = makeDevice(server)
  await renderApp(engine)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('검색'), '8800')
  await user.click((await screen.findAllByTestId('result-row'))[0])
  await user.click(await screen.findByRole('button', { name: '본인 확인 완료' }))
  await screen.findByTestId('survey-step')
  return { user, server, p }
}

describe('앱 업데이트 안내', () => {
  test('구버전이면 빨갛게 "업데이트가 안 되어 있어요", 현장에서 업데이트하면 초록으로 강조된다', async () => {
    const { user } = await openSurvey('4.0.7')
    expect(await screen.findByTestId('app-badge')).toHaveTextContent('앱 4.0.7 · 업데이트 필요')
    const callout = screen.getByTestId('app-callout')
    expect(callout).toHaveAttribute('data-state', 'outdated')
    expect(callout).toHaveTextContent('업데이트가 안 되어 있어요')
    expect(callout).toHaveTextContent('4.0.7')
    expect(callout).toHaveTextContent('4.1.1')
    await user.click(within(screen.getByTestId('question-app_update')).getByRole('radio', { name: '현장에서 업데이트 완료' }))
    await waitFor(() => expect(screen.getByTestId('app-callout')).toHaveAttribute('data-state', 'updated'))
    expect(screen.getByTestId('app-callout')).toHaveTextContent('현장에서 업데이트했어요')
    expect(screen.getByText('앱 업데이트 완료 ✓')).toBeInTheDocument()
  })

  test('최신이면 초록 안내', async () => {
    await openSurvey('4.1.1')
    expect(await screen.findByTestId('app-callout')).toHaveAttribute('data-state', 'latest')
  })

  test('버전 정보가 없는 분', async () => {
    await openSurvey(null)
    expect(await screen.findByTestId('app-callout')).toHaveAttribute('data-state', 'unknown')
  })

  test("'업데이트 못함'이면 이유를 필수로 받는다", async () => {
    const { user } = await openSurvey('3.4.0')
    await user.click(within(screen.getByTestId('question-app_update')).getByRole('radio', { name: '업데이트 못함' }))
    expect(await screen.findByTestId('question-app_update_fail')).toBeInTheDocument()
  })

  test('개인정보 미동의여도 업데이트 문항은 남는다 (전 회원 대상)', async () => {
    const { user } = await openSurvey('4.0.9')
    await user.click(within(screen.getByTestId('question-consent')).getByRole('radio', { name: '미동의' }))
    expect(await screen.findByTestId('question-app_update')).toBeInTheDocument()
    expect(screen.getByTestId('app-callout')).toHaveAttribute('data-state', 'outdated')
  })

  test('인쇄 용지에는 넣지 않는다', () => {
    for (const t of ['A', 'B', 'C'] as const) {
      expect(printQuestions(DEFAULT_PAYLOAD, t).map((q) => q.key)).not.toContain('app_update')
    }
  })

  test('응답 CSV 에 명단의 앱 버전이 들어간다', () => {
    const p = P(1, '간*자', '8800', 'A', { app_version: '4.0.7' })
    const csv = buildResponsesCsv([{
      id: 'r1', participant_id: p.id, manual_info: null, track: 'A', verified: 'ok', verified_by: null, verified_at: null,
      real_name: null, consent: null, helpers: [], answers: { app_update: '현장에서 업데이트 완료' }, status: 'done', result: null,
      entered_by: null, device_id: null, schema_version: 1, started_at: '', completed_at: null, updated_at: '', client_rev: 1, deleted_at: null,
    }], new Map([[p.id, p]]), DEFAULT_PAYLOAD)
    const [head, row] = csv.replace(/^﻿/, '').split('\r\n').map((l) => l.split(','))
    expect(row[head.indexOf('앱 버전(명단)')]).toBe('4.0.7')
  })
})

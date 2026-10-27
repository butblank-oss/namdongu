import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_PAYLOAD } from '../../lib/defaultSchema'
import { buildResponsesCsv } from '../../lib/exportCsv'
import { makeDevice, makeServer, P, renderApp } from '../helpers'

/** 오늘 추가된 항목이 응답 목록과 CSV 에 모두 보이는지 */
describe('응답 목록 · CSV 에 새 항목', () => {
  async function seed() {
    const ps = [P(1, '간*자', '8800', 'A', { app_version: '4.0.7' }), P(2, '김*순', '1234', 'B'), P(3, '이*희', '8801', 'C')]
    const server = makeServer(ps)
    const { engine, db } = makeDevice(server)
    const mk = async (p: typeof ps[number], answers: Record<string, string | string[]>, queue: number) => {
      engine.myCall = null
      const r = await engine.createResponse({ participant: p, track: p.track, verified: 'ok' })
      await engine.updateResponse(r.id, (x) => ({ ...x, answers, status: 'done', completed_at: x.updated_at, queue_no: queue }))
    }
    await mk(ps[0], {
      reward: '일부 지급 (재고 부족)', reward_partial: ['칼마디', '기타'], reward_partial__etc: '물티슈',
      app_update: '현장에서 업데이트 완료', contact_pref: ['가족을 통해'], family_consent: '동의',
      family_name: '김영희', family_relation: '딸', family_phone: '010-1234-5678',
    }, 12)
    await mk(ps[1], { reward: '대상 아님', reward_reason: '이미 받으심', app_update: '업데이트 못함', app_update_fail: '저장 공간 부족' }, 13)
    await mk(ps[2], { reward: '수량 부족 · 보건소 방문 지급', app_update: '이미 최신' }, 114)
    return { engine, db, server, ps }
  }

  test('목록: 번호표 · 리워드(일부 수령 품목 / 지급 못한 사유) · 앱 업데이트', async () => {
    const { engine } = await seed()
    await renderApp(engine, '/list')
    const rows = await screen.findAllByTestId('list-row')
    const byQueue = new Map(rows.map((r) => [within(r).getByTestId('cell-queue').textContent, r]))
    const r12 = byQueue.get('12')!, r13 = byQueue.get('13')!, r114 = byQueue.get('114')!
    expect(within(r12).getByTestId('cell-reward')).toHaveTextContent('일부 지급 (재고 부족)칼마디, 기타(물티슈)')
    expect(within(r12).getByTestId('cell-app')).toHaveTextContent('현장 업데이트')
    expect(within(r13).getByTestId('cell-reward')).toHaveTextContent('대상 아님이미 받으심')
    expect(within(r13).getByTestId('cell-app')).toHaveTextContent('못함저장 공간 부족')
    expect(within(r114).getByTestId('cell-reward')).toHaveTextContent('수량 부족 · 보건소 방문 지급')
    expect(within(r114).getByTestId('cell-app')).toHaveTextContent('이미 최신')

    // 번호표로 찾기
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('목록 검색'), '114')
    expect(await screen.findAllByTestId('list-row')).toHaveLength(1)
  })

  test('CSV: 번호표 · 앱 버전 · 리워드 세부 · 앱 업데이트 · 가족 성함/관계/번호가 각각 열로', async () => {
    const { db, ps } = await seed()
    const csv = buildResponsesCsv(await db.responses.toArray(), new Map(ps.map((p) => [p.id, p])), DEFAULT_PAYLOAD)
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n')
    const head = lines[0].split(',')
    const col = (h: string) => { const i = head.findIndex((x) => x.startsWith(h)); expect(i, h).toBeGreaterThanOrEqual(0); return i }
    const row = lines.slice(1).map((l) => l.split(',')).find((c) => c[col('대기번호')] === '12')!
    expect(row[col('앱 버전(명단)')]).toBe('4.0.7')
    expect(row[col('받으신 리워드 (일부 수령)')]).toBe('칼마디; 기타')
    expect(row[col('[reward_partial__etc]')]).toBe('물티슈')
    expect(row[col('앱 업데이트')]).toBe('현장에서 업데이트 완료')
    expect(row[col('가족 성함')]).toBe('김영희')
    expect(row[col('어르신과의 관계')]).toBe('딸')
    expect(row[col('가족 휴대폰 번호')]).toBe('010-1234-5678')
    const r13 = lines.slice(1).map((l) => l.split(',')).find((c) => c[col('대기번호')] === '13')!
    expect(r13[col('지급 못한 사유')]).toBe('이미 받으심')
    expect(r13[col('업데이트 못한 이유')]).toBe('저장 공간 부족')
  })
})

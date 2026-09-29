import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { nameMatchScore } from '../../lib/search'
import { makeDevice, makeServer, renderApp } from '../helpers'

beforeEach(() => { sessionStorage.clear() })

describe('nameMatchScore 규칙', () => {
  test('#4 (a) 입력값이 이름에 그대로 포함되면 4점', () => {
    expect(nameMatchScore('간*자', '간*')).toBe(4)
    expect(nameMatchScore('간*자', '*자')).toBe(4)
    expect(nameMatchScore('간*자', '간*자')).toBe(4)
  })
  test('#4 (b) 길이가 같고 * 자리를 뺀 글자가 일치하면 3점', () => {
    expect(nameMatchScore('간*자', '간경자')).toBe(3)
    expect(nameMatchScore('간*자', '간 경 자')).toBe(3)
    expect(nameMatchScore('간*자', '간경숙')).not.toBe(3)
  })
  test('#4 (c) *를 뺀 글자가 입력값 안에 순서대로 있으면 2점', () => {
    expect(nameMatchScore('간*자', '간영경자')).toBe(2)
    expect(nameMatchScore('간*자', '자간')).toBeLessThan(2)
  })
  test('#4 (d) 첫 글자만 일치하면 1점, 아무것도 안 맞으면 0점', () => {
    expect(nameMatchScore('간*자', '간숙')).toBe(1)
    expect(nameMatchScore('간*자', '김경자')).toBe(0)
    expect(nameMatchScore('간*자', '')).toBe(0)
  })
  test('#4 점수는 (a) > (b) > (c) > (d) 순', () => {
    expect(nameMatchScore('간*자', '간*')).toBeGreaterThan(nameMatchScore('간*자', '간경자'))
    expect(nameMatchScore('간*자', '간경자')).toBeGreaterThan(nameMatchScore('간*자', '간영경자'))
    expect(nameMatchScore('간*자', '간영경자')).toBeGreaterThan(nameMatchScore('간*자', '간숙'))
  })
})

describe('검색 화면', () => {
  test('#4 간경자로 검색하면 간*자가 나온다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('검색'), '간경자')
    const rows = await screen.findAllByTestId('result-row')
    expect(within(rows[0]).getByText('간*자')).toBeInTheDocument()
    expect(rows.some((r) => r.textContent?.includes('김*순'))).toBe(false)
  })

  test('#5 8800 검색은 phone_last4가 8800인 행만 보여준다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('검색'), '8800')
    await waitFor(() => expect(screen.getAllByTestId('result-row')).toHaveLength(2))
    const rows = screen.getAllByTestId('result-row')
    const text = rows.map((r) => r.textContent).join('|')
    expect(text).toContain('간*자')
    expect(text).toContain('최*자')
    expect(text).not.toContain('이*희') // 8801
    expect(text).not.toContain('박*호') // 1880
    for (const r of rows) expect(within(r).getByTestId('phone-last4')).toHaveTextContent('8800')
  })

  test('#6 모든 결과 행에 전화 뒷4자리가 표시된다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const rows = await screen.findAllByTestId('result-row')
    expect(rows).toHaveLength(7)
    for (const r of rows) expect(within(r).getByTestId('phone-last4').textContent).toMatch(/^\d{4}$/)
  })

  test('#7 검색창에서 Enter를 누르면 첫 번째 결과가 열린다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('검색'), '간경자{Enter}')
    expect(await screen.findByRole('button', { name: '본인 확인 완료' })).toBeInTheDocument()
    expect(screen.getByTestId('verify-phone')).toHaveTextContent('8800')
  })

  test('#7 본인 확인 관문을 통과하지 않으면 문항이 보이지 않고 확인 화면으로 돌아간다', async () => {
    const server = makeServer()
    const { engine } = makeDevice(server)
    const r = await engine.createResponse({ participant: server.participants[0], track: 'A', verified: 'ok' })
    expect(engine.passedGate.has(r.id)).toBe(false)
    await renderApp(engine, `/r/${r.id}`)
    // 본인 확인 화면
    expect(await screen.findByRole('button', { name: '본인 확인 완료' })).toBeInTheDocument()
    expect(screen.queryByTestId('survey-step')).not.toBeInTheDocument()
    expect(screen.queryByText('개인정보 수집·이용에 동의하셨나요?')).not.toBeInTheDocument()

    // 응답 인덱스가 읽힐 시간을 준다 (그 전에 누르면 기존 응답을 못 보고 새로 만든다)
    await waitFor(() => expect(screen.getByTestId('net-status')).toHaveTextContent('대기 0건'))
    await new Promise((r) => setTimeout(r, 100))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '본인 확인 완료' }))
    const step = await screen.findByTestId('survey-step')
    expect(within(step).getByText('개인정보 수집·이용에 동의하셨나요?')).toBeInTheDocument()
  })
})

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EngineContext } from '../../app/context'
import type { Engine } from '../../lib/engine'
import type { Answers, Participant, Status } from '../../lib/types'
import { DashboardScreen } from '../../screens/DashboardScreen'
import { FIXTURE, makeDevice, makeServer } from '../helpers'

async function seed(engine: Engine, p: Participant, status: Status, answers: Answers) {
  const r = await engine.createResponse({ participant: p, track: p.track, verified: 'ok' })
  await engine.updateResponse(r.id, (x) => ({
    ...x, status, answers: { ...x.answers, ...answers }, completed_at: status === 'in_progress' ? null : new Date().toISOString(),
  }))
}

async function setup() {
  const { engine } = makeDevice(makeServer())
  await engine.start()
  await seed(engine, FIXTURE[0], 'done', { visit_path: ['앱 알림', '기타'], visit_path__etc: '동네 방송', a_freq: '거의 매일', preorder_4: '신청' })
  await seed(engine, FIXTURE[1], 'done', { visit_path: ['앱 알림'], b_restart: '오늘 바로' })
  await seed(engine, FIXTURE[2], 'in_progress', {})
  render(
    <EngineContext.Provider value={engine}>
      <MemoryRouter><DashboardScreen /></MemoryRouter>
    </EngineContext.Provider>,
  )
  return engine
}

const card = (label: string) => screen.getAllByTestId('question-card').find((c) => within(c).queryByText(label))

test('KPI, 문항 카드, 대상 필터', async () => {
  await setup()
  const user = userEvent.setup()
  const done = await screen.findByTestId('kpi-done')
  expect(within(done).getByText('2')).toBeInTheDocument()
  expect(done).toHaveTextContent('/ 7명 (29%)')
  expect(screen.getByTestId('kpi-inProgress')).toHaveTextContent('1')
  expect(screen.getByTestId('kpi-preorder4')).toHaveTextContent('1')

  const visit = card('오늘 행사는 어떻게 알고 오셨어요?')!
  expect(visit).toHaveTextContent('응답 2명')
  expect(visit).toHaveTextContent('여러 개 선택')
  expect(within(visit).getByTitle('앱 알림: 2명 (100%)')).toBeInTheDocument()
  expect(within(visit).getByTitle('기타: 1명 (50%)')).toBeInTheDocument()
  expect(within(visit).getByText('동네 방송')).toBeInTheDocument()

  expect(card('다시 시작해 보시겠어요?')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: '활동 중' }))
  expect(screen.getByRole('button', { name: '활동 중' })).toHaveAttribute('aria-pressed', 'true')
  await waitFor(() => expect(card('다시 시작해 보시겠어요?')).toBeUndefined())
  expect(card('요즘 맬리브레인을 얼마나 자주 하세요?')).toBeTruthy()
  expect(card('오늘 행사는 어떻게 알고 오셨어요?')).toHaveTextContent('응답 1명')
})

test('응답이 없으면 빈 상태', async () => {
  const { engine } = makeDevice(makeServer())
  await engine.start()
  render(<EngineContext.Provider value={engine}><MemoryRouter><DashboardScreen /></MemoryRouter></EngineContext.Provider>)
  expect(await screen.findByText('아직 응답이 없습니다')).toBeInTheDocument()
})

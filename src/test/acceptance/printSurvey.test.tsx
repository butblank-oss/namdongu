import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { EngineContext } from '../../app/context'
import { PrintSurveyScreen } from '../../screens/PrintSurveyScreen'
import { makeDevice, makeServer } from '../helpers'

async function setup() {
  const { engine } = makeDevice(makeServer())
  await engine.start()
  render(
    <EngineContext.Provider value={engine}>
      <MemoryRouter><PrintSurveyScreen /></MemoryRouter>
    </EngineContext.Provider>,
  )
  return engine
}

test('대상별 용지 3종을 저장된 설문으로 그리고, 직원 문항은 직원 기입란으로 보낸다', async () => {
  await setup()
  const papers = await screen.findAllByTestId('paper')
  expect(papers.map((p) => p.dataset.track)).toEqual(['A', 'B', 'C'])
  const a = papers[0]
  expect(a).toHaveTextContent('활동 중')
  expect(a).toHaveTextContent('요즘 맬리브레인을 얼마나 자주 하세요?')
  expect(a).not.toHaveTextContent('다시 시작해 보시겠어요?') // 쉬는 중 문항은 없다
  expect(within(a).getByText('직원 기입란')).toBeInTheDocument()
  expect(a.textContent!.indexOf('응대 결과')).toBeGreaterThan(a.textContent!.indexOf('직원 기입란'))
  expect(papers[2]).toHaveTextContent('현장 조치 체크리스트')
})

test('용지 고르기와 직원 문항 바꾸기', async () => {
  await setup()
  const user = userEvent.setup()
  await screen.findAllByTestId('paper')
  await user.click(screen.getByRole('button', { name: '쉬는 중' }))
  expect(screen.getAllByTestId('paper').map((p) => p.dataset.track)).toEqual(['A', 'C'])
  // '4기 사전신청'을 직원 문항으로 보내면 어르신 번호 목록에서 빠진다
  const before = within(screen.getAllByTestId('paper')[0]).getAllByTestId('paper-question').length
  await user.click(screen.getByText(/직원이 적는 문항 고르기/))
  await user.click(screen.getByRole('button', { name: '4기 사전신청' }))
  const a = screen.getAllByTestId('paper')[0]
  expect(within(a).getAllByTestId('paper-question').length).toBe(before)
  expect(a.textContent!.indexOf('4기 사전신청')).toBeGreaterThan(a.textContent!.indexOf('직원 기입란'))
})

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
  const target = within(a).getAllByTestId('paper-question')
    .find((el) => el.querySelector('p')?.textContent?.replace(/^\d+\.\s*/, '').startsWith('4기 사전신청'))
  expect(target?.closest('.border-dashed')).not.toBeNull() // 직원 기입란 안에 있다
})

test('4기 동의 문항은 고지문과 함께 인쇄되고, 신청한 분만 답하도록 안내한다', async () => {
  await setup()
  const a = (await screen.findAllByTestId('paper'))[0]
  expect(a).toHaveTextContent('[필수] 4기 참여를 위한 개인정보 수집·이용에 동의하십니까?')
  expect(a).toHaveTextContent('보유 기간: 4기 프로그램 종료 시까지')
  expect(a).toHaveTextContent('[선택] 4기 소식을 문자로 받는 데 동의하십니까?')
  expect(a).toHaveTextContent('‘4기 사전신청’ [신청] 고르신 분만 답해 주세요')
})

test('성함·전화번호는 밑줄 칸 두 개 (전화번호 전체를 적는다)', async () => {
  await setup()
  const a = (await screen.findAllByTestId('paper'))[0]
  const np = within(a).getByTestId('name-phone')
  expect(np).toHaveTextContent('성함')
  expect(np).toHaveTextContent('전화번호')
  expect(np).not.toHaveTextContent('뒷 4자리')
  expect(within(a).getAllByTestId('sheet').length).toBeGreaterThan(0)
})

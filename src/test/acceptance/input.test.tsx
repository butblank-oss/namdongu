import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'
import { fillStepRequired, openSurveyFor } from '../surveyFlow'

beforeEach(() => { sessionStorage.clear() })

describe('입력 안정성', () => {
  test('#8 마무리 영역에서 글 칸(지급 못한 사유)을 입력한 뒤 다른 문항을 눌러도 유지된다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await openSurveyFor(user)

    const reward = screen.getByTestId('question-reward')
    await user.click(within(reward).getByRole('radio', { name: '대상 아님' }))
    const input = within(screen.getByTestId('question-reward_reason')).getByRole('textbox')
    await user.type(input, '이미 받으심')
    expect(input).toHaveValue('이미 받으심')

    await user.click(within(screen.getByTestId('question-preorder_4')).getByRole('radio', { name: '신청' }))
    expect(within(screen.getByTestId('question-reward_reason')).getByRole('textbox')).toHaveValue('이미 받으심')
    // 저장 지연 후에도 유지
    await new Promise((r) => setTimeout(r, 400))
    expect(within(screen.getByTestId('question-reward_reason')).getByRole('textbox')).toHaveValue('이미 받으심')
  })

  test('#9 보기를 눌러도 스크롤이 움직이지 않고 문항이 다시 만들어지지 않는다', async () => {
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await openSurveyFor(user)

    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const intoView = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    scrollTo.mockClear(); intoView.mockClear()

    const before = screen.getByTestId('question-consent')
    await user.click(within(before).getByRole('radio', { name: '동의' }))
    expect(within(before).getByRole('radio', { name: '동의' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('question-consent')).toBe(before)
    expect(before.isConnected).toBe(true)

    // 같은 페이지의 트랙 문항에서도 같은 검사
    await fillStepRequired(user)
    scrollTo.mockClear(); intoView.mockClear()
    const sec = screen.getByTestId('question-a_freq')
    await user.click(within(sec).getAllByRole('radio')[1])
    expect(screen.getByTestId('question-a_freq')).toBe(sec)
    await waitFor(() => expect(within(sec).getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true'))
    expect(scrollTo).not.toHaveBeenCalled()
    expect(intoView).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})

test("리워드 '대상 아님'을 고르면 사유를 적을 수 있다", async () => {
  const { engine, db } = makeDevice(makeServer())
  await renderApp(engine)
  const user = userEvent.setup()
  await openSurveyFor(user)
  expect(screen.queryByTestId('question-reward_reason')).not.toBeInTheDocument()
  expect(within(screen.getByTestId('question-reward')).queryByRole('radio', { name: '추후 배송' })).not.toBeInTheDocument()
  await user.click(within(screen.getByTestId('question-reward')).getByRole('radio', { name: '대상 아님' }))
  await user.type(within(await screen.findByTestId('question-reward_reason')).getByRole('textbox'), '이미 받으심')
  await waitFor(async () => expect((await db.responses.toArray())[0].answers.reward_reason).toBe('이미 받으심'))
})

test("리워드: 일부 지급이면 받으신 리워드를 여러 개 고르고, 실명 칸은 어떤 경우에도 나오지 않는다", async () => {
  const { engine, db } = makeDevice(makeServer())
  await renderApp(engine)
  const user = userEvent.setup()
  await openSurveyFor(user)
  const reward = screen.getByTestId('question-reward')
  for (const o of ['현장 지급', '수량 부족 · 보건소 방문 지급', '대상 아님']) {
    await user.click(within(reward).getByRole('radio', { name: o }))
    expect(screen.queryByTestId('question-real_name')).not.toBeInTheDocument()
    expect(screen.queryByTestId('question-reward_partial')).not.toBeInTheDocument()
  }
  expect(screen.getByTestId('question-reward_reason')).toHaveTextContent('지급 못한 사유')
  await user.click(within(reward).getByRole('radio', { name: '일부 지급 (재고 부족)' }))
  const partial = await screen.findByTestId('question-reward_partial')
  await user.click(within(partial).getByRole('checkbox', { name: '칼마디' }))
  expect(screen.queryByTestId('question-real_name')).not.toBeInTheDocument()
  await waitFor(async () => expect((await db.responses.toArray())[0].answers.reward_partial).toEqual(['칼마디']))
})

test("'가족을 통해'를 고르면 가족 본인 동의(고지문)가 나오고, 동의해야 성함·관계·번호 칸이 열린다", async () => {
  const { engine, db } = makeDevice(makeServer())
  await renderApp(engine)
  const user = userEvent.setup()
  await openSurveyFor(user)
  expect(screen.queryByTestId('question-family_consent')).not.toBeInTheDocument()
  await user.click(within(screen.getByTestId('question-contact_pref')).getByRole('checkbox', { name: '가족을 통해' }))
  const consent = await screen.findByTestId('question-family_consent')
  expect(consent).toHaveTextContent('어르신이 대신 동의하실 수 없습니다')
  expect(consent).toHaveTextContent('항목: 가족분 성함, 어르신과의 관계, 휴대폰 번호')
  expect(screen.queryByTestId('question-family_phone')).not.toBeInTheDocument()
  await user.click(within(consent).getByRole('radio', { name: '미동의' }))
  expect(screen.queryByTestId('question-family_phone')).not.toBeInTheDocument()
  await user.click(within(consent).getByRole('radio', { name: '동의' }))
  await user.type(within(await screen.findByTestId('question-family_name')).getByRole('textbox'), '김영희')
  await user.click(within(screen.getByTestId('question-family_relation')).getByRole('radio', { name: '딸' }))
  const phone = within(screen.getByTestId('question-family_phone')).getByRole('textbox')
  await user.type(phone, '01012345678')
  expect(phone).toHaveValue('010-1234-5678')
  await waitFor(async () => {
    const a = (await db.responses.toArray())[0].answers
    expect([a.family_name, a.family_relation, a.family_phone]).toEqual(['김영희', '딸', '010-1234-5678'])
  })
})

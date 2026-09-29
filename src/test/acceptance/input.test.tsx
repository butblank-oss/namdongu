import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'
import { fillStepRequired, openSurveyFor } from '../surveyFlow'

beforeEach(() => { sessionStorage.clear() })

describe('입력 안정성', () => {
  test('#8 마무리 영역에서 실명을 입력한 뒤 다른 문항을 눌러도 실명이 유지된다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await openSurveyFor(user)

    const reward = screen.getByTestId('question-reward')
    await user.click(within(reward).getByRole('radio', { name: '추후 배송' }))
    const input = within(screen.getByTestId('question-real_name')).getByRole('textbox')
    await user.type(input, '간경자')
    expect(input).toHaveValue('간경자')

    await user.click(within(screen.getByTestId('question-preorder_4')).getByRole('radio', { name: '신청' }))
    expect(within(screen.getByTestId('question-real_name')).getByRole('textbox')).toHaveValue('간경자')
    // 저장 지연 후에도 유지
    await new Promise((r) => setTimeout(r, 400))
    expect(within(screen.getByTestId('question-real_name')).getByRole('textbox')).toHaveValue('간경자')
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

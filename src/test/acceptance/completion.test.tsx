import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'
import { fillStepRequired, openSurveyFor } from '../surveyFlow'

beforeEach(() => { sessionStorage.clear() })

const responses = async (engine: ReturnType<typeof makeDevice>['engine']) => engine.db.responses.toArray()

describe('완료 처리', () => {
  test('#11 동의를 비운 채 응대 완료를 누르면 페이지에 머물고 동의 문항에 필수 안내가 뜬다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await openSurveyFor(user)
    expect(screen.getByTestId('progress-required')).toHaveTextContent('필수 0 /')

    await user.click(screen.getByRole('button', { name: '응대 완료' }))
    expect(screen.getByTestId('survey-step')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다음 분 찾기' })).not.toBeInTheDocument()
    const consent = screen.getByTestId('question-consent')
    expect(consent).toHaveAttribute('data-invalid', 'true')
    expect(within(consent).getByText('필수 문항입니다')).toBeInTheDocument()
    expect(screen.getByText(/필수 문항 \d+개가 비어 있습니다/)).toBeInTheDocument()
  })

  test('#12 응대 완료를 누르기 전에는 in_progress, 누른 뒤에는 done + completed_at', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await openSurveyFor(user)

    let rows = await responses(engine)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('in_progress')

    await fillStepRequired(user)
    rows = await responses(engine)
    expect(rows[0].status).toBe('in_progress')
    expect(rows[0].completed_at).toBeNull()

    await user.click(screen.getByRole('button', { name: '응대 완료' }))
    expect(await screen.findByRole('button', { name: '다음 분 찾기' })).toBeInTheDocument()
    rows = await responses(engine)
    expect(rows[0].status).toBe('done')
    expect(rows[0].completed_at).toBeTruthy()
  })

  test('#13 완료 직후 트랙 A 진행 카운터가 올라간다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await waitFor(() => expect(screen.getByTestId('progress-A')).toHaveTextContent('0/2'))
    await openSurveyFor(user)
    await fillStepRequired(user)
    await user.click(screen.getByRole('button', { name: '응대 완료' }))
    await screen.findByRole('button', { name: '다음 분 찾기' })
    await waitFor(() => expect(screen.getByTestId('progress-A')).toHaveTextContent('1/2'))
  })

  test('동의 미동의면 대상 문항이 사라지고 응대 결과만으로 완료할 수 있다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await openSurveyFor(user)
    expect(screen.getByTestId('question-a_freq')).toBeInTheDocument()
    await user.click(within(screen.getByTestId('question-consent')).getByRole('radio', { name: '미동의' }))
    expect(screen.queryByTestId('question-a_freq')).not.toBeInTheDocument()
    expect(screen.queryByTestId('question-reward')).not.toBeInTheDocument()
    expect(screen.getByTestId('question-result')).toBeInTheDocument()
    await fillStepRequired(user)
    await user.click(screen.getByRole('button', { name: '응대 완료' }))
    expect(await screen.findByRole('button', { name: '다음 분 찾기' })).toBeInTheDocument()
    const rows = await responses(engine)
    expect(rows[0].status).not.toBe('in_progress')
    expect(rows[0].completed_at).toBeTruthy()
  })
})

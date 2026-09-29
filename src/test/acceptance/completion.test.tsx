import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'
import { clickNext, fillStepRequired, openSurveyFor } from '../surveyFlow'

beforeEach(() => { sessionStorage.clear() })

const responses = async (engine: ReturnType<typeof makeDevice>['engine']) => engine.db.responses.toArray()

describe('완료 처리', () => {
  test('#11 동의를 비운 채 다음을 누르면 1스텝에 머물고 필수 안내가 뜬다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await openSurveyFor(user)
    expect(screen.getByTestId('step-indicator')).toHaveTextContent('1 /')

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByTestId('step-indicator')).toHaveTextContent('1 /')
    const consent = screen.getByTestId('question-consent')
    expect(consent).toHaveAttribute('data-invalid', 'true')
    expect(within(consent).getByText('필수 문항입니다')).toBeInTheDocument()
  })

  test('#12 응대 완료를 누르기 전에는 in_progress, 누른 뒤에는 done + completed_at', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine)
    const user = userEvent.setup()
    await openSurveyFor(user)

    let rows = await responses(engine)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('in_progress')

    while (screen.queryByRole('button', { name: '다음' })) {
      await fillStepRequired(user)
      await clickNext(user)
      rows = await responses(engine)
      expect(rows[0].status).toBe('in_progress')
      expect(rows[0].completed_at).toBeNull()
    }
    await fillStepRequired(user)
    rows = await responses(engine)
    expect(rows[0].status).toBe('in_progress')

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
    while (screen.queryByRole('button', { name: '다음' })) {
      await fillStepRequired(user)
      await clickNext(user)
    }
    await fillStepRequired(user)
    await user.click(screen.getByRole('button', { name: '응대 완료' }))
    await screen.findByRole('button', { name: '다음 분 찾기' })
    await waitFor(() => expect(screen.getByTestId('progress-A')).toHaveTextContent('1/2'))
  })
})

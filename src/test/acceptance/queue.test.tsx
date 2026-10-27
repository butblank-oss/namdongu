import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'

describe('대기번호', () => {
  test('두 직원이 차례로 부르면 번호가 겹치지 않고, 부른 번호가 그 직원의 다음 설문에 들어간다', async () => {
    const server = makeServer()
    const a = makeDevice(server, { name: '강하연' })
    const b = makeDevice(server, { name: '김다희' })
    await b.engine.start({ intervalMs: 0, backupMs: 0 })
    await renderApp(a.engine)
    const user = userEvent.setup()

    expect(await screen.findByTestId('call-next')).toHaveTextContent('다음 분 호출 1번')
    await user.click(screen.getByTestId('call-next'))
    expect(await screen.findByTestId('my-call')).toHaveTextContent('내 호출 1번')
    await act(async () => { expect(await b.engine.callNext()).toBe(2) })
    await waitFor(() => expect(screen.getByTestId('call-next')).toHaveTextContent('다음 분 호출 3번'))

    // A 가 어르신을 찾아 설문을 시작하면 1번이 들어가고, 내 호출은 비워진다
    await user.type(screen.getByLabelText('검색'), '8800')
    await user.click((await screen.findAllByTestId('result-row'))[0])
    await user.click(await screen.findByRole('button', { name: '본인 확인 완료' }))
    await screen.findByTestId('survey-step')
    expect(screen.getByTestId('queue-no')).toHaveValue('1')
    expect(screen.queryByTestId('my-call')).not.toBeInTheDocument()
    const [r] = await a.db.responses.toArray()
    expect(r.queue_no).toBe(1)
    await waitFor(() => expect(server.responses.get(r.id)?.queue_no).toBe(1))

    // 직접 고칠 수 있다
    await user.clear(screen.getByTestId('queue-no'))
    await user.type(screen.getByTestId('queue-no'), '7{Enter}')
    await waitFor(async () => expect((await a.db.responses.get(r.id))?.queue_no).toBe(7))
    b.engine.stop()
  })

  test('대기석 화면: 방금 부른 번호를 크게, 다음 순서와 최근 번호를 보여 준다', async () => {
    const server = makeServer()
    const a = makeDevice(server)
    await renderApp(a.engine, '/queue')
    expect(await screen.findByText('곧 호출을 시작합니다')).toBeInTheDocument()
    expect(screen.queryByTestId('call-next')).not.toBeInTheDocument() // 상단 바 없음

    const b = makeDevice(server, { name: '김다희' })
    await act(async () => { await b.engine.callNext(); await b.engine.callNext(); await b.engine.callNext() })
    await waitFor(() => expect(screen.getByTestId('display-now')).toHaveTextContent('3'))
    expect(screen.getByTestId('display-next')).toHaveTextContent('4번 어르신')
    expect(within(screen.getByTestId('display-recent')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['2', '1'])

    // 다시 부르면 그 번호가 다시 크게 뜬다
    await act(async () => { await b.engine.recall(1) })
    await waitFor(() => expect(screen.getByTestId('display-now')).toHaveTextContent('1'))
  })

  test('끝 번호까지 부르면 더 부를 수 없다', async () => {
    const server = makeServer()
    server.queue = { last_called: 160, max_number: 160, calls: [] }
    const a = makeDevice(server)
    await renderApp(a.engine)
    expect(await screen.findByTestId('call-next')).toBeDisabled()
    expect(screen.getByTestId('call-next')).toHaveTextContent('번호 끝')
  })

  test('관리 화면: 관리자는 처음부터 다시 시작할 수 있다', async () => {
    const server = makeServer()
    server.queue = { last_called: 5, max_number: 160, calls: [{ number: 5, called_by: '김다희', called_at: '2026-10-30T01:00:00Z' }] }
    const a = makeDevice(server)
    await renderApp(a.engine, '/queue-settings')
    const user = userEvent.setup()
    expect(await screen.findByTestId('queue-calls')).toHaveTextContent('5번')
    const next = screen.getByLabelText('다음에 부를 번호')
    await waitFor(() => expect(next).toHaveValue('6'))
    await user.clear(next)
    await user.type(next, '1')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(server.queue.last_called).toBe(0))
    expect(server.queue.calls).toEqual([])
    confirm.mockRestore()
  })

  test('담당자(operator)는 번호를 바꿀 수 없다', async () => {
    const server = makeServer()
    const a = makeDevice(server, { name: '김다희' })
    await renderApp(a.engine, '/queue-settings')
    expect(await screen.findByRole('button', { name: '저장' })).toBeDisabled()
  })
})

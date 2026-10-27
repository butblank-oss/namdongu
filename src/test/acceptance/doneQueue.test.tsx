import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'

describe('응대 완료 화면의 다음 분 호출', () => {
  test('완료하면 다음 번호가 실시간으로 보이고, 누르면 그 번호를 부르고 찾기로 이어진다', async () => {
    const server = makeServer()
    server.queue = { last_called: 4, max_number: 160, calls: [] }
    const a = makeDevice(server)
    const r = await a.engine.createResponse({ participant: server.participants[0], track: 'A', verified: 'ok' })
    await a.engine.updateResponse(r.id, (x) => ({ ...x, status: 'done' }))
    await renderApp(a.engine, `/r/${r.id}/done`)
    const user = userEvent.setup()
    expect(await screen.findByTestId('done-next')).toHaveTextContent('5번 어르신')
    expect(screen.getByTestId('done-call-next')).toHaveFocus()

    // 다른 직원이 먼저 5번을 부르면 6번으로 바뀐다
    const b = makeDevice(server, { name: '김다희' })
    await act(async () => { await b.engine.callNext() })
    await waitFor(() => expect(screen.getByTestId('done-next')).toHaveTextContent('6번 어르신'))

    await user.click(screen.getByTestId('done-call-next'))
    expect(await screen.findByTestId('done-called')).toHaveTextContent('6번 어르신')
    expect(server.queue.last_called).toBe(6)
    expect(a.engine.myCall).toBe(6)
    await user.click(screen.getByRole('button', { name: '대기번호 6번 설문 진행하기' }))
    expect(await screen.findByLabelText('검색')).toBeInTheDocument()
  })
})

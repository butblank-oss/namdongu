import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { QueueState } from '../../lib/types'
import { makeDevice, makeServer, renderApp } from '../helpers'

/** 서버 응답이 늦게 도착하는 상황: 먼저 보낸 조회가 나중에 돌아온다 */
function delayFirstFetch(remote: { fetchQueue: () => Promise<QueueState> }) {
  const real = remote.fetchQueue.bind(remote)
  let release: (() => void) | null = null
  let first = true
  remote.fetchQueue = async () => {
    const snapshot = await real()
    if (first) {
      first = false
      await new Promise<void>((r) => { release = r })
    }
    return snapshot
  }
  return () => release?.()
}

describe('대기번호: 노트북 여러 대에서 번갈아 누를 때', () => {
  test('늦게 도착한 옛 조회 결과가 최신 번호를 덮어쓰지 않는다 (12 다음에 11로 돌아가지 않음)', async () => {
    const server = makeServer()
    server.queue = { last_called: 10, max_number: 160, calls: [] }
    const display = makeDevice(server)
    await renderApp(display.engine, '/queue')
    const staff = makeDevice(server, { name: '김다희' })

    // 11번 호출 → 큰 화면이 조회를 시작하지만 응답이 늦게 온다
    const releaseOld = delayFirstFetch(display.remote)
    await act(async () => { await staff.engine.callNext() })
    // 그 사이 12번 호출 → 이 조회는 바로 도착
    await act(async () => { await staff.engine.callNext() })
    await waitFor(() => expect(screen.getByTestId('display-now')).toHaveTextContent('12'))
    // 이제야 11번 시점의 옛 응답이 도착
    await act(async () => { releaseOld(); await new Promise((r) => setTimeout(r, 0)) })
    expect(screen.getByTestId('display-now')).toHaveTextContent('12')
    expect(screen.getByTestId('display-next')).toHaveTextContent('13번')
  })

  test('번호 바꾸기: "다음에 부를 번호"에 12를 넣으면 다음 호출이 12번이다', async () => {
    const server = makeServer()
    server.queue = { last_called: 20, max_number: 160, calls: [] }
    const admin = makeDevice(server)
    await renderApp(admin.engine, '/queue-settings')
    const user = userEvent.setup()
    const field = await screen.findByLabelText('다음에 부를 번호')
    expect(field).toHaveValue('21')
    await user.clear(field)
    await user.type(field, '12')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '저장' }))
    confirm.mockRestore()
    await waitFor(() => expect(server.queue.last_called).toBe(11))
    const staff = makeDevice(server, { name: '김다희' })
    expect(await staff.engine.callNext()).toBe(12)
  })

  test('번호 바꾸기: 입력하는 동안 다른 노트북이 호출해도 입력 중인 값이 바뀌지 않는다', async () => {
    const server = makeServer()
    server.queue = { last_called: 5, max_number: 160, calls: [] }
    const admin = makeDevice(server)
    await renderApp(admin.engine, '/queue-settings')
    const user = userEvent.setup()
    const field = await screen.findByLabelText('다음에 부를 번호')
    await user.clear(field)
    await user.type(field, '12')
    const staff = makeDevice(server, { name: '김다희' })
    await act(async () => { await staff.engine.callNext() })
    await waitFor(() => expect(admin.engine.queue?.last_called).toBe(6))
    expect(field).toHaveValue('12')
  })

  test('내 호출 다시 부르기는 한 번 더 확인한다 (잘못 눌러 옛 번호가 뜨지 않게)', async () => {
    const server = makeServer()
    const a = makeDevice(server)
    await renderApp(a.engine)
    const user = userEvent.setup()
    await user.click(await screen.findByTestId('call-next'))
    await user.click(await screen.findByTestId('call-next'))
    const firstCall = server.queue.calls.find((c) => c.number === 2)!.called_at
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByTestId('my-call'))
    expect(confirm).toHaveBeenCalled()
    confirm.mockRestore()
    expect(server.queue.calls.find((c) => c.number === 2)!.called_at).toBe(firstCall)
  })

  test('다시 부른 번호는 큰 화면에 "다시 부름"으로 표시된다', async () => {
    const server = makeServer()
    const display = makeDevice(server)
    await renderApp(display.engine, '/queue')
    const staff = makeDevice(server, { name: '김다희' })
    await act(async () => { await staff.engine.callNext(); await staff.engine.callNext(); await staff.engine.recall(1) })
    await waitFor(() => expect(screen.getByTestId('display-now')).toHaveTextContent('1'))
    expect(screen.getByTestId('display-recall')).toBeInTheDocument()
    expect(screen.getByTestId('display-next')).toHaveTextContent('3번')
  })
})

test('노트북 4대가 동시에 20번 누르면: 번호는 1~20 한 번씩, 모든 화면이 결국 20번을 본다', async () => {
  const server = makeServer()
  const names = ['강하연', '김다희', '김도영', '김성정']
  const devices = names.map((name) => makeDevice(server, { name }))
  // 조회 응답이 0~15ms 사이 아무 때나 도착하도록 (순서 뒤섞임)
  let seed = 3
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  for (const d of devices) {
    const real = d.remote.fetchQueue.bind(d.remote)
    d.remote.fetchQueue = async () => { const s = await real(); await new Promise((r) => setTimeout(r, rnd() * 15)); return s }
    await d.engine.start({ intervalMs: 0, backupMs: 0 })
  }
  const got = await Promise.all(Array.from({ length: 20 }, (_, i) => devices[i % 4].engine.callNext()))
  expect([...got].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
  await new Promise((r) => setTimeout(r, 50))
  for (const d of devices) expect(d.engine.queue?.last_called).toBe(20)
  for (const d of devices) d.engine.stop()
})

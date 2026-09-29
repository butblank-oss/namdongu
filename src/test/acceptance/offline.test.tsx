import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppDB } from '../../lib/db'
import { Engine } from '../../lib/engine'
import { makeDevice, makeServer, renderApp } from '../helpers'
import { completeSurvey, goOffline, goOnline } from './flow'

describe('오프라인', () => {
  test('#14 #15 네트워크를 끊고 설문을 끝까지 완료할 수 있고, 상단에 오프라인 · 대기 N건이 보인다', async () => {
    const server = makeServer()
    const { engine, remote, db } = makeDevice(server)
    await renderApp(engine)
    const user = userEvent.setup()

    goOffline(remote)
    expect(screen.getByTestId('net-status')).toHaveTextContent('오프라인 · 대기 0건')

    await completeSurvey(user, '1234')
    const rows = await db.responses.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('done')
    expect(rows[0]._dirty).toBe(1)
    expect(server.responses.size).toBe(0)
    await waitFor(() => expect(screen.getByTestId('net-status')).toHaveTextContent('오프라인 · 대기 1건'))
  })

  test('#16 네트워크가 돌아오면 자동으로 동기화되고 대기 건수가 0이 된다', async () => {
    const server = makeServer()
    const { engine, remote, db } = makeDevice(server)
    await renderApp(engine)
    const user = userEvent.setup()

    goOffline(remote)
    await completeSurvey(user, '8801')
    await waitFor(() => expect(screen.getByTestId('net-status')).toHaveTextContent('대기 1건'))

    goOnline(remote)
    await waitFor(() => expect(screen.getByTestId('net-status')).toHaveTextContent('동기화됨 · 대기 0건'))
    const [local] = await db.responses.toArray()
    expect(local._dirty).toBe(0)
    expect(server.responses.get(local.id)?.status).toBe('done')
    // 오프라인 중 쌓인 열람 기록도 올라간다
    expect(server.accessLog.map((e) => e.action)).toEqual(expect.arrayContaining(['view', 'verify']))
  })

  test('#17 탭을 새로고침해도 오프라인 입력 내용이 남아 있다', async () => {
    const server = makeServer()
    const dbName = `reload-${Math.random()}`
    const first = makeDevice(server, { dbName })
    const { unmount } = await renderApp(first.engine)
    const user = userEvent.setup()

    goOffline(first.remote)
    await completeSurvey(user, '5555')
    unmount()
    first.db.close()

    // 새로고침: 같은 IndexedDB 를 새 엔진이 연다 (여전히 오프라인)
    const db = new AppDB(dbName)
    const engine = new Engine(first.remote, { intervalMs: 0, backupMs: 0, db, deviceId: first.engine.device })
    await renderApp(engine)
    const rows = await db.responses.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('done')
    expect(rows[0].answers.consent).toBe('동의')
    await waitFor(() => expect(screen.getByTestId('net-status')).toHaveTextContent('오프라인 · 대기 1건'))
  })

  test('5분 백업: 스냅샷에 전체 응답이 저장된다', async () => {
    const server = makeServer()
    const { engine, db } = makeDevice(server)
    await engine.start()
    await engine.createResponse({ participant: server.participants[0], track: 'A', verified: 'ok' })
    await engine.backupSnapshot()
    const snaps = await db.snapshots.toArray()
    expect(snaps).toHaveLength(1)
    expect(snaps[0].responses).toHaveLength(1)
    engine.stop()
  })
})

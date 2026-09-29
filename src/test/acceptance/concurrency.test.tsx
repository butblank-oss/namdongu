import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'

describe('입력 안정성 · 동시 작업', () => {
  test('#10 입력 중 서버에서 같은 레코드의 이전 버전이 와도 로컬 입력값이 덮어써지지 않는다', async () => {
    const server = makeServer()
    const { engine, remote, db } = makeDevice(server)
    await renderApp(engine)
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('검색'), '8800')
    await user.click((await screen.findAllByTestId('result-row'))[0])
    await user.click(await screen.findByRole('button', { name: '본인 확인 완료' }))
    await screen.findByTestId('survey-step')
    const [created] = await db.responses.toArray()
    await waitFor(async () => expect(server.responses.get(created.id)).toBeTruthy())
    const stale = structuredClone(server.responses.get(created.id)!)

    // 오프라인에서 입력 → 로컬만 dirty
    remote.online = false
    await user.click(screen.getByRole('radio', { name: '동의' }))
    await waitFor(async () => expect((await db.responses.get(created.id))?.answers.consent).toBe('동의'))

    // 서버가 예전 버전(동의 없음)을 푸시
    await act(async () => { remote.handlers!.onResponse({ ...stale, answers: {} }) })
    await act(async () => { remote.handlers!.onResponse({ ...stale, answers: {}, client_rev: 999 }) })

    const local = await db.responses.get(created.id)
    expect(local?.answers.consent).toBe('동의')
    expect(local?._dirty).toBe(1)
    expect(screen.getByRole('radio', { name: '동의' })).toHaveAttribute('aria-checked', 'true')
  })

  test('#10 mergeRemote: 동기화 대기 중이면 무시, 깨끗하면 최신 rev만 반영', async () => {
    const server = makeServer()
    const { engine, db } = makeDevice(server)
    const r = await engine.createResponse({ participant: server.participants[0], track: 'A', verified: 'ok' })
    expect(await engine.mergeRemote({ ...r, answers: { x: 'server' }, client_rev: 50 })).toBe('ignored')
    await db.responses.update(r.id, { _dirty: 0 })
    expect(await engine.mergeRemote({ ...r, answers: { x: 'old' }, client_rev: 0 })).toBe('ignored')
    expect(await engine.mergeRemote({ ...r, answers: { x: 'new' }, client_rev: 5 })).toBe('applied')
    expect((await db.responses.get(r.id))?.answers.x).toBe('new')
  })

  test('#18 두 기기에서 같은 어르신을 열면 나중에 연 쪽에 경고가 뜬다', async () => {
    const server = makeServer()
    const a = makeDevice(server, { name: '김다희' })
    await a.engine.start()
    const pid = server.participants[1].id // 김*순 1234
    a.engine.openParticipant(pid)

    const b = makeDevice(server, { name: '노준성' })
    await renderApp(b.engine)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('검색'), '1234')
    await user.click((await screen.findAllByTestId('result-row'))[0])
    const warn = await screen.findByTestId('conflict-warning')
    expect(warn).toHaveTextContent('김다희')

    // 먼저 연 쪽(A)에는 경고 대상이 없다
    expect(b.engine.othersOpening(pid)).toHaveLength(1)
    expect(a.engine.othersOpening(pid)).toHaveLength(0)
    a.engine.stop()
  })

  test('#18 다른 직원이 진행 중인 응답이 있으면 화면을 닫았어도 경고가 뜬다', async () => {
    const server = makeServer()
    const a = makeDevice(server, { name: '김다희' })
    await a.engine.start()
    await a.engine.createResponse({ participant: server.participants[1], track: 'B', verified: 'ok' })
    await a.engine.syncNow()
    a.engine.stop()

    const b = makeDevice(server, { name: '노준성' })
    await renderApp(b.engine, `/p/${server.participants[1].id}`)
    const warn = await screen.findByTestId('conflict-warning')
    expect(warn).toHaveTextContent('김다희님이 이 어르신 설문을 진행 중입니다')

    // 이어받기 → 본인 확인 → 같은 응답을 이어서 쓴다
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '이어받기' }))
    await user.type(screen.getByLabelText('어르신이 말한 뒷 4자리'), '1234')
    await user.click(screen.getByRole('button', { name: '본인 확인 완료' }))
    await screen.findByTestId('survey-step')
    const rows = await b.db.responses.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].entered_by).toBe('노준성')
  })

  test('#19 한쪽에서 완료하면 다른 쪽 목록에 즉시 반영된다', async () => {
    const server = makeServer()
    const a = makeDevice(server, { name: '김다희' })
    await a.engine.start()

    const b = makeDevice(server, { name: '노준성' })
    await renderApp(b.engine)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('검색'), '1234')
    const row = (await screen.findAllByTestId('result-row'))[0]
    expect(row).toHaveTextContent('미착수')

    await act(async () => {
      const r = await a.engine.createResponse({ participant: server.participants[1], track: 'B', verified: 'ok' })
      await a.engine.updateResponse(r.id, (x) => ({ ...x, status: 'done', completed_at: new Date().toISOString() }))
      await a.engine.syncNow()
    })
    await waitFor(() => expect(within(screen.getAllByTestId('result-row')[0]).getByText(/완료 · 김다희/)).toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('progress-B')).toHaveTextContent('1/2'))
    a.engine.stop()
  })

  test('오프라인 중 같은 어르신 응답이 두 기기에서 생기면 서버 레코드로 합쳐지고 이후 입력도 유지된다', async () => {
    const server = makeServer()
    const pid = server.participants[0]
    const a = makeDevice(server, { name: '김다희' })
    await a.engine.start()
    a.remote.online = false
    const ra = await a.engine.createResponse({ participant: pid, track: 'A', verified: 'ok' })
    await a.engine.updateResponse(ra.id, (r) => ({ ...r, answers: { ...r.answers, a_freq: '거의 매일' } }))

    const b = makeDevice(server, { name: '노준성' })
    await b.engine.start()
    const rb = await b.engine.createResponse({ participant: pid, track: 'A', verified: 'ok' })
    await b.engine.syncNow()
    expect(server.responses.has(rb.id)).toBe(true)

    a.remote.online = true
    await a.engine.syncNow() // DUPLICATE → 서버 id 로 합침
    expect(a.engine.resolveId(ra.id)).toBe(rb.id)
    // 화면은 옛 id 를 들고 있어도 계속 저장된다
    await a.engine.updateResponse(ra.id, (r) => ({ ...r, answers: { ...r.answers, memo: '이어서 입력' } }))
    await a.engine.syncNow()
    expect(a.engine.status.pending).toBe(0)
    const merged = server.responses.get(rb.id)!
    expect(merged.answers).toMatchObject({ a_freq: '거의 매일', memo: '이어서 입력' })
    expect([...server.responses.values()].filter((r) => r.participant_id === pid.id)).toHaveLength(1)
    a.engine.stop(); b.engine.stop()
  })
})

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_PAYLOAD } from '../../lib/defaultSchema'
import type { SurveyPayload } from '../../lib/types'
import { FIXTURE, makeDevice, makeServer, renderApp } from '../helpers'

beforeEach(() => { sessionStorage.clear() })

describe('권한', () => {
  test('#20 operator 에게는 설문지 편집 버튼이 없고 /admin 은 검색 화면으로 돌아간다', async () => {
    const { engine } = makeDevice(makeServer(), { name: '김다희', role: 'operator' })
    await renderApp(engine)
    expect(screen.getByLabelText('검색')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '설문지 편집' })).not.toBeInTheDocument()
  })

  test('#20 operator 가 /admin 으로 들어가면 검색 화면으로 리다이렉트', async () => {
    const { engine } = makeDevice(makeServer(), { name: '김다희', role: 'operator' })
    await renderApp(engine, '/admin')
    expect(await screen.findByLabelText('검색')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '설문지 편집' })).not.toBeInTheDocument()
    expect(screen.queryByText('설문지 편집')).not.toBeInTheDocument()
  })

  test('#20 (대조) admin 은 /admin 에 들어갈 수 있다', async () => {
    const { engine } = makeDevice(makeServer())
    await renderApp(engine, '/admin')
    expect(await screen.findByRole('heading', { name: '설문지 편집' })).toBeInTheDocument()
  })
})

describe('잠금', () => {
  test('#21 잠금 상태에서 저장은 거부되고 FakeRemote.saveSchema 는 호출되지 않으며 안내가 뜬다', async () => {
    const server = makeServer()
    server.schema!.locked = true
    const { engine, remote } = makeDevice(server)
    await renderApp(engine, '/admin')
    await screen.findByRole('heading', { name: '설문지 편집' })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /저장/ }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('잠금')
    expect(remote.calls).not.toContain('saveSchema')
    expect(server.schema!.version).toBe(1)
  })

  test('#21 engine.saveSchema 는 LOCKED 로 거부된다', async () => {
    const server = makeServer()
    server.schema!.locked = true
    const { engine, remote } = makeDevice(server)
    await engine.start()
    await expect(engine.saveSchema(structuredClone(DEFAULT_PAYLOAD))).rejects.toMatchObject({ code: 'LOCKED' })
    expect(remote.calls).not.toContain('saveSchema')
  })

  test('#21 서버 쪽 방어: remote.saveSchema 직접 호출도 LOCKED', async () => {
    const server = makeServer()
    server.schema!.locked = true
    const { remote } = makeDevice(server)
    await expect(remote.saveSchema(structuredClone(DEFAULT_PAYLOAD), { updatedBy: '강하연' })).rejects.toMatchObject({ code: 'LOCKED' })
    expect(server.schema!.version).toBe(1)
  })

  test('#21 잠금 해제는 두 번 확인해야 한다', async () => {
    const server = makeServer()
    server.schema!.locked = true
    const { engine } = makeDevice(server)
    await renderApp(engine, '/admin')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('tab', { name: '행사 잠금' }))
    await user.click(screen.getByRole('button', { name: '잠금 해제…' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(server.schema!.locked).toBe(true)

    await user.click(screen.getByRole('button', { name: '계속' }))
    const finalBtn = screen.getByRole('button', { name: '잠금 해제' })
    expect(finalBtn).toBeDisabled()
    expect(server.schema!.locked).toBe(true)

    await user.type(screen.getByLabelText('확인 문구'), '잠금 해제')
    expect(finalBtn).toBeEnabled()
    expect(server.schema!.locked).toBe(true)
    await user.click(finalBtn)
    await waitFor(() => expect(server.schema!.locked).toBe(false))
  })
})

describe('key 보호', () => {
  async function withAnswer() {
    const server = makeServer()
    const dev = makeDevice(server)
    await dev.engine.start()
    const r = await dev.engine.createResponse({ participant: FIXTURE[0], track: 'A', verified: 'ok' })
    await dev.engine.updateResponse(r.id, (x) => ({ ...x, answers: { ...x.answers, a_freq: '거의 매일' } }))
    await dev.engine.syncNow()
    await waitFor(() => expect(server.responses.get(r.id)?.answers.a_freq).toBe('거의 매일'))
    return { server, ...dev }
  }

  test('#22 응답이 있는 a_freq 는 key 변경·삭제가 막히고 경고가 뜬다', async () => {
    const { engine } = await withAnswer()
    await renderApp(engine, '/admin')
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^활동 중/ }))
    const keyInput = () => screen.getAllByLabelText('key').find((i) => (i as HTMLInputElement).value === 'a_freq') as HTMLInputElement
    expect(keyInput()).toBeTruthy()

    await user.type(keyInput(), 'x')
    expect(keyInput()).toBeTruthy()
    expect(keyInput().value).toBe('a_freq')
    expect(await screen.findByRole('alert')).toHaveTextContent('key')

    const li = keyInput().closest('li') as HTMLElement
    await user.click(within(li).getByRole('button', { name: '삭제' }))
    expect(keyInput()).toBeTruthy()
    expect(screen.getByRole('alert')).toHaveTextContent('삭제할 수 없습니다')
  })

  test('#22 서버 쪽: a_freq 가 빠진 스키마 저장은 KEY_IN_USE 로 거부', async () => {
    const { remote, server } = await withAnswer()
    const payload: SurveyPayload = structuredClone(DEFAULT_PAYLOAD)
    payload.sections.A = payload.sections.A.filter((q) => q.key !== 'a_freq')
    await expect(remote.saveSchema(payload, { updatedBy: '강하연' })).rejects.toMatchObject({ code: 'KEY_IN_USE' })
    expect(server.schema!.version).toBe(1)
  })
})

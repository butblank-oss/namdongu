import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { EngineContext } from '../../app/context'
import type { Engine } from '../../lib/engine'
import type { Participant, Status } from '../../lib/types'
import { ResponseListScreen } from '../../screens/ResponseListScreen'
import { FIXTURE, makeDevice, makeServer } from '../helpers'

async function seed(engine: Engine, p: Participant, status: Status) {
  const r = await engine.createResponse({ participant: p, track: p.track, verified: 'ok' })
  await engine.updateResponse(r.id, (x) => ({ ...x, status, completed_at: status === 'in_progress' ? null : new Date().toISOString() }))
  return r.id
}

async function setup(name = '강하연') {
  const server = makeServer()
  const { engine } = makeDevice(server, { name })
  await engine.start()
  await seed(engine, FIXTURE[0], 'done') // 8800
  await seed(engine, FIXTURE[1], 'in_progress') // 1234
  const id3 = await seed(engine, FIXTURE[3], 'done') // 1880
  render(
    <EngineContext.Provider value={engine}>
      <MemoryRouter initialEntries={['/list']}>
        <Routes>
          <Route path="/list" element={<ResponseListScreen />} />
          <Route path="/r/:rid" element={<div>opened</div>} />
        </Routes>
      </MemoryRouter>
    </EngineContext.Provider>,
  )
  return { engine, id3, server }
}

test('상태 필터와 검색', async () => {
  await setup()
  const user = userEvent.setup()
  expect(await screen.findAllByTestId('list-row')).toHaveLength(3)
  await user.click(within(screen.getByRole('group', { name: '상태' })).getByRole('button', { name: '완료 2' }))
  expect(screen.getAllByTestId('list-row')).toHaveLength(2)
  await user.click(within(screen.getByRole('group', { name: '상태' })).getByRole('button', { name: '전체 3' }))
  expect(screen.getAllByTestId('list-row')).toHaveLength(3)
  await user.type(screen.getByLabelText('목록 검색'), '1234')
  const rows = screen.getAllByTestId('list-row')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toHaveTextContent('김*순')
  expect(rows[0]).toHaveTextContent('진행중')
})

test('행 클릭 시 /r/<id> 로 이동하고 게이트 통과', async () => {
  const { engine, id3 } = await setup()
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('목록 검색'), '1880')
  await user.click(screen.getAllByTestId('list-row')[0])
  expect(await screen.findByText('opened')).toBeInTheDocument()
  expect(engine.passedGate.has(id3)).toBe(true)
})

test('빈 상태', async () => {
  const { engine } = makeDevice(makeServer())
  await engine.start()
  render(<EngineContext.Provider value={engine}><MemoryRouter><ResponseListScreen /></MemoryRouter></EngineContext.Provider>)
  expect(await screen.findByText('아직 응답이 없습니다')).toBeInTheDocument()
})

test('상태별로 나눠 보이고, 체크해서 여러 건을 한 번에 삭제하면 목록 화면에 그대로 남는다', async () => {
  const { engine, server } = await setup()
  const user = userEvent.setup()
  await screen.findAllByTestId('list-row')
  expect(within(screen.getByTestId('group-in_progress')).getAllByTestId('list-row')).toHaveLength(1)
  expect(within(screen.getByTestId('group-done')).getAllByTestId('list-row')).toHaveLength(2)

  // 완료 묶음 전체 선택 → 2건
  await user.click(screen.getByRole('checkbox', { name: '완료 전체 선택' }))
  expect(screen.getByTestId('selected-count')).toHaveTextContent('2건 선택됨')
  // 체크박스를 눌러도 응답이 열리지 않는다
  expect(screen.queryByText('opened')).not.toBeInTheDocument()

  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: '선택 삭제' }))
  confirm.mockRestore()
  await waitFor(() => expect(screen.getAllByTestId('list-row')).toHaveLength(1))
  expect(screen.getByText('2건을 삭제했습니다.')).toBeInTheDocument()
  expect(screen.getByTestId('list-count')).toHaveTextContent('1건')
  const deleted = (await engine.db.responses.toArray()).filter((r) => r.deleted_at)
  expect(deleted).toHaveLength(2)
  await engine.syncNow()
  const logs = [...server.accessLog, ...await engine.db.accessQueue.toArray()]
  expect(logs.filter((l) => l.action === 'delete')).toHaveLength(2)
})

test('전체 선택 · 선택 해제', async () => {
  await setup()
  const user = userEvent.setup()
  await screen.findAllByTestId('list-row')
  await user.click(screen.getByRole('checkbox', { name: '보이는 목록 전체 선택' }))
  expect(screen.getByTestId('selected-count')).toHaveTextContent('3건 선택됨')
  await user.click(screen.getByRole('button', { name: '선택 해제' }))
  expect(screen.getByTestId('selected-count')).toHaveTextContent('선택한 응답 없음')
})

test('담당자(관리자 아님)는 선택 삭제 버튼이 꺼져 있다', async () => {
  await setup('김다희')
  const user = userEvent.setup()
  await screen.findAllByTestId('list-row')
  await user.click(screen.getByRole('checkbox', { name: '보이는 목록 전체 선택' }))
  expect(screen.getByRole('button', { name: '선택 삭제' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '선택 내보내기' })).toBeEnabled()
})

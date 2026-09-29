import { render, screen, within } from '@testing-library/react'
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

async function setup() {
  const { engine } = makeDevice(makeServer())
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
  return { engine, id3 }
}

test('상태 필터와 검색', async () => {
  await setup()
  const user = userEvent.setup()
  expect(await screen.findAllByTestId('list-row')).toHaveLength(3)
  await user.click(screen.getByRole('button', { name: '완료' }))
  expect(screen.getAllByTestId('list-row')).toHaveLength(2)
  await user.click(within(screen.getByRole('group', { name: '상태' })).getByRole('button', { name: '전체' }))
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

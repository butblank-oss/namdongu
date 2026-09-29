import { render, screen, waitFor } from '@testing-library/react'
import { App } from '../app/App'
import { AppDB } from '../lib/db'
import { DEFAULT_PAYLOAD } from '../lib/defaultSchema'
import { Engine } from '../lib/engine'
import { FakeRemote, FakeServer, makeFakeStaff } from '../lib/fakeRemote'
import type { Participant } from '../lib/types'

export function P(id: number, name: string, phone: string, track: Participant['track'] = 'A', extra: Partial<Participant> = {}): Participant {
  return {
    id: `11111111-0000-4000-8000-${String(id).padStart(12, '0')}`,
    name_masked: name, phone_last4: phone, birth_year: '1948', age_group: '70', sex: 'F',
    days_since_last_activity: track === 'A' ? 3 : track === 'B' ? 60 : null,
    total_activity_cnt: track === 'B' ? 40 : 5, cohort: '3', track, snapshot_date: '2026-09-14', ...extra,
  }
}

/** 테스트용 가짜 명단 (실데이터 아님) */
export const FIXTURE: Participant[] = [
  P(1, '간*자', '8800', 'A'),
  P(2, '김*순', '1234', 'B'),
  P(3, '이*희', '8801', 'C'),
  P(4, '박*호', '1880', 'A'),
  P(5, '간*숙', '5555', 'B'),
  P(6, '최*자', '8800', 'C'),
  P(7, '정*옥', '0420', 'C'),
]

let dbSeq = 0

export function makeServer(participants: Participant[] = FIXTURE) {
  const server = new FakeServer()
  server.participants = structuredClone(participants)
  server.staff = makeFakeStaff()
  server.schema = { version: 1, payload: structuredClone(DEFAULT_PAYLOAD), locked: false, updated_by: null, updated_at: '' }
  return server
}

/** 기기 하나: 자기 IndexedDB + 원격 연결 + 엔진 */
export function makeDevice(server: FakeServer, opts: { name?: string; role?: 'admin' | 'operator'; dbName?: string } = {}) {
  const name = opts.name ?? '강하연'
  const role = opts.role ?? (name === '강하연' ? 'admin' : 'operator')
  const staff = server.staff.find((s) => s.name === name)
  if (staff) staff.role = role
  const db = new AppDB(opts.dbName ?? `test-${++dbSeq}-${Math.random()}`)
  const remote = new FakeRemote(server, { role, name })
  const engine = new Engine(remote, { intervalMs: 0, backupMs: 0, db, deviceId: `device-${dbSeq}-${name}` })
  engine.setMe(name)
  return { remote, engine, db }
}

export async function renderApp(engine: Engine, path = '/') {
  const utils = render(<App engine={engine} memory initialPath={path} />)
  await waitFor(() => expect(screen.queryByText('불러오는 중…')).not.toBeInTheDocument())
  return utils
}

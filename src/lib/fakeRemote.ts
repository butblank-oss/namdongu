// 메모리 안의 가짜 서버. 테스트와 로컬 데모 모드에서만 쓴다 (실데이터 없음).
import { RemoteError, toServerRow, type PresenceInfo, type Remote, type RemoteHandlers } from './remote'
import { allQuestionKeys } from './survey'
import type { AccessLogEntry, Participant, ResponseRow, Staff, SurveyPayload, SurveySchema } from './types'

export class FakeServer {
  participants: Participant[] = []
  responses = new Map<string, ResponseRow>()
  accessLog: AccessLogEntry[] = []
  schema: SurveySchema | null = null
  staff: Staff[] = []
  clients = new Set<FakeRemote>()
  presence = new Map<FakeRemote, PresenceInfo>()
  private tick = 0

  now(): string {
    // 같은 밀리초에 여러 번 써도 순서가 보장되도록
    this.tick++
    return new Date(Date.UTC(2026, 9, 30, 0, 0, 0) + this.tick).toISOString()
  }

  broadcastResponse(row: ResponseRow) {
    for (const c of this.clients) c.handlers?.onResponse(structuredClone(row))
  }
  broadcastSchema() {
    for (const c of this.clients) if (this.schema) c.handlers?.onSchema(structuredClone(this.schema))
  }
  broadcastPresence() {
    const list = [...this.presence.values()]
    for (const c of this.clients) c.handlers?.onPresence(structuredClone(list))
  }
}

export class FakeRemote implements Remote {
  online = true
  handlers: RemoteHandlers | null = null
  calls: string[] = []

  constructor(public server: FakeServer, public me: { role: 'admin' | 'operator'; name: string } = { role: 'admin', name: '강하연' }) {}

  private guard(name: string) {
    this.calls.push(name)
    if (!this.online) throw new RemoteError('NETWORK', 'offline')
  }

  async fetchParticipants() { this.guard('fetchParticipants'); return structuredClone(this.server.participants) }

  async fetchResponsesSince(since: string | null) {
    this.guard('fetchResponsesSince')
    return [...this.server.responses.values()]
      .filter((r) => !since || r.updated_at > since)
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
      .map((r) => structuredClone(r))
  }

  async fetchResponseByParticipant(pid: string) {
    this.guard('fetchResponseByParticipant')
    const r = [...this.server.responses.values()].find((x) => x.participant_id === pid && !x.deleted_at)
    return r ? structuredClone(r) : null
  }

  async fetchResponse(id: string) {
    this.guard('fetchResponse')
    const r = this.server.responses.get(id)
    return r ? structuredClone(r) : null
  }

  async upsertResponse(input: ResponseRow) {
    this.guard('upsertResponse')
    const row = toServerRow(structuredClone(input))
    const old = this.server.responses.get(row.id)
    if (old && row.client_rev < old.client_rev) throw new RemoteError('STALE_REV', 'stale')
    if (row.participant_id && !row.deleted_at) {
      const dup = [...this.server.responses.values()].find(
        (x) => x.id !== row.id && x.participant_id === row.participant_id && !x.deleted_at,
      )
      if (dup) throw new RemoteError('DUPLICATE', 'duplicate participant')
    }
    row.updated_at = this.server.now()
    this.server.responses.set(row.id, row)
    this.server.broadcastResponse(row)
    return structuredClone(row)
  }

  async insertAccessLogs(entries: AccessLogEntry[]) {
    this.guard('insertAccessLogs')
    this.server.accessLog.push(...structuredClone(entries))
  }

  async fetchSchema() { this.guard('fetchSchema'); return this.server.schema ? structuredClone(this.server.schema) : null }

  async saveSchema(payload: SurveyPayload, opts: { updatedBy: string; create?: boolean }) {
    this.guard('saveSchema')
    if (this.me.role !== 'admin') throw new RemoteError('FORBIDDEN', 'forbidden')
    const s = this.server
    if (opts.create && !s.schema) {
      s.schema = { version: 1, payload: structuredClone(payload), locked: false, updated_by: opts.updatedBy, updated_at: s.now() }
    } else {
      if (!s.schema) throw new RemoteError('UNKNOWN', 'no schema')
      if (s.schema.locked) throw new RemoteError('LOCKED', 'locked')
      const keys = new Set(allQuestionKeys(payload))
      for (const r of s.responses.values()) {
        if (r.deleted_at) continue
        const missing = Object.keys(r.answers).find((k) => !keys.has(k))
        if (missing) throw new RemoteError('KEY_IN_USE', missing)
      }
      s.schema = { ...s.schema, version: s.schema.version + 1, payload: structuredClone(payload), updated_by: opts.updatedBy, updated_at: s.now() }
    }
    s.broadcastSchema()
    return structuredClone(s.schema)
  }

  async setSchemaLocked(locked: boolean, updatedBy: string) {
    this.guard('setSchemaLocked')
    if (this.me.role !== 'admin') throw new RemoteError('FORBIDDEN', 'forbidden')
    const s = this.server
    if (!s.schema) throw new RemoteError('UNKNOWN', 'no schema')
    s.schema = { ...s.schema, locked, updated_by: updatedBy, updated_at: s.now() }
    s.broadcastSchema()
    return structuredClone(s.schema)
  }

  async fetchStaff() { this.guard('fetchStaff'); return structuredClone(this.server.staff) }

  async upsertStaff(rows: Partial<Staff>[]) {
    this.guard('upsertStaff')
    if (this.me.role !== 'admin') throw new RemoteError('FORBIDDEN', 'forbidden')
    for (const r of rows) {
      const i = this.server.staff.findIndex((x) => x.id === r.id)
      if (i >= 0) this.server.staff[i] = { ...this.server.staff[i], ...r }
      else this.server.staff.push({ id: crypto.randomUUID(), name: '', active: true, role: 'operator', auth_user_id: null, ...r })
    }
    for (const c of this.server.clients) c.handlers?.onStaff()
  }

  async fetchMyStaff() {
    this.guard('fetchMyStaff')
    return this.server.staff.find((s) => s.name === this.me.name) ?? null
  }

  subscribe(h: RemoteHandlers) {
    this.handlers = h
    this.server.clients.add(this)
    return () => {
      this.server.clients.delete(this)
      this.server.presence.delete(this)
      this.handlers = null
    }
  }

  trackPresence(info: PresenceInfo | null) {
    if (info) this.server.presence.set(this, info)
    else this.server.presence.delete(this)
    this.server.broadcastPresence()
  }
}

// ── 데모용 가짜 명단 ─────────────────────────────
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '간', '한', '오', '서', '신']
const LASTS = ['자', '순', '희', '숙', '자', '옥', '호', '수', '식', '철', '영', '남']

export function makeFakeParticipants(n: number, seed = 7): Participant[] {
  let x = seed
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648 }
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)]
  const out: Participant[] = []
  for (let i = 0; i < n; i++) {
    const dsl = rnd() < 0.3 ? null : Math.floor(rnd() * 120)
    const tot = Math.floor(rnd() * 60)
    const track = dsl == null ? 'C' : dsl <= 30 ? 'A' : tot > 20 ? 'B' : 'C'
    out.push({
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      name_masked: `${pick(SURNAMES)}*${pick(LASTS)}`,
      phone_last4: String(Math.floor(rnd() * 10000)).padStart(4, '0'),
      birth_year: rnd() < 0.1 ? null : String(1935 + Math.floor(rnd() * 25)),
      age_group: pick(['60', '70', '80', '90', '?']),
      sex: pick(['F', 'F', 'M', '?'] as const),
      days_since_last_activity: dsl,
      total_activity_cnt: tot,
      cohort: '3',
      track,
      snapshot_date: '2026-09-14',
    })
  }
  return out
}

export const DEFAULT_STAFF_NAMES = [
  '강하연', '김다희', '김도영', '김성정', '김소리', '김철순', '노준성', '박유라', '안성호', '윤종훈', '이승민', '이용혁', '홍지혜',
]

export function makeFakeStaff(): Staff[] {
  return DEFAULT_STAFF_NAMES.map((name, i) => ({
    id: `staff-${i}`, name, active: true, role: i === 0 ? 'admin' : 'operator', auth_user_id: null,
  }))
}

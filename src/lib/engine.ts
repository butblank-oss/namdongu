import { db, KV_PULL_CURSOR, KV_SCHEMA, KV_STAFF } from './db'
import { DEFAULT_PAYLOAD } from './defaultSchema'
import { RemoteError, toServerRow, type PresenceInfo, type Remote } from './remote'
import type {
  AccessAction, LocalResponse, ManualInfo, Participant, ResponseRow, Staff, SurveyPayload, SurveySchema, Track, Verified,
} from './types'

export interface SyncStatus {
  online: boolean
  pending: number
  syncing: boolean
  lastSyncAt: string | null
  lastError: string | null
}

const DEVICE_KEY = 'namdongu.deviceId'
const ME_KEY = 'namdongu.me'

function safeLocal(): Storage | null {
  try { return window.localStorage } catch { return null }
}

export function deviceId(): string {
  const ls = safeLocal()
  let id = ls?.getItem(DEVICE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    ls?.setItem(DEVICE_KEY, id)
  }
  return id
}

export function nowIso(): string {
  return new Date().toISOString()
}

type Listener = () => void

const GATE_KEY = 'namdongu.gate'
class GateSet {
  private ids: Set<string>
  constructor() {
    let saved: string[] = []
    try { saved = JSON.parse(sessionStorage.getItem(GATE_KEY) ?? '[]') } catch { /* 무시 */ }
    this.ids = new Set(saved)
  }
  has(id: string) { return this.ids.has(id) }
  add(id: string) {
    this.ids.add(id)
    try { sessionStorage.setItem(GATE_KEY, JSON.stringify([...this.ids])) } catch { /* 무시 */ }
  }
}

/**
 * 로컬 우선 저장 + 백그라운드 동기화.
 * - 모든 쓰기는 IndexedDB 에 먼저 들어가고 _dirty=1 로 표시된다.
 * - 서버 데이터는 _dirty 레코드를 절대 덮어쓰지 않는다 (mergeRemote).
 */
export class Engine {
  status: SyncStatus = { online: true, pending: 0, syncing: false, lastSyncAt: null, lastError: null }
  schema: SurveySchema = { version: 0, payload: DEFAULT_PAYLOAD, locked: false, updated_by: null, updated_at: '' }
  staff: Staff[] = []
  myStaff: Staff | null = null
  presence: PresenceInfo[] = []
  me: string | null = safeLocal()?.getItem(ME_KEY) ?? null
  readonly device = deviceId()
  /** 이 탭에서 본인 확인 관문을 통과한 응답 id. 통과 전에는 문항을 보여 주지 않는다 (새로고침에도 유지) */
  readonly passedGate = new GateSet()

  private listeners = new Set<Listener>()
  private unsub: (() => void) | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private backupTimer: ReturnType<typeof setInterval> | null = null
  private flushing: Promise<void> | null = null
  private onOnline = () => { this.setStatus({ online: true }); void this.syncNow() }
  private onOffline = () => this.setStatus({ online: false })

  constructor(public remote: Remote) {}

  // ── 구독 (React useSyncExternalStore) ─────────────
  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l) } }
  private version = 0
  getVersion = () => this.version
  private emit() { this.version++; for (const l of this.listeners) l() }
  private setStatus(p: Partial<SyncStatus>) { this.status = { ...this.status, ...p }; this.emit() }

  setMe(name: string) {
    this.me = name
    safeLocal()?.setItem(ME_KEY, name)
    this.emit()
  }

  get isAdmin(): boolean { return this.myStaff?.role === 'admin' && this.myStaff.active }

  // ── 시작/종료 ───────────────────────────────────
  private gen = 0

  async start(opts: { intervalMs?: number; backupMs?: number } = {}) {
    const gen = ++this.gen
    const cachedSchema = await db.getKV<SurveySchema>(KV_SCHEMA)
    if (cachedSchema) this.schema = cachedSchema
    this.staff = (await db.getKV<Staff[]>(KV_STAFF)) ?? []
    await this.refreshPending()
    if (typeof navigator !== 'undefined') this.status.online = navigator.onLine
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onOnline)
      window.addEventListener('offline', this.onOffline)
    }
    if (gen !== this.gen) return
    this.unsub = this.remote.subscribe({
      onResponse: (r) => { void this.mergeRemote(r) },
      onSchema: (s) => { void this.applySchema(s) },
      onStaff: () => { void this.pullStaff() },
      onPresence: (list) => { this.presence = list; this.emit() },
    })
    this.emit()
    await this.fullPull()
    if (gen !== this.gen) return
    if (opts.intervalMs !== 0) this.timer = setInterval(() => void this.syncNow(), opts.intervalMs ?? 30_000)
    if (opts.backupMs !== 0) this.backupTimer = setInterval(() => void this.backupSnapshot(), opts.backupMs ?? 5 * 60_000)
  }

  stop() {
    this.gen++
    this.unsub?.()
    this.unsub = null
    if (this.timer) clearInterval(this.timer)
    if (this.backupTimer) clearInterval(this.backupTimer)
    this.timer = this.backupTimer = null
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.onOnline)
      window.removeEventListener('offline', this.onOffline)
    }
  }

  // ── 서버 → 로컬 ─────────────────────────────────
  private async guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      const v = await fn()
      if (!this.status.online) this.setStatus({ online: true })
      return v
    } catch (e) {
      if (e instanceof RemoteError && e.code === 'NETWORK') this.setStatus({ online: false })
      else this.setStatus({ lastError: (e as Error).message })
      return undefined
    }
  }

  async fullPull() {
    await this.guarded(async () => {
      const [participants, schema, myStaff] = await Promise.all([
        this.remote.fetchParticipants(),
        this.remote.fetchSchema(),
        this.remote.fetchMyStaff(),
      ])
      await db.transaction('rw', db.participants, async () => {
        await db.participants.clear()
        await db.participants.bulkPut(participants)
      })
      this.myStaff = myStaff
      if (schema) await this.applySchema(schema)
      else if (myStaff?.role === 'admin') {
        // 최초 1회: 내장 기본 설문을 서버에 올린다
        const created = await this.remote.saveSchema(DEFAULT_PAYLOAD, { updatedBy: this.me ?? myStaff.name, create: true })
        await this.applySchema(created)
      }
    })
    await this.pullStaff()
    await this.syncNow()
  }

  async pullStaff() {
    await this.guarded(async () => {
      this.staff = await this.remote.fetchStaff()
      await db.setKV(KV_STAFF, this.staff)
      this.emit()
    })
  }

  async applySchema(s: SurveySchema) {
    if (s.version < this.schema.version) return
    this.schema = s
    await db.setKV(KV_SCHEMA, s)
    this.emit()
  }

  /** 서버에서 온 응답을 로컬에 반영. 미동기화 로컬 변경이 있으면 무시한다 */
  async mergeRemote(remote: ResponseRow): Promise<'applied' | 'ignored'> {
    const result = await db.transaction('rw', db.responses, async () => {
      const local = await db.responses.get(remote.id)
      if (local?._dirty) return 'ignored' as const
      if (local && remote.client_rev < local.client_rev) return 'ignored' as const
      await db.responses.put({ ...remote, _dirty: 0, _server_rev: remote.client_rev })
      return 'applied' as const
    })
    if (result === 'applied') this.emit()
    return result
  }

  async pullResponses() {
    await this.guarded(async () => {
      const cursor = (await db.getKV<string>(KV_PULL_CURSOR)) ?? null
      const rows = await this.remote.fetchResponsesSince(cursor)
      let max = cursor
      for (const r of rows) {
        await this.mergeRemote(r)
        if (!max || r.updated_at > max) max = r.updated_at
      }
      if (max && max !== cursor) await db.setKV(KV_PULL_CURSOR, max)
    })
  }

  // ── 로컬 → 서버 ─────────────────────────────────
  async refreshPending() {
    const pending = await db.responses.where('_dirty').equals(1).count()
    if (pending !== this.status.pending) this.setStatus({ pending })
  }

  /** 대기 중인 변경을 올리고 서버 변경을 받는다. 동시에 한 번만 돈다 */
  syncNow(): Promise<void> {
    if (this.flushing) return this.flushing
    this.flushing = (async () => {
      this.setStatus({ syncing: true })
      try {
        await this.pushAccessLogs()
        await this.pushResponses()
        await this.pullResponses()
        if (this.status.online) this.setStatus({ lastSyncAt: nowIso() })
      } finally {
        await this.refreshPending()
        this.flushing = null
        this.setStatus({ syncing: false })
      }
    })()
    return this.flushing
  }

  private async pushAccessLogs() {
    const entries = await db.accessQueue.toArray()
    if (!entries.length) return
    const ok = await this.guarded(async () => { await this.remote.insertAccessLogs(entries); return true })
    if (ok) await db.accessQueue.bulkDelete(entries.map((e) => e.id))
  }

  private async pushResponses() {
    const dirty = await db.responses.where('_dirty').equals(1).toArray()
    for (const r of dirty) {
      const ok = await this.pushOne(r)
      if (ok === 'network') break
    }
  }

  private async pushOne(r: LocalResponse): Promise<'ok' | 'network' | 'error'> {
    try {
      const server = await this.remote.upsertResponse(toServerRow(r))
      if (!this.status.online) this.setStatus({ online: true })
      await db.transaction('rw', db.responses, async () => {
        const cur = await db.responses.get(r.id)
        // 올리는 사이에 새로 입력된 내용이 있으면 dirty 유지
        if (cur && cur.client_rev === r.client_rev) {
          await db.responses.put({ ...cur, updated_at: server.updated_at, _dirty: 0, _server_rev: server.client_rev })
        }
      })
      return 'ok'
    } catch (e) {
      if (!(e instanceof RemoteError)) { this.setStatus({ lastError: String(e) }); return 'error' }
      if (e.code === 'NETWORK') { this.setStatus({ online: false }); return 'network' }
      if (e.code === 'STALE_REV') {
        // 다른 기기가 더 뒤의 rev 를 올렸다. 지금 이 기기에서 입력 중인 내용을 우선한다
        const server = await this.remote.fetchResponse(r.id).catch(() => null)
        if (server) await this.bumpRev(r.id, server.client_rev + 1)
        return 'error'
      }
      if (e.code === 'DUPLICATE' && r.participant_id) {
        // 오프라인 중 다른 기기가 같은 어르신 응답을 먼저 만들었다 → 서버 레코드로 합친다
        const server = await this.remote.fetchResponseByParticipant(r.participant_id).catch(() => null)
        if (server) await this.adoptServerId(r.id, server)
        return 'error'
      }
      this.setStatus({ lastError: e.message })
      return 'error'
    }
  }

  private async bumpRev(id: string, rev: number) {
    await db.transaction('rw', db.responses, async () => {
      const cur = await db.responses.get(id)
      if (cur) await db.responses.put({ ...cur, client_rev: Math.max(cur.client_rev, rev) })
    })
  }

  private async adoptServerId(localId: string, server: ResponseRow) {
    await db.transaction('rw', db.responses, async () => {
      const cur = await db.responses.get(localId)
      if (!cur) return
      await db.responses.delete(localId)
      await db.responses.put({
        ...cur,
        id: server.id,
        answers: { ...server.answers, ...cur.answers },
        started_at: server.started_at,
        client_rev: Math.max(cur.client_rev, server.client_rev + 1),
        _dirty: 1,
      })
    })
  }

  // ── 응답 쓰기 API ───────────────────────────────
  private schedulePush() {
    void this.refreshPending().then(() => { if (this.status.online) void this.syncNow() })
  }

  async createResponse(input: {
    participant: Participant | null
    manual?: ManualInfo
    track: Track
    verified: Verified
    realName?: string
  }): Promise<LocalResponse> {
    const now = nowIso()
    const r: LocalResponse = {
      id: crypto.randomUUID(),
      participant_id: input.participant?.id ?? null,
      manual_info: input.manual ?? null,
      track: input.track,
      verified: input.verified,
      verified_by: this.me,
      verified_at: now,
      real_name: input.realName?.trim() || null,
      consent: null,
      helpers: [],
      answers: input.realName?.trim() ? { real_name: input.realName.trim() } : {},
      status: 'in_progress',
      result: null,
      entered_by: this.me,
      device_id: this.device,
      schema_version: this.schema.version,
      started_at: now,
      completed_at: null,
      updated_at: now,
      client_rev: 1,
      deleted_at: null,
      _dirty: 1,
      _server_rev: 0,
    }
    await db.responses.put(r)
    this.emit()
    this.schedulePush()
    return r
  }

  /** 기존 응답을 이어받는다 (다른 직원이 진행 중이던 건 포함) */
  async takeOver(id: string, patch: Partial<ResponseRow> = {}): Promise<LocalResponse | undefined> {
    return this.updateResponse(id, (r) => ({ ...r, entered_by: this.me, device_id: this.device, ...patch }))
  }

  async updateResponse(id: string, fn: (r: LocalResponse) => LocalResponse): Promise<LocalResponse | undefined> {
    const saved = await db.transaction('rw', db.responses, async () => {
      const cur = await db.responses.get(id)
      if (!cur) return undefined
      const next = fn(cur)
      const out: LocalResponse = { ...next, updated_at: nowIso(), client_rev: cur.client_rev + 1, _dirty: 1 }
      await db.responses.put(out)
      return out
    })
    this.emit()
    this.schedulePush()
    return saved
  }

  async logAccess(action: AccessAction, participantId: string | null, responseId: string | null = null) {
    await db.accessQueue.put({
      id: crypto.randomUUID(),
      participant_id: participantId,
      response_id: responseId,
      staff_name: this.me ?? '(미지정)',
      action,
      reason: null,
      at: nowIso(),
    })
    if (this.status.online) void this.syncNow()
  }

  // ── 동시 작업 감지 ──────────────────────────────
  openParticipant(participantId: string | null) {
    this.remote.trackPresence(participantId
      ? { device_id: this.device, staff_name: this.me ?? '', participant_id: participantId, opened_at: nowIso() }
      : null)
  }

  /** 나보다 먼저 이 어르신을 열어 둔 다른 기기 */
  othersOpening(participantId: string, myOpenedAt?: string): PresenceInfo[] {
    return this.presence.filter((p) => p.participant_id === participantId && p.device_id !== this.device
      && (!myOpenedAt || p.opened_at <= myOpenedAt))
  }

  // ── 설문지 ──────────────────────────────────────
  async saveSchema(payload: SurveyPayload): Promise<SurveySchema> {
    if (this.schema.locked) throw new RemoteError('LOCKED', '행사 잠금 중에는 설문지를 저장할 수 없습니다')
    const s = await this.remote.saveSchema(payload, { updatedBy: this.me ?? '' })
    await this.applySchema(s)
    return s
  }

  async setLocked(locked: boolean): Promise<SurveySchema> {
    const s = await this.remote.setSchemaLocked(locked, this.me ?? '')
    this.schema = s
    await db.setKV(KV_SCHEMA, s)
    this.emit()
    return s
  }

  // ── 백업 ────────────────────────────────────────
  async backupSnapshot() {
    const responses = (await db.responses.toArray()).map(toServerRow)
    await db.snapshots.add({ at: nowIso(), responses })
    const count = await db.snapshots.count()
    if (count > 24) {
      const old = await db.snapshots.orderBy('id').limit(count - 24).primaryKeys()
      await db.snapshots.bulkDelete(old)
    }
  }
}

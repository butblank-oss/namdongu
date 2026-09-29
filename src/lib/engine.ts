import { db as defaultDb, KV_PULL_CURSOR, KV_SCHEMA, KV_STAFF, type AppDB } from './db'

const KV_ALIASES = 'aliases'
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
  presence: PresenceInfo[] = []
  me: string | null = safeLocal()?.getItem(ME_KEY) ?? null
  readonly device: string
  readonly db: AppDB
  /** 이 탭에서 본인 확인 관문을 통과한 응답 id. 통과 전에는 문항을 보여 주지 않는다 (새로고침에도 유지) */
  readonly passedGate = new GateSet()

  private listeners = new Set<Listener>()
  private unsub: (() => void) | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private backupTimer: ReturnType<typeof setInterval> | null = null
  private flushing: Promise<void> | null = null
  private onOnline = () => { this.setStatus({ online: true }); void this.syncNow() }
  /** offline 이벤트마다 증가. 그 전에 시작된 요청의 성공으로 온라인 판정을 되돌리지 않는다 */
  private netGen = 0
  private onOffline = () => { this.netGen++; this.setStatus({ online: false }) }
  private markOnline(startGen: number) {
    if (!this.status.online && startGen === this.netGen) this.setStatus({ online: true })
  }

  constructor(
    public remote: Remote,
    private startOpts: { intervalMs?: number; backupMs?: number; deviceId?: string; db?: AppDB } = {},
  ) {
    this.device = startOpts.deviceId ?? deviceId()
    this.db = startOpts.db ?? defaultDb
  }

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

  /** 로그인 없이 쓰므로 admin 여부는 고른 이름의 staff.role 로만 판단한다 (화면 제어용) */
  get isAdmin(): boolean {
    const s = this.staff.find((x) => x.name === this.me)
    return s?.role === 'admin' && s.active
  }

  // ── 시작/종료 ───────────────────────────────────
  private gen = 0
  /** 오프라인 중복 응답이 서버 레코드로 합쳐졌을 때: 옛 로컬 id → 서버 id */
  private aliases = new Map<string, string>()

  resolveId(id: string): string {
    let cur = id
    for (let i = 0; i < 5 && this.aliases.has(cur); i++) cur = this.aliases.get(cur)!
    return cur
  }

  async start(opts: { intervalMs?: number; backupMs?: number } = this.startOpts) {
    const gen = ++this.gen
    const cachedSchema = await this.db.getKV<SurveySchema>(KV_SCHEMA)
    if (cachedSchema) this.schema = cachedSchema
    this.staff = (await this.db.getKV<Staff[]>(KV_STAFF)) ?? []
    this.aliases = new Map(Object.entries((await this.db.getKV<Record<string, string>>(KV_ALIASES)) ?? {}))
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
    const startGen = this.netGen
    try {
      const v = await fn()
      this.markOnline(startGen)
      return v
    } catch (e) {
      if (e instanceof RemoteError && e.code === 'NETWORK') this.setStatus({ online: false })
      else this.setStatus({ lastError: (e as Error).message })
      return undefined
    }
  }

  async fullPull() {
    await this.guarded(async () => {
      const [participants, schema] = await Promise.all([
        this.remote.fetchParticipants(),
        this.remote.fetchSchema(),
      ])
      await this.db.transaction('rw', this.db.participants, async () => {
        await this.db.participants.clear()
        await this.db.participants.bulkPut(participants)
      })
      if (schema) await this.applySchema(schema)
      else {
        // 최초 1회: 내장 기본 설문을 서버에 올린다
        const created = await this.remote.saveSchema(DEFAULT_PAYLOAD, { updatedBy: this.me ?? '', create: true })
        await this.applySchema(created)
      }
    })
    await this.pullStaff()
    await this.syncNow()
  }

  async pullStaff() {
    await this.guarded(async () => {
      this.staff = await this.remote.fetchStaff()
      await this.db.setKV(KV_STAFF, this.staff)
      this.emit()
    })
  }

  async applySchema(s: SurveySchema) {
    if (s.version < this.schema.version) return
    this.schema = s
    await this.db.setKV(KV_SCHEMA, s)
    this.emit()
  }

  /** 서버에서 온 응답을 로컬에 반영. 미동기화 로컬 변경이 있으면 무시한다 */
  async mergeRemote(remote: ResponseRow): Promise<'applied' | 'ignored'> {
    const result = await this.db.transaction('rw', this.db.responses, async () => {
      const local = await this.db.responses.get(remote.id)
      if (local?._dirty) return 'ignored' as const
      if (local && remote.client_rev < local.client_rev) return 'ignored' as const
      await this.db.responses.put({ ...remote, _dirty: 0, _server_rev: remote.client_rev })
      return 'applied' as const
    })
    if (result === 'applied') this.emit()
    return result
  }

  async pullResponses() {
    await this.guarded(async () => {
      const cursor = (await this.db.getKV<string>(KV_PULL_CURSOR)) ?? null
      const rows = await this.remote.fetchResponsesSince(cursor)
      let max = cursor
      for (const r of rows) {
        await this.mergeRemote(r)
        if (!max || r.updated_at > max) max = r.updated_at
      }
      if (max && max !== cursor) await this.db.setKV(KV_PULL_CURSOR, max)
    })
  }

  // ── 로컬 → 서버 ─────────────────────────────────
  async refreshPending() {
    const pending = await this.db.responses.where('_dirty').equals(1).count()
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
    const entries = await this.db.accessQueue.toArray()
    if (!entries.length) return
    const ok = await this.guarded(async () => { await this.remote.insertAccessLogs(entries); return true })
    if (ok) await this.db.accessQueue.bulkDelete(entries.map((e) => e.id))
  }

  private async pushResponses() {
    const dirty = await this.db.responses.where('_dirty').equals(1).toArray()
    for (const r of dirty) {
      const ok = await this.pushOne(r)
      if (ok === 'network') break
    }
  }

  private async pushOne(r: LocalResponse): Promise<'ok' | 'network' | 'error'> {
    const startGen = this.netGen
    try {
      const server = await this.remote.upsertResponse(toServerRow(r))
      this.markOnline(startGen)
      await this.db.transaction('rw', this.db.responses, async () => {
        const cur = await this.db.responses.get(r.id)
        // 올리는 사이에 새로 입력된 내용이 있으면 dirty 유지
        if (cur && cur.client_rev === r.client_rev) {
          await this.db.responses.put({ ...cur, updated_at: server.updated_at, _dirty: 0, _server_rev: server.client_rev })
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
    await this.db.transaction('rw', this.db.responses, async () => {
      const cur = await this.db.responses.get(id)
      if (cur) await this.db.responses.put({ ...cur, client_rev: Math.max(cur.client_rev, rev) })
    })
  }

  private async adoptServerId(localId: string, server: ResponseRow) {
    await this.db.transaction('rw', this.db.responses, this.db.kv, async () => {
      const cur = await this.db.responses.get(localId)
      if (!cur) return
      await this.db.responses.delete(localId)
      await this.db.responses.put({
        ...cur,
        id: server.id,
        answers: { ...server.answers, ...cur.answers },
        started_at: server.started_at,
        client_rev: Math.max(cur.client_rev, server.client_rev + 1),
        _dirty: 1,
      })
      this.aliases.set(localId, server.id)
      await this.db.setKV(KV_ALIASES, Object.fromEntries(this.aliases))
    })
    if (this.passedGate.has(localId)) this.passedGate.add(server.id)
    this.emit()
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
    await this.db.responses.put(r)
    this.emit()
    this.schedulePush()
    return r
  }

  /** 기존 응답을 이어받는다 (다른 직원이 진행 중이던 건 포함) */
  /** 이 어르신의 (삭제되지 않은) 응답. 화면 목록이 아직 안 읽혔어도 DB에서 직접 찾는다 */
  async findResponseFor(participantId: string): Promise<LocalResponse | undefined> {
    return this.db.responses.where('participant_id').equals(participantId).filter((r) => !r.deleted_at).first()
  }

  async takeOver(id: string, patch: Partial<ResponseRow> = {}): Promise<LocalResponse | undefined> {
    return this.updateResponse(id, (r) => ({ ...r, entered_by: this.me, device_id: this.device, ...patch }))
  }

  async updateResponse(rawId: string, fn: (r: LocalResponse) => LocalResponse): Promise<LocalResponse | undefined> {
    const id = this.resolveId(rawId)
    const saved = await this.db.transaction('rw', this.db.responses, async () => {
      const cur = await this.db.responses.get(id)
      if (!cur) return undefined
      const next = fn(cur)
      const out: LocalResponse = { ...next, updated_at: nowIso(), client_rev: cur.client_rev + 1, _dirty: 1 }
      await this.db.responses.put(out)
      return out
    })
    this.emit()
    this.schedulePush()
    return saved
  }

  async logAccess(action: AccessAction, participantId: string | null, responseId: string | null = null) {
    await this.db.accessQueue.put({
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
  private myOpen: PresenceInfo | null = null

  openParticipant(participantId: string | null) {
    this.myOpen = participantId
      ? { device_id: this.device, staff_name: this.me ?? '', participant_id: participantId, opened_at: nowIso() }
      : null
    this.remote.trackPresence(this.myOpen)
  }

  /** 나보다 먼저(또는 동시에) 이 어르신을 열어 둔 다른 기기 */
  othersOpening(participantId: string): PresenceInfo[] {
    const mine = this.myOpen?.participant_id === participantId ? this.myOpen.opened_at : null
    return this.presence.filter((p) => p.participant_id === participantId && p.device_id !== this.device
      && (!mine || p.opened_at <= mine))
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
    await this.db.setKV(KV_SCHEMA, s)
    this.emit()
    return s
  }

  // ── 백업 ────────────────────────────────────────
  async backupSnapshot() {
    const responses = (await this.db.responses.toArray()).map(toServerRow)
    await this.db.snapshots.add({ at: nowIso(), responses })
    const count = await this.db.snapshots.count()
    if (count > 24) {
      const old = await this.db.snapshots.orderBy('id').limit(count - 24).primaryKeys()
      await this.db.snapshots.bulkDelete(old)
    }
  }
}

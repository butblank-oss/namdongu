import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js'
import {
  RemoteError, toServerRow, type PresenceInfo, type Remote, type RemoteErrorCode, type RemoteHandlers,
} from './remote'
import type { AccessLogEntry, Participant, ResponseRow, Staff, SurveyPayload, SurveySchema } from './types'

// 운영 프로젝트 기본값. publishable key 는 원래 공개용이다 (권한은 DB 정책이 정한다).
// 다른 프로젝트로 돌릴 때만 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 로 덮어쓴다. 테스트 모드에서는 비운다.
const DEFAULT_URL = 'https://zohylpxoxrqocpzyxckh.supabase.co'
const DEFAULT_KEY = 'sb_publishable_N7RjSJG3vWpjGVx9xo1qhQ_JJu8Z_0h'
const useDefaults = import.meta.env.MODE !== 'test'
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || (useDefaults ? DEFAULT_URL : undefined)
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || (useDefaults ? DEFAULT_KEY : undefined)
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

let client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient {
  if (!client) {
    if (!supabaseConfigured) throw new Error('Supabase 환경변수가 없습니다')
    client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}

function toRemoteError(e: PostgrestError | Error | null): RemoteError {
  if (!e) return new RemoteError('UNKNOWN', 'unknown')
  const pe = e as PostgrestError
  const text = `${pe.message ?? ''} ${pe.hint ?? ''}`
  let code: RemoteErrorCode = 'UNKNOWN'
  if (text.includes('LOCKED')) code = 'LOCKED'
  else if (text.includes('KEY_IN_USE')) code = 'KEY_IN_USE'
  else if (text.includes('STALE_REV')) code = 'STALE_REV'
  else if (pe.code === '23505') code = 'DUPLICATE'
  else if (pe.code === '42501' || pe.code === 'PGRST301') code = 'FORBIDDEN'
  else if (/fetch|network|Failed/i.test(text)) code = 'NETWORK'
  return new RemoteError(code, pe.message ?? String(e))
}

const PAGE = 1000

export class SupabaseRemote implements Remote {
  private presenceChannel: ReturnType<SupabaseClient['channel']> | null = null

  constructor(private sb: SupabaseClient = getSupabase()) {}

  async fetchParticipants(): Promise<Participant[]> {
    const out: Participant[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb.from('participants').select('*').order('id').range(from, from + PAGE - 1)
      if (error) throw toRemoteError(error)
      out.push(...(data as Participant[]))
      if (!data || data.length < PAGE) break
    }
    return out
  }

  async fetchResponsesSince(since: string | null): Promise<ResponseRow[]> {
    const out: ResponseRow[] = []
    for (let from = 0; ; from += PAGE) {
      let q = this.sb.from('responses').select('*').order('updated_at').range(from, from + PAGE - 1)
      if (since) q = q.gt('updated_at', since)
      const { data, error } = await q
      if (error) throw toRemoteError(error)
      out.push(...(data as ResponseRow[]))
      if (!data || data.length < PAGE) break
    }
    return out
  }

  async fetchResponseByParticipant(participantId: string): Promise<ResponseRow | null> {
    const { data, error } = await this.sb.from('responses').select('*')
      .eq('participant_id', participantId).is('deleted_at', null).maybeSingle()
    if (error) throw toRemoteError(error)
    return data as ResponseRow | null
  }

  async fetchResponse(id: string): Promise<ResponseRow | null> {
    const { data, error } = await this.sb.from('responses').select('*').eq('id', id).maybeSingle()
    if (error) throw toRemoteError(error)
    return data as ResponseRow | null
  }

  async upsertResponse(row: ResponseRow): Promise<ResponseRow> {
    const { data, error } = await this.sb.from('responses').upsert(toServerRow(row), { onConflict: 'id' }).select().single()
    if (error) throw toRemoteError(error)
    return data as ResponseRow
  }

  async insertAccessLogs(entries: AccessLogEntry[]): Promise<void> {
    if (!entries.length) return
    const { error } = await this.sb.from('access_log').insert(entries)
    if (error) throw toRemoteError(error)
  }

  async fetchSchema(): Promise<SurveySchema | null> {
    const { data, error } = await this.sb.from('survey_schema').select('*').eq('id', 1).maybeSingle()
    if (error) throw toRemoteError(error)
    return data as SurveySchema | null
  }

  async saveSchema(payload: SurveyPayload, opts: { updatedBy: string; create?: boolean }): Promise<SurveySchema> {
    const q = opts.create
      ? this.sb.from('survey_schema').insert({ id: 1, version: 1, payload, updated_by: opts.updatedBy })
      : this.sb.from('survey_schema').update({ payload, updated_by: opts.updatedBy }).eq('id', 1)
    const { data, error } = await q.select().maybeSingle()
    if (error) throw toRemoteError(error)
    if (!data) throw new RemoteError('FORBIDDEN', '설문지를 수정할 권한이 없습니다')
    return data as SurveySchema
  }

  async setSchemaLocked(locked: boolean, updatedBy: string): Promise<SurveySchema> {
    const { data, error } = await this.sb.from('survey_schema')
      .update({ locked, updated_by: updatedBy }).eq('id', 1).select().maybeSingle()
    if (error) throw toRemoteError(error)
    if (!data) throw new RemoteError('FORBIDDEN', '잠금을 바꿀 권한이 없습니다')
    return data as SurveySchema
  }

  async fetchStaff(): Promise<Staff[]> {
    const { data, error } = await this.sb.from('staff').select('*').order('name')
    if (error) throw toRemoteError(error)
    return data as Staff[]
  }

  async upsertStaff(rows: Partial<Staff>[]): Promise<void> {
    const { error } = await this.sb.from('staff').upsert(rows, { onConflict: 'id' })
    if (error) throw toRemoteError(error)
  }

  async fetchMyStaff(): Promise<Staff | null> {
    const { data: u } = await this.sb.auth.getUser()
    if (!u.user) return null
    const { data, error } = await this.sb.from('staff').select('*').eq('auth_user_id', u.user.id).maybeSingle()
    if (error) throw toRemoteError(error)
    return data as Staff | null
  }

  subscribe(h: RemoteHandlers): () => void {
    const ch = this.sb.channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, (p) => {
        if (p.new && 'id' in p.new) h.onResponse(p.new as ResponseRow)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'survey_schema' }, (p) => {
        if (p.new && 'payload' in p.new) h.onSchema(p.new as SurveySchema)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, () => h.onStaff())
      .subscribe()

    const pc = this.sb.channel('presence-open', { config: { presence: { key: crypto.randomUUID() } } })
    pc.on('presence', { event: 'sync' }, () => {
      const state = pc.presenceState<PresenceInfo>()
      h.onPresence(Object.values(state).flat().filter((x) => x.participant_id))
    }).subscribe()
    this.presenceChannel = pc

    return () => {
      void this.sb.removeChannel(ch)
      void this.sb.removeChannel(pc)
      this.presenceChannel = null
    }
  }

  trackPresence(info: PresenceInfo | null): void {
    const pc = this.presenceChannel
    if (!pc) return
    if (info) void pc.track(info)
    else void pc.untrack()
  }
}

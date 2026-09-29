import type { AccessLogEntry, Participant, ResponseRow, Staff, SurveyPayload, SurveySchema } from './types'

export interface PresenceInfo {
  device_id: string
  staff_name: string
  participant_id: string
  opened_at: string
}

export interface RemoteHandlers {
  onResponse(row: ResponseRow): void
  onSchema(schema: SurveySchema): void
  onStaff(): void
  onPresence(list: PresenceInfo[]): void
}

export type RemoteErrorCode = 'LOCKED' | 'KEY_IN_USE' | 'STALE_REV' | 'DUPLICATE' | 'FORBIDDEN' | 'NETWORK' | 'UNKNOWN'

export class RemoteError extends Error {
  constructor(public code: RemoteErrorCode, message: string) {
    super(message)
  }
}

/** 서버와 주고받는 모든 경로. 테스트·데모는 FakeRemote 를 쓴다 */
export interface Remote {
  fetchParticipants(): Promise<Participant[]>
  fetchResponsesSince(since: string | null): Promise<ResponseRow[]>
  fetchResponseByParticipant(participantId: string): Promise<ResponseRow | null>
  fetchResponse(id: string): Promise<ResponseRow | null>
  upsertResponse(row: ResponseRow): Promise<ResponseRow>
  insertAccessLogs(entries: AccessLogEntry[]): Promise<void>
  fetchSchema(): Promise<SurveySchema | null>
  saveSchema(payload: SurveyPayload, opts: { updatedBy: string; locked?: boolean; create?: boolean }): Promise<SurveySchema>
  setSchemaLocked(locked: boolean, updatedBy: string): Promise<SurveySchema>
  fetchStaff(): Promise<Staff[]>
  upsertStaff(rows: Partial<Staff>[]): Promise<void>
  /** 현재 로그인 계정에 연결된 staff 행 */
  fetchMyStaff(): Promise<Staff | null>
  subscribe(handlers: RemoteHandlers): () => void
  trackPresence(info: PresenceInfo | null): void
}

export function toServerRow(r: ResponseRow): ResponseRow {
  const {
    id, participant_id, manual_info, track, verified, verified_by, verified_at, real_name, consent, helpers,
    answers, status, result, entered_by, device_id, schema_version, started_at, completed_at, updated_at,
    client_rev, deleted_at,
  } = r
  return {
    id, participant_id, manual_info, track, verified, verified_by, verified_at, real_name, consent, helpers,
    answers, status, result, entered_by, device_id, schema_version, started_at, completed_at, updated_at,
    client_rev, deleted_at,
  }
}

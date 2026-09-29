export type Track = 'A' | 'B' | 'C'
export type Cohort = '3' | '2' | '1' | '?'
export const COHORT_LABEL: Record<Cohort, string> = { '3': '3기', '2': '2기', '1': '1기', '?': '기수 미상' }
export type Verified = 'ok' | 'failed' | 'skipped'
export type Status = 'in_progress' | 'done' | 'refused' | 'revisit'
export type AnswerValue = string | string[]
export type Answers = Record<string, AnswerValue>

export interface Participant {
  id: string
  name_masked: string
  phone_last4: string | null
  birth_year: string | null
  age_group: string
  sex: 'F' | 'M' | '?'
  days_since_last_activity: number | null
  total_activity_cnt: number
  cohort: Cohort
  track: Track
  snapshot_date: string
  active?: boolean
}

export const MANUAL_REASONS = ['재등록', '등록 지연', '이전 기수', '가족 대리', '모름'] as const
export type ManualReason = (typeof MANUAL_REASONS)[number]

export interface ManualInfo {
  name: string
  phone_last4: string
  age_group: string
  sex: 'F' | 'M' | '?'
  reason: ManualReason
}

export interface ResponseRow {
  id: string
  participant_id: string | null
  manual_info: ManualInfo | null
  track: Track
  verified: Verified
  verified_by: string | null
  verified_at: string | null
  real_name: string | null
  consent: string | null
  helpers: string[]
  answers: Answers
  status: Status
  result: string | null
  entered_by: string | null
  device_id: string | null
  schema_version: number | null
  started_at: string
  completed_at: string | null
  updated_at: string
  client_rev: number
  deleted_at: string | null
}

/** 로컬(IndexedDB) 레코드: 서버 컬럼 + 동기화 메타 */
export interface LocalResponse extends ResponseRow {
  /** 1이면 서버에 아직 반영되지 않은 변경이 있다 */
  _dirty: 0 | 1
  /** 서버가 마지막으로 확인해 준 client_rev */
  _server_rev: number
}

export interface Staff {
  id: string
  name: string
  active: boolean
  role: 'admin' | 'operator'
  auth_user_id: string | null
}

export type AccessAction = 'view' | 'verify' | 'export' | 'delete'
export interface AccessLogEntry {
  id: string
  participant_id: string | null
  response_id: string | null
  staff_name: string
  action: AccessAction
  reason: string | null
  at: string
}

// ── 설문 정의 ─────────────────────────────────
export type QuestionType = 'single' | 'multi' | 'staff' | 'text' | 'textarea' | 'divider'
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  single: '하나 선택',
  multi: '여러 선택',
  staff: '담당자 선택',
  text: '짧은 글',
  textarea: '긴 글',
  divider: '구분선(스텝 나눔)',
}

export interface ShowIf {
  key: string
  /** 값 중 하나라도 일치하면 표시 (여러 선택이면 포함 여부) */
  in: string[]
}

export interface Question {
  key: string
  type: QuestionType
  label: string
  help?: string
  required?: boolean
  options?: string[]
  showIf?: ShowIf
  /** 게임 카드 인쇄에 쓰는 게임 목록 문항 */
  gameList?: boolean
}

export type SectionId = 'intake' | 'A' | 'B' | 'C' | 'closing'
export const SECTION_LABEL: Record<SectionId, string> = {
  intake: '접수',
  A: '트랙 A',
  B: '트랙 B',
  C: '트랙 C',
  closing: '마무리',
}

export interface SurveyPayload {
  sections: Record<SectionId, Question[]>
  guides: Record<Track, string>
}

export interface SurveySchema {
  version: number
  payload: SurveyPayload
  locked: boolean
  updated_by: string | null
  updated_at: string
}

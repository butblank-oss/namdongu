// 운영 DB 추출본(S3_user_info.csv) → participants 행 변환 규칙.
// 브라우저 번들에는 쓰이지 않고 scripts/import-participants.ts 와 테스트에서만 쓴다.

export const TARGET_PROVIDER = '인천 남동구 치매안심센터'
const TEST_NAME_PATTERN = /PRD|TEST|테스트|개발|샘플/i

export type Track = 'A' | 'B' | 'C'
export type Cohort = '3' | '2' | '1' | '?'

/** 행사 대상 기수. 2026년 과정(두뇌운동 치매예방교실-26년, 2026-03-02 ~ 10-31)이 3기다 */
export const TARGET_COHORT: Cohort = '3'

export interface SourceRow {
  user_id: string
  name_masked: string
  mobile_masked: string
  birthyear: string
  age_group: string
  sex_label: string
  provider_names: string
  challenge_names: string
  total_activity_cnt: string
  days_since_last_activity: string
  user_status: string
  [key: string]: string
}

export interface ParticipantRow {
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
}

export type ExcludeReason = 'not_target' | 'no_name' | 'test_account' | 'withdrawn' | 'not_cohort3'

function toInt(v: string | undefined): number | null {
  if (v == null) return null
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

export function computeTrack(dsl: number | null, tot: number): Track {
  if (dsl == null) return 'C'
  if (dsl <= 30) return 'A'
  if (tot > 20) return 'B'
  return 'C'
}

export function phoneLast4(mobileMasked: string): string | null {
  const digits = (mobileMasked ?? '').replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : null
}

export function normalizeAgeGroup(v: string): string {
  const t = (v ?? '').replace('대', '').trim()
  return ['60', '70', '80', '90'].includes(t) ? t : '?'
}

export function normalizeSex(v: string): 'F' | 'M' | '?' {
  const t = (v ?? '').trim().toLowerCase()
  // 지시서는 female/male 이지만 실제 추출본(2026-09-14)은 F/M 이다. 둘 다 받는다
  if (t === 'female' || t === 'f' || t === '여') return 'F'
  if (t === 'male' || t === 'm' || t === '남') return 'M'
  return '?'
}

/**
 * 참여 프로그램명에서 가장 최근 기수.
 *  3기 = 두뇌운동 치매예방교실-26년 (2026) / 2기 = 두뇌운동 치매예방교실 2기 (2025) / 1기 = 두뇌운동 치매예방교실 (2024)
 */
export function normalizeCohort(challengeNames: string): Cohort {
  const names = (challengeNames ?? '').split('|').map((x) => x.trim())
  if (names.some((n) => n.includes('26년') || n.includes('3기'))) return '3'
  if (names.some((n) => n.includes('2기'))) return '2'
  if (names.some((n) => n === '두뇌운동 치매예방교실')) return '1'
  return '?'
}

export function classifyRow(row: SourceRow): ExcludeReason | null {
  if (!(row.provider_names ?? '').includes(TARGET_PROVIDER)) return 'not_target'
  const name = (row.name_masked ?? '').trim()
  if (name === '') return 'no_name'
  if (TEST_NAME_PATTERN.test(name)) return 'test_account'
  if ((row.user_status ?? '').trim() === 'withdrawn') return 'withdrawn'
  // 3기 중심: 2기·1기만 참여한 분은 명단에서 빼고, 현장에 오시면 '명단 외 추가(이전 기수)'로 처리
  if (normalizeCohort(row.challenge_names) !== TARGET_COHORT) return 'not_cohort3'
  return null
}

export function toParticipant(row: SourceRow, snapshotDate: string): ParticipantRow {
  const dsl = toInt(row.days_since_last_activity)
  const tot = toInt(row.total_activity_cnt) ?? 0
  const by = (row.birthyear ?? '').trim()
  return {
    id: row.user_id.trim(),
    name_masked: row.name_masked.trim(),
    phone_last4: phoneLast4(row.mobile_masked),
    birth_year: /^\d{4}$/.test(by) ? by : null,
    age_group: normalizeAgeGroup(row.age_group),
    sex: normalizeSex(row.sex_label),
    days_since_last_activity: dsl,
    total_activity_cnt: tot,
    cohort: normalizeCohort(row.challenge_names),
    track: computeTrack(dsl, tot),
    snapshot_date: snapshotDate,
  }
}

export interface ImportSummary {
  included: ParticipantRow[]
  excluded: Record<ExcludeReason, number>
  byTrack: Record<Track, number>
  /** 제외 규칙 중 기수 조건만 빼고 적용했을 때의 기수 분포 (참고용) */
  byCohort: Record<Cohort, number>
  nullBirthYear: number
}

export function transformRows(rows: SourceRow[], snapshotDate: string): ImportSummary {
  const excluded: Record<ExcludeReason, number> = {
    not_target: 0, no_name: 0, test_account: 0, withdrawn: 0, not_cohort3: 0,
  }
  const byCohort: Record<Cohort, number> = { '3': 0, '2': 0, '1': 0, '?': 0 }
  const byId = new Map<string, ParticipantRow>()
  for (const row of rows) {
    const reason = classifyRow(row)
    if (reason === null || reason === 'not_cohort3') byCohort[normalizeCohort(row.challenge_names)]++
    if (reason) { excluded[reason]++; continue }
    const p = toParticipant(row, snapshotDate)
    byId.set(p.id, p)
  }
  const included = [...byId.values()]
  const byTrack = { A: 0, B: 0, C: 0 }
  let nullBirthYear = 0
  for (const p of included) {
    byTrack[p.track]++
    if (p.birth_year == null) nullBirthYear++
  }
  return { included, excluded, byTrack, byCohort, nullBirthYear }
}

// 2026-09-14 추출본 기준 기대값 (3기만). 크게 다르면 로직을 의심한다.
// 참고: 기수 제한 전(지시서 원안)은 1,523명 = 3기 891 + 2기 582 + 1기 50
export const EXPECTED_20260914 = {
  total: 891,
  byTrack: { A: 301, B: 158, C: 432 },
  byCohort: { '3': 891, '2': 582, '1': 50, '?': 0 },
}

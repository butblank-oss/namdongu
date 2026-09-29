// 운영 DB 추출본(S3_user_info.csv) → participants 행 변환 규칙.
// 브라우저 번들에는 쓰이지 않고 scripts/import-participants.ts 와 테스트에서만 쓴다.

export const TARGET_PROVIDER = '인천 남동구 치매안심센터'
const TEST_NAME_PATTERN = /PRD|TEST|테스트|개발|샘플/i

export type Track = 'A' | 'B' | 'C'

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
  cohort: '26' | '2' | '?'
  track: Track
  snapshot_date: string
}

export type ExcludeReason = 'not_target' | 'no_name' | 'test_account' | 'withdrawn'

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

export function normalizeCohort(challengeNames: string): '26' | '2' | '?' {
  const t = challengeNames ?? ''
  if (t.includes('26년')) return '26'
  if (t.includes('2기')) return '2'
  return '?'
}

export function classifyRow(row: SourceRow): ExcludeReason | null {
  if (!(row.provider_names ?? '').includes(TARGET_PROVIDER)) return 'not_target'
  const name = (row.name_masked ?? '').trim()
  if (name === '') return 'no_name'
  if (TEST_NAME_PATTERN.test(name)) return 'test_account'
  if ((row.user_status ?? '').trim() === 'withdrawn') return 'withdrawn'
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
  byCohort: Record<'26' | '2' | '?', number>
  nullBirthYear: number
}

export function transformRows(rows: SourceRow[], snapshotDate: string): ImportSummary {
  const excluded: Record<ExcludeReason, number> = {
    not_target: 0, no_name: 0, test_account: 0, withdrawn: 0,
  }
  const byId = new Map<string, ParticipantRow>()
  for (const row of rows) {
    const reason = classifyRow(row)
    if (reason) { excluded[reason]++; continue }
    const p = toParticipant(row, snapshotDate)
    byId.set(p.id, p)
  }
  const included = [...byId.values()]
  const byTrack = { A: 0, B: 0, C: 0 }
  const byCohort = { '26': 0, '2': 0, '?': 0 }
  let nullBirthYear = 0
  for (const p of included) {
    byTrack[p.track]++
    byCohort[p.cohort]++
    if (p.birth_year == null) nullBirthYear++
  }
  return { included, excluded, byTrack, byCohort, nullBirthYear }
}

// 2026-09-14 추출본 기준 기대값. 크게 다르면 로직을 의심한다.
export const EXPECTED_20260914 = {
  total: 1523,
  byTrack: { A: 351, B: 454, C: 718 },
  byCohort: { '26': 891, '2': 582, '?': 50 },
}

import { COHORT_LABEL, type Participant, type ResponseRow, type SurveyPayload } from './types'

export const MULTI_SEPARATOR = '; '
const BOM = '﻿'

const VERIFIED_LABEL: Record<string, string> = { ok: '확인', failed: '불일치', skipped: '확인 못함' }
const STATUS_LABEL: Record<string, string> = { in_progress: '진행중', done: '완료', refused: '거부', revisit: '재방문' }

function cell(v: unknown): string {
  if (v == null) return ''
  const s = Array.isArray(v) ? v.join(MULTI_SEPARATOR) : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildResponsesCsv(
  responses: ResponseRow[],
  participants: Map<string, Participant>,
  payload: SurveyPayload,
): string {
  const questions = Object.values(payload.sections).flat().filter((q) => q.type !== 'divider')
  const known = new Set(questions.map((q) => q.key))
  const extraKeys = [...new Set(responses.flatMap((r) => Object.keys(r.answers)))].filter((k) => !known.has(k)).sort()

  const header = [
    '응답ID', '참여자ID', '구분', '이름(마스킹)', '이름(명단 실명)', '전화 뒷4자리', '연령대', '성별', '기수', '명단 외 사유',
    '트랙', '본인확인', '확인자', '확인시각', '실명', '동의',
    '상태', '응대 결과', '입력자', '시작', '완료', '수정',
    ...questions.map((q) => `${q.label} [${q.key}]`),
    ...extraKeys.map((k) => `[${k}]`),
  ]

  const rows = responses
    .filter((r) => !r.deleted_at)
    .map((r) => {
      const p = r.participant_id ? participants.get(r.participant_id) : undefined
      const m = r.manual_info
      return [
        r.id, r.participant_id, m ? '명단 외' : '명단',
        p?.name_masked ?? m?.name, p?.full_name ?? m?.name, p?.phone_last4 ?? m?.phone_last4, p?.age_group ?? m?.age_group, p?.sex ?? m?.sex,
        p ? COHORT_LABEL[p.cohort] : undefined, m?.reason,
        r.track, VERIFIED_LABEL[r.verified] ?? r.verified, r.verified_by, r.verified_at, r.real_name, r.consent,
        STATUS_LABEL[r.status] ?? r.status, r.result, r.entered_by, r.started_at, r.completed_at, r.updated_at,
        ...questions.map((q) => r.answers[q.key]),
        ...extraKeys.map((k) => r.answers[k]),
      ].map(cell).join(',')
    })

  return BOM + [header.map(cell).join(','), ...rows].join('\r\n') + '\r\n'
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/** 4기 사전신청(preorder_4 = '신청')한 응답만 (삭제 표시 제외) */
export function isPreorder4(r: ResponseRow): boolean {
  return !r.deleted_at && r.answers.preorder_4 === '신청'
}

/** 4기에 실제로 넣을 수 있는 신청 (필수 동의까지 받은 경우) */
export function canRegister4(r: ResponseRow): boolean {
  return isPreorder4(r) && r.answers.p4_privacy === '동의'
}

/**
 * 4기 신청자 명단 CSV. 공개 앱이라 전체 휴대폰 번호는 넣지 않는다
 * (번호가 붙은 명단은 Supabase → preorder4_applicants 에서 내려받는다).
 */
export function buildApplicantsCsv(responses: ResponseRow[], participants: Map<string, Participant>): string {
  const TRACK: Record<string, string> = { A: '활동 중', B: '쉬는 중', C: '거의 미사용' }
  const header = ['이름', '4기 등록 가능', '4기 개인정보 동의', '문자 수신 동의', '뒷4자리', '대상', '안내 방법', '구분', '설문 개인정보 동의', '입력자', '응답 시각', '응답ID', '참여자ID']
  const rows = responses.filter(isPreorder4).map((r) => {
    const p = r.participant_id ? participants.get(r.participant_id) : undefined
    const m = r.manual_info
    return [
      p?.full_name ?? p?.name_masked ?? m?.name, canRegister4(r) ? 'O' : 'X', r.answers.p4_privacy, r.answers.p4_sms, p?.phone_last4 ?? m?.phone_last4, TRACK[r.track] ?? r.track,
      r.answers.contact_pref, m ? '명단 외' : '명단', r.consent, r.entered_by, r.completed_at ?? r.updated_at, r.id, r.participant_id,
    ].map(cell).join(',')
  })
  return BOM + [header.map(cell).join(','), ...rows].join('\r\n') + '\r\n'
}

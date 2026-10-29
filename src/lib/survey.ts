import { KEYS_WITHOUT_CONSENT, REWARD_NONE } from './defaultSchema'
import { TRACK_LABEL, type Answers, type AnswerValue, type Question, type SurveyPayload, type Track } from './types'

export interface Section {
  id: string
  title: string
  questions: Question[]
}

const withoutDividers = (list: Question[]) => list.filter((q) => q.type !== 'divider')

/**
 * 설문은 한 화면. 섹션은 ① 동의 ② 대상별 문항 ③ 마무리.
 * 개인정보 미동의면 대상별 문항과 리워드 등은 빼고 응대 결과·메모만 남긴다.
 */
export function buildSections(payload: SurveyPayload, track: Track, answers: Answers): Section[] {
  const denied = answers.consent === '미동의'
  const keep = (q: Question) => !denied || KEYS_WITHOUT_CONSENT.includes(q.key)
  const sections: Section[] = [
    { id: 'intake', title: '동의', questions: withoutDividers(payload.sections.intake).filter(keep) },
    { id: 'track', title: TRACK_LABEL[track], questions: denied ? [] : payload.sections[track] },
    { id: 'closing', title: '마무리', questions: withoutDividers(payload.sections.closing).filter(keep) },
  ]
  return sections.filter((sec) => sec.questions.some((q) => q.type !== 'divider'))
}

export function isEmpty(v: AnswerValue | undefined): boolean {
  if (v == null) return true
  if (Array.isArray(v)) return v.length === 0
  return v.trim() === ''
}

export function isVisible(q: Question, answers: Answers): boolean {
  if (!q.showIf) return true
  const v = answers[q.showIf.key]
  if (v == null) return false
  const vals = Array.isArray(v) ? v : [v]
  return vals.some((x) => q.showIf!.in.includes(x))
}

/** 필수인데 비어 있는 (보이는) 문항 key 목록 */
export function missingRequired(questions: Question[], answers: Answers): string[] {
  return questions
    .filter((q) => q.type !== 'divider' && q.required && isVisible(q, answers) && isEmpty(answers[q.key]))
    .map((q) => q.key)
}

export function allQuestionKeys(payload: SurveyPayload): string[] {
  return Object.values(payload.sections).flatMap((l) => l.filter((q) => q.type !== 'divider').map((q) => q.key))
}

export function gameListOptions(payload: SurveyPayload): string[] {
  for (const list of Object.values(payload.sections)) {
    const q = list.find((x) => x.gameList)
    if (q?.options?.length) return q.options
  }
  return []
}

/** 4기 필수 동의(p4_privacy)를 거부하면: 4기 사전신청은 '미신청'으로 끝나고 리워드도 드리지 않는다 (2026-10-29 현장팀 결정) */
export const P4_DECLINED_REASON = '4기 개인정보 필수 동의 안 함'
export const p4Declined = (a: Answers) => a.p4_privacy === '미동의' && a.preorder_4 === '미신청'

/** 한 문항을 고쳤을 때 함께 바뀌어야 하는 답 */
export function applyAnswerRules(prev: Answers, key: string, value: AnswerValue): Answers {
  const next: Answers = { ...prev, [key]: value }
  if (key === 'p4_privacy' && value === '미동의') {
    next.preorder_4 = '미신청'
    delete next.p4_sms
    next.reward = REWARD_NONE
    delete next.reward_partial
    if (!(typeof next.reward_reason === 'string' && next.reward_reason.trim())) next.reward_reason = P4_DECLINED_REASON
  }
  // 거부 후 다시 '신청'하면 동의를 새로 받는다. 거부 때문에 자동으로 넣은 리워드·사유도 걷어낸다
  if (key === 'preorder_4' && value === '신청' && prev.p4_privacy === '미동의') {
    delete next.p4_privacy
    delete next.p4_sms
    if (next.reward === REWARD_NONE && next.reward_reason === P4_DECLINED_REASON) {
      delete next.reward
      delete next.reward_reason
    }
  }
  return next
}

import { KEYS_WITHOUT_CONSENT } from './defaultSchema'
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

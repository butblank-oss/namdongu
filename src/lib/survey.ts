import type { Answers, AnswerValue, Question, SurveyPayload, Track } from './types'

export interface Step {
  id: string
  title: string
  questions: Question[]
}

const withoutDividers = (list: Question[]) => list.filter((q) => q.type !== 'divider')

/**
 * 화면은 두 장: 1) 접수(동의)  2) 트랙별 문항 + 마무리를 한 화면에 쭉.
 * 구분선(divider)은 화면을 나누지 않고 가로줄로만 보인다.
 */
export function buildSteps(payload: SurveyPayload, track: Track): Step[] {
  const closingHeader: Question = { key: '__closing', type: 'divider', label: '마무리' }
  return [
    { id: 'intake', title: '접수', questions: withoutDividers(payload.sections.intake) },
    {
      id: `${track}-0`,
      title: `트랙 ${track} · 마무리`,
      questions: [...payload.sections[track], closingHeader, ...payload.sections.closing],
    },
  ].filter((st) => st.questions.some((q) => q.type !== 'divider'))
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
export function missingRequired(step: Step, answers: Answers): string[] {
  return step.questions
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

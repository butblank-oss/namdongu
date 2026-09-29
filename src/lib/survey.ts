import type { Answers, AnswerValue, Question, SurveyPayload, Track } from './types'

export interface Step {
  id: string
  title: string
  questions: Question[]
}

function splitByDivider(sectionTitle: string, idPrefix: string, list: Question[]): Step[] {
  const steps: Step[] = []
  let cur: Question[] = []
  const push = () => {
    if (cur.length) steps.push({ id: `${idPrefix}-${steps.length}`, title: sectionTitle, questions: cur })
    cur = []
  }
  for (const q of list) {
    if (q.type === 'divider') push()
    else cur.push(q)
  }
  push()
  return steps
}

/** 접수 → 트랙별 → 마무리 순서의 스텝 목록. 구분선으로 스텝을 나눈다 */
export function buildSteps(payload: SurveyPayload, track: Track): Step[] {
  return [
    ...splitByDivider('접수', 'intake', payload.sections.intake),
    ...splitByDivider(`트랙 ${track}`, track, payload.sections[track]),
    ...splitByDivider('마무리', 'closing', payload.sections.closing),
  ]
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
    .filter((q) => q.required && isVisible(q, answers) && isEmpty(answers[q.key]))
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

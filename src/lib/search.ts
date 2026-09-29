import type { Participant } from './types'

/**
 * 마스킹 이름(간*자)과 입력값(간경자)의 일치 점수. 0이면 불일치.
 *  4 (a) 입력값이 이름에 그대로 포함
 *  3 (b) 길이가 같고 * 자리를 뺀 글자가 모두 일치
 *  2 (c) *를 뺀 글자들이 입력값 안에 순서대로 등장
 *  1 (d) 첫 글자 일치
 */
export function nameMatchScore(masked: string, input: string): number {
  const name = masked.trim()
  const q = input.replace(/\s+/g, '')
  if (!name || !q) return 0

  if (name.includes(q)) return 4

  if (name.length === q.length) {
    let ok = true
    for (let i = 0; i < name.length; i++) {
      if (name[i] !== '*' && name[i] !== q[i]) { ok = false; break }
    }
    if (ok) return 3
  }

  const visible = name.replace(/\*/g, '')
  if (visible.length > 0) {
    let j = 0
    for (let i = 0; i < q.length && j < visible.length; i++) {
      if (q[i] === visible[j]) j++
    }
    if (j === visible.length) return 2
  }

  if (name[0] !== '*' && name[0] === q[0]) return 1
  return 0
}

export function isPhoneQuery(input: string): boolean {
  return /^\d+$/.test(input.trim())
}

export interface SearchHit {
  participant: Participant
  score: number
}

export function searchParticipants(list: Participant[], input: string): SearchHit[] {
  const q = input.trim()
  if (!q) return list.map((participant) => ({ participant, score: 0 }))

  if (isPhoneQuery(q)) {
    // 4자리면 정확히 일치, 더 짧으면 앞자리부터 일치
    return list
      .filter((p) => p.phone_last4 != null && (q.length >= 4 ? p.phone_last4 === q.slice(-4) : p.phone_last4.startsWith(q)))
      .map((participant) => ({ participant, score: 5 }))
  }

  const hits: SearchHit[] = []
  for (const participant of list) {
    const full = participant.full_name?.replace(/\s+/g, '')
    const score = full && full.includes(q.replace(/\s+/g, '')) ? 6 : nameMatchScore(participant.name_masked, q)
    if (score > 0) hits.push({ participant, score })
  }
  hits.sort((x, y) => y.score - x.score || x.participant.name_masked.localeCompare(y.participant.name_masked, 'ko'))
  return hits
}

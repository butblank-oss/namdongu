import { FIRST_GAME_KEY, FIRST_GAME_OPTION } from './defaultSchema'
import type { Participant, Question, ResponseRow, Track } from './types'

export interface Kpis {
  rosterTotal: number
  byTrack: Record<Track, { total: number; done: number }>
  done: number
  inProgress: number
  refused: number
  revisit: number
  manualAdded: number
  firstGame: number
  preorder4: number
  rewardGiven: number
}

function asArray(v: string | string[] | undefined): string[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

export function kpis(responses: ResponseRow[], participants: Participant[]): Kpis {
  const active = participants.filter((p) => p.active !== false)
  const byTrack: Kpis['byTrack'] = { A: { total: 0, done: 0 }, B: { total: 0, done: 0 }, C: { total: 0, done: 0 } }
  for (const p of active) byTrack[p.track].total++
  const k: Kpis = {
    rosterTotal: active.length, byTrack,
    done: 0, inProgress: 0, refused: 0, revisit: 0, manualAdded: 0, firstGame: 0, preorder4: 0, rewardGiven: 0,
  }
  for (const r of responses) {
    if (r.status === 'done') { k.done++; if (byTrack[r.track]) byTrack[r.track].done++ }
    else if (r.status === 'in_progress') k.inProgress++
    else if (r.status === 'refused') k.refused++
    else if (r.status === 'revisit') k.revisit++
    if (r.participant_id == null) k.manualAdded++
    if (asArray(r.answers[FIRST_GAME_KEY]).includes(FIRST_GAME_OPTION)) k.firstGame++
    if (r.answers.preorder_4 === '신청') k.preorder4++
    const rw = r.answers.reward
    if (rw === '현장 지급' || rw === '추후 배송') k.rewardGiven++
  }
  return k
}

export interface Distribution {
  answered: number
  counts: { option: string; count: number; pct: number }[]
  etcTexts: string[]
}

export function questionDistribution(question: Question, responses: ResponseRow[]): Distribution {
  const options = question.options ?? []
  const tally = new Map<string, number>(options.map((o) => [o, 0]))
  const etcTexts: string[] = []
  let answered = 0
  for (const r of responses) {
    const vals = asArray(r.answers[question.key]).filter((v) => v !== '')
    if (vals.length === 0) continue
    answered++
    for (const v of new Set(vals)) if (tally.has(v)) tally.set(v, (tally.get(v) ?? 0) + 1)
    if (vals.includes('기타')) {
      const t = r.answers[`${question.key}__etc`]
      if (typeof t === 'string' && t.trim()) etcTexts.push(t.trim())
    }
  }
  return {
    answered,
    counts: options.map((option) => {
      const count = tally.get(option) ?? 0
      return { option, count, pct: answered ? Math.round((count / answered) * 100) : 0 }
    }),
    etcTexts,
  }
}

export function byStaff(responses: ResponseRow[]): { name: string; done: number; inProgress: number }[] {
  const m = new Map<string, { name: string; done: number; inProgress: number }>()
  for (const r of responses) {
    const name = r.entered_by || '(미지정)'
    const e = m.get(name) ?? { name, done: 0, inProgress: 0 }
    if (r.status === 'done') e.done++
    else if (r.status === 'in_progress') e.inProgress++
    m.set(name, e)
  }
  return [...m.values()].sort((a, b) => b.done - a.done || a.name.localeCompare(b.name, 'ko'))
}

export function byHour(responses: ResponseRow[]): { hour: number; done: number }[] {
  const m = new Map<number, number>()
  for (const r of responses) {
    if (r.status === 'in_progress' || !r.completed_at) continue
    const d = new Date(r.completed_at)
    if (Number.isNaN(d.getTime())) continue
    m.set(d.getHours(), (m.get(d.getHours()) ?? 0) + 1)
  }
  return [...m.entries()].map(([hour, done]) => ({ hour, done })).sort((a, b) => a.hour - b.hour)
}

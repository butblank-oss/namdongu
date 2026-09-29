import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useEngine, useParticipants, useResponses } from '../app/context'
import { FIRST_GAME_KEY, FIRST_GAME_OPTION } from '../lib/defaultSchema'
import { buildResponsesCsv, downloadText, stamp } from '../lib/exportCsv'
import type { Track } from '../lib/types'
import { Button } from './ui'

export function NetworkStatus({ testId = 'net-status' }: { testId?: string }) {
  const engine = useEngine()
  const { online, pending, syncing } = engine.status
  let text: string
  let cls: string
  if (!online) {
    text = `오프라인 · 대기 ${pending}건`
    cls = 'bg-red-700 text-white'
  } else if (pending > 0) {
    text = `${syncing ? '동기화 중' : '대기'} ${pending}건`
    cls = 'bg-amber-400 text-slate-900'
  } else {
    text = '동기화됨 · 대기 0건'
    cls = 'bg-emerald-700 text-white'
  }
  return (
    <button type="button" data-testid={testId} onClick={() => void engine.syncNow()} title="눌러서 지금 동기화"
      className={`min-h-11 rounded-lg px-3 text-base font-bold ${cls}`} aria-live="polite">
      {text}
    </button>
  )
}

export function Progress() {
  const participants = useParticipants() ?? []
  const responses = useResponses() ?? []
  const stats = useMemo(() => {
    const total: Record<Track, number> = { A: 0, B: 0, C: 0 }
    for (const p of participants) if (p.active !== false) total[p.track]++
    const done: Record<Track, number> = { A: 0, B: 0, C: 0 }
    let firstGame = 0
    for (const r of responses) {
      if (r.status === 'done') done[r.track]++
      const v = r.answers[FIRST_GAME_KEY]
      if (Array.isArray(v) && v.includes(FIRST_GAME_OPTION)) firstGame++
    }
    return { total, done, firstGame, all: responses.filter((r) => r.status === 'done').length }
  }, [participants, responses])

  return (
    <div className="flex items-center gap-3 text-base" data-testid="progress">
      {(['A', 'B', 'C'] as const).map((t) => (
        <span key={t} data-testid={`progress-${t}`}>
          <b>{t}</b> {stats.done[t]}/{stats.total[t]}
        </span>
      ))}
      <span data-testid="progress-all" className="text-slate-600">완료 {stats.all}</span>
      <span data-testid="progress-firstgame" className="rounded bg-violet-100 px-2 font-semibold text-violet-900">첫 게임 {stats.firstGame}</span>
    </div>
  )
}

export function TopBar() {
  const engine = useEngine()
  const navigate = useNavigate()
  const active = engine.staff.filter((s) => s.active)

  async function exportCsv() {
    const [responses, participants] = await Promise.all([engine.db.responses.toArray(), engine.db.participants.toArray()])
    const csv = buildResponsesCsv(responses, new Map(participants.map((p) => [p.id, p])), engine.schema.payload)
    downloadText(`응답_${stamp()}.csv`, csv)
    await engine.logAccess('export', null)
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b-2 border-slate-300 bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-3 px-4 py-2">
        <Link to="/" className="mr-2 text-lg font-extrabold text-blue-800">맬리브레인 현장</Link>
        <label className="flex items-center gap-2">
          <span className="text-sm text-slate-600">입력자</span>
          <select aria-label="입력자" value={engine.me ?? ''} onChange={(e) => engine.setMe(e.target.value)}
            className="min-h-11 rounded-lg border-2 border-slate-400 bg-white px-2 font-semibold">
            {!engine.me && <option value="">선택</option>}
            {active.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            {engine.me && !active.some((s) => s.name === engine.me) && <option value={engine.me}>{engine.me}</option>}
          </select>
        </label>
        <NetworkStatus />
        <Progress />
        <div className="ml-auto flex gap-2">
          <Button onClick={() => navigate('/print')}>게임 카드 인쇄</Button>
          <Button onClick={() => void exportCsv()}>응답 내보내기</Button>
          {engine.isAdmin && <Button onClick={() => navigate('/admin')}>설문지 편집</Button>}
        </div>
      </div>
    </header>
  )
}

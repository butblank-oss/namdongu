import { useMemo } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useEngine, useParticipants, useResponses } from '../app/context'
import { FIRST_GAME_KEY, FIRST_GAME_OPTION } from '../lib/defaultSchema'
import { buildResponsesCsv, downloadText, stamp } from '../lib/exportCsv'
import { TRACK_LABEL, type Track } from '../lib/types'
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

  const rosterTotal = stats.total.A + stats.total.B + stats.total.C
  return (
    <div className="flex items-center gap-2 text-base" data-testid="progress" title="대상별 현황은 대시보드에서">
      <span className="font-bold" data-testid="progress-all">완료 {stats.all}<span className="font-normal text-slate-600"> / {rosterTotal}</span></span>
      {/* 대상별 숫자는 대시보드에 크게 보이고, 여기서는 화면낭독기·테스트용으로만 둔다 */}
      <span className="sr-only">
        {(['A', 'B', 'C'] as const).map((t) => (
          <span key={t} data-testid={`progress-${t}`}>{TRACK_LABEL[t]} {stats.done[t]}/{stats.total[t]} </span>
        ))}
        <span data-testid="progress-firstgame">첫 게임 {stats.firstGame}</span>
      </span>
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
      <div className="mx-auto flex h-[60px] max-w-[1440px] items-center gap-3 px-4">
        <Link to="/" className="mr-1 whitespace-nowrap text-lg font-extrabold text-blue-800">맬리브레인 현장</Link>
        <nav className="flex gap-1" aria-label="메뉴">
          {([['/', '응대하기'], ['/list', '응답 목록'], ['/dashboard', '대시보드']] as const).map(([to, label]) => (
            <NavLink key={to} to={to} end
              className={({ isActive }) => `inline-flex min-h-11 items-center rounded-lg px-4 font-bold ${isActive ? 'bg-slate-900 text-white' : 'text-slate-800 hover:bg-slate-200'}`}>
              {label}
            </NavLink>
          ))}
        </nav>
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
        <div className="ml-auto flex items-center gap-2">
          {engine.isAdmin && <Button onClick={() => navigate('/admin')}>설문지 편집</Button>}
          <details className="relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg border-2 border-slate-400 px-4 font-semibold hover:bg-slate-50">더보기 ▾</summary>
            <div className="absolute right-0 z-50 mt-1 flex w-48 flex-col gap-1 rounded-lg border-2 border-slate-300 bg-white p-2 shadow-lg">
              <Button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; navigate('/print') }}>게임 카드 인쇄</Button>
              <Button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; void exportCsv() }}>응답 내보내기</Button>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}

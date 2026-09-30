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
  let dot: string
  if (!online) {
    text = `오프라인 · 대기 ${pending}건`
    cls = 'bg-red-500 text-white'
    dot = 'bg-white'
  } else if (pending > 0) {
    text = `${syncing ? '동기화 중' : '대기'} ${pending}건`
    cls = 'bg-orange-50 text-orange-600'
    dot = 'bg-orange-500 animate-pulse'
  } else {
    text = '동기화됨 · 대기 0건'
    cls = 'bg-green-50 text-green-600'
    dot = 'bg-green-500'
  }
  return (
    <button type="button" data-testid={testId} onClick={() => void engine.syncNow()} title="눌러서 지금 동기화"
      className={`inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[14px] font-semibold ${cls}`} aria-live="polite">
      <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
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
    <div className="flex items-center gap-2 whitespace-nowrap text-[15px]" data-testid="progress" title="대상별 현황은 대시보드에서">
      <span className="tabular font-semibold text-grey-900" data-testid="progress-all"><span className="font-medium text-grey-500">완료 </span>{stats.all}<span className="font-medium text-grey-400"> / {rosterTotal}</span></span>
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
    <header className="no-print sticky top-0 z-40 bg-white/90 shadow-[0_1px_0_var(--color-grey-200)] backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1440px] items-center gap-4 px-6">
        <Link to="/" className="flex items-center gap-2 whitespace-nowrap text-[17px] font-bold text-grey-900">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-blue-500 text-[13px] font-extrabold text-white">M</span>
          맬리브레인 현장
        </Link>
        <nav className="flex gap-1" aria-label="메뉴">
          {([['/', '응대하기'], ['/list', '응답 목록'], ['/dashboard', '대시보드'], ['/applicants', '4기 신청자']] as const).map(([to, label]) => (
            <NavLink key={to} to={to} end
              className={({ isActive }) => `inline-flex min-h-10 items-center rounded-xl px-3.5 text-[16px] font-semibold transition-colors ${isActive ? 'bg-grey-100 text-grey-900' : 'text-grey-500 hover:text-grey-800'}`}>
              {label}
            </NavLink>
          ))}
        </nav>
        <label className="ml-2 flex items-center gap-2">
          <span className="text-[14px] text-grey-500">입력자</span>
          <select aria-label="입력자" value={engine.me ?? ''} onChange={(e) => engine.setMe(e.target.value)}
            className="min-h-10 rounded-xl bg-grey-100 px-3 text-[15px] font-semibold text-grey-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {!engine.me && <option value="">선택</option>}
            {active.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            {engine.me && !active.some((s) => s.name === engine.me) && <option value={engine.me}>{engine.me}</option>}
          </select>
        </label>
        <NetworkStatus />
        <Progress />
        <div className="ml-auto flex items-center gap-2">
          {engine.isAdmin && <Button variant="tonal" size="sm" className="min-h-10 px-3.5 text-[15px]" onClick={() => navigate('/admin')}>설문지 편집</Button>}
          <details className="relative">
            <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 rounded-xl bg-grey-100 px-3.5 text-[15px] font-semibold text-grey-700 hover:bg-grey-200">더보기 <span aria-hidden className="text-grey-400">▾</span></summary>
            <div className="absolute right-0 z-50 mt-2 flex w-52 flex-col rounded-2xl bg-white p-2 shadow-[var(--shadow-pop)]">
              <Button variant="ghost" className="justify-start" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; navigate('/print') }}>게임 카드 인쇄</Button>
              <Button variant="ghost" className="justify-start" onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; void exportCsv() }}>응답 내보내기</Button>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}

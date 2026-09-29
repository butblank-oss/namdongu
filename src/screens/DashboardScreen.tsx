import { useMemo, useState } from 'react'
import { useEngine, useParticipants, useResponses } from '../app/context'
import { Screen } from '../components/ui'
import { byHour, byStaff, kpis, questionDistribution } from '../lib/stats'
import { SECTION_LABEL, TRACK_LABEL, type LocalResponse, type Question, type SectionId, type Track } from '../lib/types'

type TrackFilter = 'all' | Track
const TRACKS: Track[] = ['A', 'B', 'C']
const SECTION_ORDER: SectionId[] = ['intake', 'A', 'B', 'C', 'closing']

function Tile({ id, label, value, sub }: { id: string; label: string; value: number | string; sub?: string }) {
  return (
    <div data-testid={`kpi-${id}`} className="rounded-xl border-2 border-slate-300 bg-white p-4">
      <div className="text-4xl font-bold tabular-nums text-slate-900">{value}</div>
      <div className="mt-1 text-base font-semibold text-slate-700">{label}</div>
      {sub && <div className="text-base text-slate-600">{sub}</div>}
    </div>
  )
}

function pctOf(n: number, d: number) {
  return d ? Math.round((n / d) * 100) : 0
}

function QuestionCard({ q, responses }: { q: Question; responses: LocalResponse[] }) {
  if (q.type === 'text' || q.type === 'textarea') {
    const latest = responses
      .filter((r) => typeof r.answers[q.key] === 'string' && (r.answers[q.key] as string).trim())
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    return (
      <div data-testid="question-card" className="rounded-xl border-2 border-slate-300 bg-white p-4">
        <h4 className="text-lg font-semibold">{q.label}</h4>
        <p className="text-base text-slate-600">응답 {latest.length}명 · 최근 {Math.min(5, latest.length)}건</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-base">
          {latest.slice(0, 5).map((r) => <li key={r.id}>{r.answers[q.key] as string}</li>)}
        </ul>
      </div>
    )
  }
  const d = questionDistribution(q, responses)
  const max = Math.max(1, ...d.counts.map((c) => c.count))
  return (
    <div data-testid="question-card" className="rounded-xl border-2 border-slate-300 bg-white p-4">
      <h4 className="text-lg font-semibold">{q.label}</h4>
      <p className="text-base text-slate-600">
        응답 {d.answered}명 {q.type === 'multi' && <span className="ml-2 rounded bg-slate-200 px-2 py-0.5 text-sm font-semibold text-slate-800">여러 개 선택</span>}
      </p>
      <div className="mt-2 flex flex-col gap-0.5">
        {d.counts.map((c) => (
          <div key={c.option} title={`${c.option}: ${c.count}명 (${c.pct}%)`} data-testid="bar-row"
            className="grid grid-cols-[minmax(6rem,10rem)_1fr_7.5rem] items-center gap-3 text-base">
            <span>{c.option}</span>
            <div className="h-5 rounded bg-slate-100">
              <div className="h-5 rounded bg-blue-600" style={{ width: `${(c.count / max) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums">{c.count}명 · {c.pct}%</span>
          </div>
        ))}
      </div>
      {d.etcTexts.length > 0 && (
        <div className="mt-3">
          <h5 className="text-base font-semibold">기타 응답</h5>
          <ul className="list-disc pl-5 text-base">{d.etcTexts.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

export function DashboardScreen() {
  const engine = useEngine()
  const responses = useResponses()
  const participants = useParticipants()
  const [track, setTrack] = useState<TrackFilter>('all')

  const list = useMemo(() => responses ?? [], [responses])
  const k = useMemo(() => kpis(list, participants ?? []), [list, participants])
  const staff = useMemo(() => byStaff(list), [list])
  const hours = useMemo(() => byHour(list), [list])
  const sections = engine.schema.payload.sections

  const groups = SECTION_ORDER
    .filter((s) => track === 'all' || s === 'intake' || s === 'closing' || s === track)
    .map((s) => {
      const rs = list.filter((r) => (track === 'all' || r.track === track) && (s === 'A' || s === 'B' || s === 'C' ? r.track === s : true))
      const qs = (sections[s] ?? []).filter((q) => q.type === 'single' || q.type === 'multi' || q.type === 'text' || q.type === 'textarea')
      return { s, rs, qs }
    })
    .filter((g) => g.qs.length > 0)

  const maxHour = Math.max(1, ...hours.map((h) => h.done))

  return (
    <Screen className="max-w-6xl">
      <div className="mb-4 flex items-baseline gap-4">
        <h1 className="text-2xl font-bold">대시보드</h1>
        <span className="text-base text-slate-600">실시간 · 이 기기에 동기화된 응답 기준</span>
      </div>

      <div className="mb-4 flex items-center gap-2" role="group" aria-label="대상 필터">
        <span className="text-base font-semibold">대상</span>
        {(['all', ...TRACKS] as TrackFilter[]).map((t) => (
          <button key={t} type="button" aria-pressed={track === t} onClick={() => setTrack(t)}
            className={`min-h-11 rounded-lg border-2 px-4 text-base font-semibold ${track === t ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-400 bg-white text-slate-900 hover:bg-slate-50'}`}>
            {t === 'all' ? '전체' : TRACK_LABEL[t]}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-slate-300 p-10 text-center text-lg text-slate-700">아직 응답이 없습니다</p>
      ) : (
        <>
          <section aria-label="핵심 지표" className="mb-6 grid grid-cols-4 gap-3">
            <Tile id="done" label="완료" value={k.done} sub={`/ ${k.rosterTotal}명 (${pctOf(k.done, k.rosterTotal)}%)`} />
            <Tile id="inProgress" label="진행중" value={k.inProgress} />
            <Tile id="refusedRevisit" label="거부·재방문" value={k.refused + k.revisit} sub={`거부 ${k.refused} · 재방문 ${k.revisit}`} />
            <Tile id="manualAdded" label="명단 외 추가" value={k.manualAdded} />
            <Tile id="firstGame" label="첫 게임 실행" value={k.firstGame} />
            <Tile id="preorder4" label="4기 사전신청" value={k.preorder4} />
            <Tile id="rewardGiven" label="리워드 지급" value={k.rewardGiven} />
          </section>

          <section aria-label="대상별 완료" className="mb-6 rounded-xl border-2 border-slate-300 bg-white p-4">
            <h2 className="mb-2 text-xl font-bold">대상별 완료</h2>
            <div className="flex flex-col gap-1">
              {TRACKS.map((t) => {
                const v = k.byTrack[t]
                const dim = track !== 'all' && track !== t
                return (
                  <div key={t} data-testid={`track-progress-${t}`} className={`grid grid-cols-[18rem_1fr] items-center gap-3 text-base ${dim ? 'opacity-40' : ''}`}
                    title={`${TRACK_LABEL[t]}:${v.done}명 완료 / ${v.total}명`}>
                    <span className="font-semibold">{TRACK_LABEL[t]} {v.done} / {v.total} ({pctOf(v.done, v.total)}%)</span>
                    <div className="h-5 rounded bg-slate-100"><div className="h-5 rounded bg-blue-600" style={{ width: `${pctOf(v.done, v.total)}%` }} /></div>
                  </div>
                )
              })}
            </div>
          </section>

          <section aria-label="문항별 응답" className="mb-6">
            <h2 className="mb-2 text-xl font-bold">문항별 응답</h2>
            {groups.map((g) => (
              <div key={g.s} className="mb-4">
                <h3 className="mb-2 text-lg font-bold text-slate-800">{g.s === 'A' || g.s === 'B' || g.s === 'C' ? TRACK_LABEL[g.s] : SECTION_LABEL[g.s]}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {g.qs.map((q) => <QuestionCard key={q.key} q={q} responses={g.rs} />)}
                </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-2 gap-3">
            <section aria-label="담당자별" className="rounded-xl border-2 border-slate-300 bg-white p-4">
              <h2 className="mb-2 text-xl font-bold">담당자별</h2>
              <table className="w-full text-left text-base">
                <thead><tr className="border-b border-slate-300"><th className="py-1">담당자</th><th className="py-1 text-right">완료</th><th className="py-1 text-right">진행중</th></tr></thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.name} className="border-b border-slate-100">
                      <td className="py-1">{s.name}</td><td className="py-1 text-right tabular-nums">{s.done}</td><td className="py-1 text-right tabular-nums">{s.inProgress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section aria-label="시간대별 완료" className="rounded-xl border-2 border-slate-300 bg-white p-4">
              <h2 className="mb-2 text-xl font-bold">시간대별 완료</h2>
              {hours.length === 0 ? <p className="text-base text-slate-600">아직 완료된 응답이 없습니다</p> : (
                <div className="flex h-48 items-end gap-2">
                  {hours.map((h) => (
                    <div key={h.hour} data-testid="hour-bar" title={`${h.hour}시: ${h.done}명`} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-base font-semibold tabular-nums">{h.done}</span>
                      <div className="w-full rounded-t bg-blue-600" style={{ height: `${(h.done / maxHour) * 120}px` }} />
                      <span className="text-base text-slate-700">{h.hour}시</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </Screen>
  )
}

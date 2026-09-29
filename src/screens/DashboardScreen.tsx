import { useMemo, useState } from 'react'
import { useEngine, useParticipants, useResponses } from '../app/context'
import { Card, PageTitle, Screen, Segmented } from '../components/ui'
import { byHour, byStaff, kpis, questionDistribution } from '../lib/stats'
import { SECTION_LABEL, TRACK_LABEL, type LocalResponse, type Question, type SectionId, type Track } from '../lib/types'

type TrackFilter = 'all' | Track
const TRACKS: Track[] = ['A', 'B', 'C']
const SECTION_ORDER: SectionId[] = ['intake', 'A', 'B', 'C', 'closing']

function Tile({ id, label, value, sub }: { id: string; label: string; value: number | string; sub?: string }) {
  return (
    <Card data-testid={`kpi-${id}`}>
      <div className="text-[15px] text-grey-500">{label}</div>
      <div className="tabular mt-1 text-[32px] font-bold leading-tight text-grey-900">{value}</div>
      {sub && <div className="mt-0.5 text-[14px] text-grey-500">{sub}</div>}
    </Card>
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
      <Card data-testid="question-card">
        <h4 className="text-[19px] font-bold text-grey-900">{q.label}</h4>
        <p className="mt-1 text-[15px] text-grey-500">응답 {latest.length}명 · 최근 {Math.min(5, latest.length)}건</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[16px] text-grey-700">
          {latest.slice(0, 5).map((r) => <li key={r.id}>{r.answers[q.key] as string}</li>)}
        </ul>
      </Card>
    )
  }
  const d = questionDistribution(q, responses)
  const max = Math.max(1, ...d.counts.map((c) => c.count))
  return (
    <Card data-testid="question-card">
      <h4 className="text-[19px] font-bold text-grey-900">{q.label}</h4>
      <p className="mt-1 text-[15px] text-grey-500">
        응답 {d.answered}명 {q.type === 'multi' && <span className="ml-2 rounded-md bg-grey-100 px-2 py-0.5 text-[13px] font-semibold text-grey-700">여러 개 선택</span>}
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {d.counts.map((c) => (
          <div key={c.option} title={`${c.option}: ${c.count}명 (${c.pct}%)`} data-testid="bar-row"
            className="grid grid-cols-[minmax(6rem,10rem)_1fr_7.5rem] items-center gap-3 text-[15px]">
            <span className="text-grey-700">{c.option}</span>
            <div className="h-2.5 rounded-full bg-grey-100">
              <div className="h-2.5 rounded-full bg-blue-500" style={{ width: `${(c.count / max) * 100}%` }} />
            </div>
            <span className="tabular text-right text-grey-500">{c.count}명 · {c.pct}%</span>
          </div>
        ))}
      </div>
      {d.etcTexts.length > 0 && (
        <div className="mt-4">
          <h5 className="text-[15px] font-semibold text-grey-700">기타 응답</h5>
          <ul className="mt-1 list-disc pl-5 text-[15px] text-grey-700">{d.etcTexts.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </Card>
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
      <PageTitle sub="실시간 · 이 기기에 동기화된 응답 기준">대시보드</PageTitle>

      <div className="mb-6 flex items-center gap-3">
        <span className="text-[15px] font-semibold text-grey-700">대상</span>
        <Segmented<TrackFilter> label="대상 필터" value={track} onChange={setTrack}
          options={(['all', ...TRACKS] as TrackFilter[]).map((t) => ({ v: t, label: t === 'all' ? '전체' : TRACK_LABEL[t] }))} />
      </div>

      {list.length === 0 ? (
        <Card className="p-12 text-center text-[17px] text-grey-500">아직 응답이 없습니다</Card>
      ) : (
        <>
          <section aria-label="핵심 지표" className="mb-6 grid grid-cols-4 gap-4">
            <Tile id="done" label="완료" value={k.done} sub={`/ ${k.rosterTotal}명 (${pctOf(k.done, k.rosterTotal)}%)`} />
            <Tile id="inProgress" label="진행중" value={k.inProgress} />
            <Tile id="refusedRevisit" label="거부·재방문" value={k.refused + k.revisit} sub={`거부 ${k.refused} · 재방문 ${k.revisit}`} />
            <Tile id="manualAdded" label="명단 외 추가" value={k.manualAdded} />
            <Tile id="firstGame" label="첫 게임 실행" value={k.firstGame} />
            <Tile id="preorder4" label="4기 사전신청" value={k.preorder4} />
            <Tile id="rewardGiven" label="리워드 지급" value={k.rewardGiven} />
          </section>

          <section aria-label="대상별 완료" className="mb-6 rounded-[20px] bg-white p-6 shadow-[var(--shadow-card)]">
            <h2 className="mb-4 text-[19px] font-bold text-grey-900">대상별 완료</h2>
            <div className="flex flex-col gap-4">
              {TRACKS.map((t) => {
                const v = k.byTrack[t]
                const dim = track !== 'all' && track !== t
                return (
                  <div key={t} data-testid={`track-progress-${t}`} className={`grid grid-cols-[18rem_1fr] items-center gap-3 text-[15px] ${dim ? 'opacity-40' : ''}`}
                    title={`${TRACK_LABEL[t]}:${v.done}명 완료 / ${v.total}명`}>
                    <span className="tabular font-semibold text-grey-700">{TRACK_LABEL[t]} {v.done} / {v.total} ({pctOf(v.done, v.total)}%)</span>
                    <div className="h-2 rounded-full bg-grey-100"><div className="h-2 rounded-full bg-blue-500" style={{ width: `${pctOf(v.done, v.total)}%` }} /></div>
                  </div>
                )
              })}
            </div>
          </section>

          <section aria-label="문항별 응답" className="mb-6">
            <h2 className="mb-3 text-[19px] font-bold text-grey-900">문항별 응답</h2>
            {groups.map((g) => (
              <div key={g.s} className="mb-6">
                <h3 className="mb-3 text-[16px] font-semibold text-grey-700">{g.s === 'A' || g.s === 'B' || g.s === 'C' ? TRACK_LABEL[g.s] : SECTION_LABEL[g.s]}</h3>
                <div className="grid grid-cols-2 gap-4">
                  {g.qs.map((q) => <QuestionCard key={q.key} q={q} responses={g.rs} />)}
                </div>
              </div>
            ))}
          </section>

          <div className="grid grid-cols-2 gap-4">
            <section aria-label="담당자별" className="rounded-[20px] bg-white p-6 shadow-[var(--shadow-card)]">
              <h2 className="mb-3 text-[19px] font-bold text-grey-900">담당자별</h2>
              <table className="w-full text-left text-[16px]">
                <thead><tr className="text-[14px] text-grey-500"><th className="py-2 font-medium">담당자</th><th className="py-2 text-right font-medium">완료</th><th className="py-2 text-right font-medium">진행중</th></tr></thead>
                <tbody className="divide-y divide-grey-100">
                  {staff.map((s) => (
                    <tr key={s.name} className="hover:bg-grey-50">
                      <td className="py-3 text-grey-900">{s.name}</td><td className="tabular py-3 text-right text-grey-700">{s.done}</td><td className="tabular py-3 text-right text-grey-700">{s.inProgress}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section aria-label="시간대별 완료" className="rounded-[20px] bg-white p-6 shadow-[var(--shadow-card)]">
              <h2 className="mb-3 text-[19px] font-bold text-grey-900">시간대별 완료</h2>
              {hours.length === 0 ? <p className="text-[15px] text-grey-500">아직 완료된 응답이 없습니다</p> : (
                <div className="flex h-48 items-end gap-2">
                  {hours.map((h) => (
                    <div key={h.hour} data-testid="hour-bar" title={`${h.hour}시: ${h.done}명`} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <span className="tabular text-[15px] font-semibold text-grey-700">{h.done}</span>
                      <div className="w-full rounded-t-md bg-blue-500" style={{ height: `${(h.done / maxHour) * 120}px` }} />
                      <span className="text-[14px] text-grey-500">{h.hour}시</span>
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

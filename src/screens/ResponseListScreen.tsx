import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEngine, useParticipants, useResponses } from '../app/context'
import { Badge, Button, Screen, TRACK_TONE } from '../components/ui'
import { buildResponsesCsv, downloadText, stamp } from '../lib/exportCsv'
import { TRACK_LABEL, type LocalResponse, type Participant, type Status, type Track } from '../lib/types'

const STATUS_TONE = { in_progress: 'amber', done: 'green', refused: 'red', revisit: 'red' } as const
const STATUS_LABEL: Record<Status, string> = { in_progress: '진행중', done: '완료', refused: '거부', revisit: '재방문' }
const STATUS_FILTERS: { key: 'all' | Status; label: string }[] = [
  { key: 'all', label: '전체' }, { key: 'done', label: '완료' }, { key: 'in_progress', label: '진행중' },
  { key: 'refused', label: '거부' }, { key: 'revisit', label: '재방문' },
]

function hhmm(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v.join(', ') : (v ?? '')
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 text-base font-semibold">{label}</span>
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}
          className={`min-h-11 rounded-lg border-2 px-3 text-base font-semibold ${value === o.key ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-400 bg-white text-slate-900 hover:bg-slate-50'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ResponseListScreen() {
  const engine = useEngine()
  const navigate = useNavigate()
  const responses = useResponses()
  const participants = useParticipants()
  const [status, setStatus] = useState<'all' | Status>('all')
  const [track, setTrack] = useState<'all' | Track>('all')
  const [staff, setStaff] = useState('')
  const [q, setQ] = useState('')

  const pMap = useMemo(() => new Map<string, Participant>((participants ?? []).map((p) => [p.id, p])), [participants])
  const all = useMemo(() => responses ?? [], [responses])
  const staffNames = useMemo(() => [...new Set(all.map((r) => r.entered_by).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b, 'ko')), [all])

  const nameOf = (r: LocalResponse) => (r.participant_id ? pMap.get(r.participant_id)?.name_masked : undefined) ?? r.manual_info?.name ?? ''
  const last4Of = (r: LocalResponse) => (r.participant_id ? pMap.get(r.participant_id)?.phone_last4 : undefined) ?? r.manual_info?.phone_last4 ?? ''

  const rows = useMemo(() => {
    const term = q.trim()
    return all
      .filter((r) => (status === 'all' || r.status === status) && (track === 'all' || r.track === track) && (!staff || r.entered_by === staff))
      .filter((r) => {
        if (!term) return true
        const p = r.participant_id ? pMap.get(r.participant_id) : undefined
        return (p?.name_masked ?? '').includes(term) || (r.manual_info?.name ?? '').includes(term)
          || (p?.phone_last4 ?? '').includes(term) || (r.manual_info?.phone_last4 ?? '').includes(term)
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [all, status, track, staff, q, pMap])

  const open = (r: LocalResponse) => {
    engine.passedGate.add(r.id)
    navigate(`/r/${r.id}`)
  }

  const exportCsv = () => {
    const csv = buildResponsesCsv(rows, pMap, engine.schema.payload)
    downloadText(`응답목록_${stamp()}.csv`, csv)
    void engine.logAccess('export', null)
  }

  return (
    <Screen className="max-w-6xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">응답 목록 <span className="text-lg font-normal text-slate-600" data-testid="list-count">{rows.length}건</span></h1>
        <Button onClick={exportCsv} disabled={rows.length === 0}>이 목록 내보내기</Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Seg label="상태" value={status} options={STATUS_FILTERS} onChange={setStatus} />
        <Seg label="대상" value={track} options={[{ key: 'all', label: '전체' }, { key: 'A', label: TRACK_LABEL.A }, { key: 'B', label: TRACK_LABEL.B }, { key: 'C', label: TRACK_LABEL.C }]} onChange={setTrack} />
        <label className="flex items-center gap-2 text-base font-semibold">
          입력자
          <select value={staff} onChange={(e) => setStaff(e.target.value)} className="min-h-11 rounded-lg border-2 border-slate-400 bg-white px-2 text-base font-normal">
            <option value="">전체</option>
            {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <input aria-label="목록 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 뒷4자리"
          className="min-h-11 w-56 rounded-lg border-2 border-slate-400 px-3 text-base" />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-slate-300 p-10 text-center text-lg text-slate-700">
          {all.length === 0 ? '아직 응답이 없습니다' : '조건에 맞는 응답이 없습니다'}
        </p>
      ) : (
        <table className="w-full border-collapse text-left text-base">
          <thead>
            <tr className="border-b-2 border-slate-300 bg-slate-50">
              {['시각', '이름', '뒷4자리', '대상', '상태', '응대 결과', '4기', '리워드', '입력자'].map((h) => <th key={h} className="px-2 py-2">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="list-row" tabIndex={0} role="button"
                onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r) } }}
                className="cursor-pointer border-b border-slate-200 hover:bg-blue-50 focus:bg-blue-50">
                <td className="px-2 py-2 tabular-nums">{hhmm(r.completed_at ?? r.updated_at)}</td>
                <td className="px-2 py-2">{nameOf(r)} {!r.participant_id && <Badge tone="slate">명단 외</Badge>}</td>
                <td className="px-2 py-2 tabular-nums">{last4Of(r)}</td>
                <td className="px-2 py-2"><Badge tone={TRACK_TONE[r.track]}>{TRACK_LABEL[r.track]}</Badge></td>
                <td className="px-2 py-2"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                <td className="px-2 py-2">{r.result ?? ''}</td>
                <td className="px-2 py-2">{str(r.answers.preorder_4)}</td>
                <td className="px-2 py-2">{str(r.answers.reward)}</td>
                <td className="px-2 py-2">{r.entered_by ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Screen>
  )
}

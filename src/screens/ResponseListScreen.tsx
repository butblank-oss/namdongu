import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEngine, useParticipants, useResponses } from '../app/context'
import { Badge, Button, Card, PageTitle, Screen, Segmented, TRACK_TONE, inputCls } from '../components/ui'
import { buildResponsesCsv, downloadText, stamp } from '../lib/exportCsv'
import { TRACK_LABEL, type LocalResponse, type Participant, type Status, type Track } from '../lib/types'

const STATUS_TONE = { in_progress: 'orange', done: 'green', refused: 'red', revisit: 'red' } as const
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
    <div className="flex items-center gap-2">
      <span className="text-[15px] font-semibold text-grey-700">{label}</span>
      <Segmented<T> label={label} value={value} onChange={onChange} options={options.map((o) => ({ v: o.key, label: o.label }))} />
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
      <PageTitle right={<Button variant="primary" onClick={exportCsv} disabled={rows.length === 0}>이 목록 내보내기</Button>}>
        응답 목록 <span className="ml-1 text-[19px] font-medium text-grey-500" data-testid="list-count">{rows.length}건</span>
      </PageTitle>

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Seg label="상태" value={status} options={STATUS_FILTERS} onChange={setStatus} />
        <Seg label="대상" value={track} options={[{ key: 'all', label: '전체' }, { key: 'A', label: TRACK_LABEL.A }, { key: 'B', label: TRACK_LABEL.B }, { key: 'C', label: TRACK_LABEL.C }]} onChange={setTrack} />
        <label className="flex items-center gap-2 text-[15px] font-semibold text-grey-700">
          입력자
          <select value={staff} onChange={(e) => setStaff(e.target.value)} className={`${inputCls} !w-auto font-normal`}>
            <option value="">전체</option>
            {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <input aria-label="목록 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 뒷4자리"
          className={`${inputCls} !w-56`} />
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center text-[17px] text-grey-500">
          {all.length === 0 ? '아직 응답이 없습니다' : '조건에 맞는 응답이 없습니다'}
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-[20px] bg-white p-2 shadow-[var(--shadow-card)]">
        <table className="w-full border-collapse text-left text-[16px]">
          <thead>
            <tr className="text-[14px] font-medium text-grey-500">
              {['시각', '이름', '뒷4자리', '대상', '상태', '응대 결과', '4기', '리워드', '입력자'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-grey-100">
            {rows.map((r) => (
              <tr key={r.id} data-testid="list-row" tabIndex={0} role="button"
                onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r) } }}
                className="cursor-pointer text-grey-900 hover:bg-grey-50 focus:bg-grey-50">
                <td className="tabular px-4 py-4 text-grey-500">{hhmm(r.completed_at ?? r.updated_at)}</td>
                <td className="px-4 py-4">{nameOf(r)} {!r.participant_id && <Badge tone="grey">명단 외</Badge>}</td>
                <td className="tabular px-4 py-4 text-grey-500">{last4Of(r)}</td>
                <td className="px-4 py-4"><Badge tone={TRACK_TONE[r.track]}>{TRACK_LABEL[r.track]}</Badge></td>
                <td className="px-4 py-4"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                <td className="px-4 py-4">{r.result ?? ''}</td>
                <td className="px-4 py-4">{str(r.answers.preorder_4)}</td>
                <td className="px-4 py-4">{str(r.answers.reward)}</td>
                <td className="px-4 py-4">{r.entered_by ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </Screen>
  )
}

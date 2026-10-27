import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEngine, useParticipants, useResponses } from '../app/context'
import { Badge, Button, Card, PageTitle, Screen, Segmented, TRACK_TONE, inputCls } from '../components/ui'
import { APP_UPDATE_DONE, APP_UPDATE_KEY, ETC, REWARD_NONE, REWARD_PARTIAL, etcKey } from '../lib/defaultSchema'
import { nowIso } from '../lib/engine'
import { buildResponsesCsv, downloadText, stamp } from '../lib/exportCsv'
import { TRACK_LABEL, type LocalResponse, type Participant, type Status, type Track } from '../lib/types'

const STATUS_TONE = { in_progress: 'orange', done: 'green', refused: 'red', revisit: 'red' } as const
const STATUS_LABEL: Record<Status, string> = { in_progress: '진행중', done: '완료', refused: '거부', revisit: '재방문' }
/** 목록을 나눠 보여 주는 순서: 손이 가야 하는 진행중이 먼저 */
const STATUS_ORDER: Status[] = ['in_progress', 'done', 'revisit', 'refused']

function hhmm(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function str(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v.join(', ') : (v ?? '')
}

/** 리워드 칸 아래 작은 글씨: 일부 수령이면 받은 품목, 대상 아님이면 사유 */
function rewardDetail(r: LocalResponse): string {
  const rw = r.answers.reward
  if (rw === REWARD_PARTIAL) {
    const items = Array.isArray(r.answers.reward_partial) ? r.answers.reward_partial : r.answers.reward_partial ? [r.answers.reward_partial] : []
    const etc = r.answers[etcKey('reward_partial')]
    return items.map((x) => (x === ETC && typeof etc === 'string' && etc.trim() ? `기타(${etc.trim()})` : x)).join(', ')
  }
  if (rw === REWARD_NONE) return str(r.answers.reward_reason)
  return ''
}

function AppUpdateCell({ r }: { r: LocalResponse }) {
  const v = str(r.answers[APP_UPDATE_KEY])
  if (!v) return null
  if (v === APP_UPDATE_DONE) return <Badge tone="green">현장 업데이트</Badge>
  if (v === '업데이트 못함') {
    const why = str(r.answers.app_update_fail)
    return <span><Badge tone="red">못함</Badge>{why && <span className="ml-1 text-[13px] text-grey-500">{why}</span>}</span>
  }
  return <Badge tone="grey">{v}</Badge>
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
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        return (p?.name_masked ?? '').includes(term) || (p?.full_name ?? '').includes(term) || (r.manual_info?.name ?? '').includes(term)
          || (p?.phone_last4 ?? '').includes(term) || (r.manual_info?.phone_last4 ?? '').includes(term)
          || (/^\d+$/.test(term) && String(r.queue_no ?? '') === term)
      })
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [all, status, track, staff, q, pMap])

  // 상태별 건수 (상태 필터를 뺀 나머지 조건 기준)
  const counts = useMemo(() => {
    const c: Record<'all' | Status, number> = { all: 0, in_progress: 0, done: 0, refused: 0, revisit: 0 }
    for (const r of all) {
      if ((track === 'all' || r.track === track) && (!staff || r.entered_by === staff)) { c.all++; c[r.status]++ }
    }
    return c
  }, [all, track, staff])

  const groups = useMemo(() => STATUS_ORDER
    .map((st) => ({ status: st, rows: rows.filter((r) => r.status === st) }))
    .filter((g) => g.rows.length > 0), [rows])

  // 보이는 목록이 바뀌면 안 보이게 된 선택은 푼다
  const visibleIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows])
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [visibleIds])

  const toggle = (ids: string[], on: boolean) => setSelected((prev) => {
    const next = new Set(prev)
    for (const id of ids) { if (on) next.add(id); else next.delete(id) }
    return next
  })
  const chosen = rows.filter((r) => selected.has(r.id))
  const allOn = rows.length > 0 && chosen.length === rows.length

  async function deleteChosen() {
    if (!chosen.length || busy) return
    if (!window.confirm(`선택한 ${chosen.length}건을 삭제할까요?\n목록에서 사라지고, 그 어르신은 새로 응대할 수 있게 됩니다.`)) return
    setBusy(true)
    for (const r of chosen) {
      await engine.updateResponse(r.id, (x) => ({ ...x, deleted_at: nowIso() }))
      await engine.logAccess('delete', r.participant_id, r.id)
    }
    setSelected(new Set())
    setMsg(`${chosen.length}건을 삭제했습니다.`)
    setBusy(false)
  }

  const exportChosen = () => {
    downloadText(`응답선택_${stamp()}.csv`, buildResponsesCsv(chosen, pMap, engine.schema.payload))
    void engine.logAccess('export', null)
  }

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
        <Seg label="상태" value={status} onChange={setStatus}
          options={(['all', ...STATUS_ORDER] as const).map((k) => ({ key: k, label: `${k === 'all' ? '전체' : STATUS_LABEL[k]} ${counts[k]}` }))} />
        <Seg label="대상" value={track} options={[{ key: 'all', label: '전체' }, { key: 'A', label: TRACK_LABEL.A }, { key: 'B', label: TRACK_LABEL.B }, { key: 'C', label: TRACK_LABEL.C }]} onChange={setTrack} />
        <label className="flex items-center gap-2 text-[15px] font-semibold text-grey-700">
          입력자
          <select value={staff} onChange={(e) => setStaff(e.target.value)} className={`${inputCls} !w-auto font-normal`}>
            <option value="">전체</option>
            {staffNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <input aria-label="목록 검색" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 뒷4자리 · 번호표"
          className={`${inputCls} !w-56`} />
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center text-[17px] text-grey-500">
          {all.length === 0 ? '아직 응답이 없습니다' : '조건에 맞는 응답이 없습니다'}
        </Card>
      ) : (
        <>
        <div className="sticky top-[60px] z-20 mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-white/95 px-4 py-3 shadow-[var(--shadow-card)] backdrop-blur" data-testid="bulk-bar">
          <label className="flex items-center gap-2 text-[15px] font-semibold text-grey-700">
            <input type="checkbox" className="h-5 w-5 accent-blue-500" aria-label="보이는 목록 전체 선택"
              checked={allOn} ref={(el) => { if (el) el.indeterminate = chosen.length > 0 && !allOn }}
              onChange={(e) => toggle(rows.map((r) => r.id), e.target.checked)} />
            전체 선택
          </label>
          <span className="ml-1 text-[15px] text-grey-500" data-testid="selected-count">{chosen.length ? `${chosen.length}건 선택됨` : '선택한 응답 없음'}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" disabled={!chosen.length} onClick={() => setSelected(new Set())}>선택 해제</Button>
            <Button size="sm" variant="tonal" disabled={!chosen.length} onClick={exportChosen}>선택 내보내기</Button>
            <Button size="sm" variant="dangerWeak" disabled={!chosen.length || busy || !engine.isAdmin}
              title={engine.isAdmin ? undefined : '삭제는 관리자만 할 수 있어요'} onClick={() => void deleteChosen()}>선택 삭제</Button>
          </div>
          {msg && <p role="status" className="w-full text-[14px] font-semibold text-green-600">{msg}</p>}
        </div>
        <div className="overflow-x-auto rounded-[20px] bg-white p-2 shadow-[var(--shadow-card)]">
        <table className="w-full border-collapse text-left text-[16px]">
          <thead>
            <tr className="text-[14px] font-medium text-grey-500">
              <th className="w-12 px-3 py-3"><span className="sr-only">선택</span></th>
              {['시각', '번호표', '이름', '뒷4자리', '대상', '상태', '응대 결과', '4기', '리워드', '앱 업데이트', '입력자'].map((h) => <th key={h} className="whitespace-nowrap px-3 py-3 font-medium">{h}</th>)}
            </tr>
          </thead>
          {groups.map((g) => {
            const ids = g.rows.map((r) => r.id)
            const on = ids.every((id) => selected.has(id))
            return (
              <tbody key={g.status} data-testid={`group-${g.status}`} className="divide-y divide-grey-100">
                <tr className="bg-grey-50">
                  <td className="px-3 py-2.5">
                    <input type="checkbox" className="h-5 w-5 accent-blue-500" aria-label={`${STATUS_LABEL[g.status]} 전체 선택`}
                      checked={on} onChange={(e) => toggle(ids, e.target.checked)} />
                  </td>
                  <td colSpan={11} className="px-3 py-2.5 text-[15px] font-bold text-grey-800">
                    <Badge tone={STATUS_TONE[g.status]}>{STATUS_LABEL[g.status]}</Badge>
                    <span className="ml-2 tabular text-grey-500">{g.rows.length}건</span>
                  </td>
                </tr>
                {g.rows.map((r) => (
                <tr key={r.id} data-testid="list-row" data-status={r.status} tabIndex={0} role="button"
                  onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); open(r) } }}
                  className={`cursor-pointer text-grey-900 hover:bg-grey-50 focus:bg-grey-50 ${selected.has(r.id) ? 'bg-blue-50/60' : ''}`}>
                  <td className="w-12 px-3 py-4" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="h-5 w-5 accent-blue-500" aria-label={`${nameOf(r)} 선택`}
                      checked={selected.has(r.id)} onChange={(e) => toggle([r.id], e.target.checked)} />
                  </td>
                  <td className="tabular px-4 py-4 text-grey-500">{hhmm(r.completed_at ?? r.updated_at)}</td>
                  <td className="tabular px-3 py-4 font-semibold" data-testid="cell-queue">{r.queue_no ?? ''}</td>
                  <td className="px-4 py-4">{nameOf(r)} {!r.participant_id && <Badge tone="grey">명단 외</Badge>}</td>
                  <td className="tabular px-4 py-4 text-grey-500">{last4Of(r)}</td>
                  <td className="px-4 py-4"><Badge tone={TRACK_TONE[r.track]}>{TRACK_LABEL[r.track]}</Badge></td>
                  <td className="px-4 py-4"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                  <td className="px-4 py-4">{r.result ?? ''}</td>
                  <td className="px-4 py-4">{str(r.answers.preorder_4)}</td>
                  <td className="px-3 py-4" data-testid="cell-reward">
                    {str(r.answers.reward)}
                    {rewardDetail(r) && <span className="block text-[13px] text-grey-500">{rewardDetail(r)}</span>}
                  </td>
                  <td className="px-3 py-4" data-testid="cell-app"><AppUpdateCell r={r} /></td>
                  <td className="px-4 py-4">{r.entered_by ?? ''}</td>
                </tr>
                ))}
              </tbody>
            )
          })}
        </table>
        </div>
        </>
      )}
    </Screen>
  )
}

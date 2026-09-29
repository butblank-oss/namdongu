import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useParticipants, useResponseIndex } from '../app/context'
import { Badge, Button, Screen, TRACK_TONE } from '../components/ui'
import { searchParticipants } from '../lib/search'
import type { Cohort, LocalResponse, Participant, Track } from '../lib/types'

const LIMIT = 50
type StatusFilter = 'todo' | 'progress' | 'done'
const SEARCH_KEY = 'namdongu.lastSearch'

export function statusOf(r: LocalResponse | undefined): StatusFilter {
  if (!r) return 'todo'
  return r.status === 'in_progress' ? 'progress' : 'done'
}

function StatusBadge({ r }: { r: LocalResponse | undefined }) {
  if (!r) return <Badge>미착수</Badge>
  if (r.status === 'in_progress') return <Badge tone="amber">진행중 · {r.entered_by ?? '?'}</Badge>
  const label = { done: '완료', refused: '거부', revisit: '재방문' }[r.status]
  return <Badge tone={r.status === 'done' ? 'green' : 'red'}>{label} · {r.entered_by ?? '?'}</Badge>
}

function Toggle<T extends string>({ value, options, onChange, label }: {
  value: T[]; options: { v: T; label: string }[]; onChange: (v: T[]) => void; label: string
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <span className="mr-1 text-sm text-slate-600">{label}</span>
      {options.map((o) => {
        const on = value.includes(o.v)
        return (
          <button key={o.v} type="button" aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.v) : [...value, o.v])}
            className={`min-h-11 rounded-lg border-2 px-3 font-semibold ${on ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white'}`}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function SearchScreen() {
  const participants = useParticipants()
  const index = useResponseIndex()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState(() => { try { return sessionStorage.getItem(SEARCH_KEY) ?? '' } catch { return '' } })
  const [tracks, setTracks] = useState<Track[]>([])
  const [statuses, setStatuses] = useState<StatusFilter[]>([])
  const [cohorts, setCohorts] = useState<Cohort[]>([])

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  useEffect(() => { try { sessionStorage.setItem(SEARCH_KEY, q) } catch { /* 무시 */ } }, [q])

  const results = useMemo(() => {
    const list = (participants ?? []).filter((p) => p.active !== false || index.has(p.id))
    return searchParticipants(list, q).filter(({ participant: p }) =>
      (!tracks.length || tracks.includes(p.track))
      && (!cohorts.length || cohorts.includes(p.cohort))
      && (!statuses.length || statuses.includes(statusOf(index.get(p.id)))))
  }, [participants, q, tracks, cohorts, statuses, index])

  const shown = results.slice(0, LIMIT)
  const open = (p: Participant) => navigate(`/p/${p.id}`)

  return (
    <Screen>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            aria-label="검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown[0]) { e.preventDefault(); open(shown[0].participant) }
              if (e.key === 'Escape') setQ('')
            }}
            placeholder="전화 뒷 4자리 또는 이름 (예: 8800, 간경자)"
            className="min-h-16 w-full rounded-xl border-2 border-slate-400 bg-white px-5 pr-16 text-2xl font-semibold placeholder:text-slate-400 focus:border-blue-700"
            inputMode="search"
            autoComplete="off"
          />
          {q && (
            <button type="button" aria-label="검색어 지우기" onClick={() => { setQ(''); inputRef.current?.focus() }}
              className="absolute right-3 top-1/2 h-11 w-11 -translate-y-1/2 rounded-full bg-slate-200 text-2xl font-bold text-slate-700 hover:bg-slate-300">
              ✕
            </button>
          )}
        </div>
        <Button size="lg" onClick={() => navigate('/manual')}>명단에 없는 분 추가</Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <Toggle label="트랙" value={tracks} onChange={setTracks} options={[{ v: 'A', label: 'A' }, { v: 'B', label: 'B' }, { v: 'C', label: 'C' }]} />
        <Toggle label="상태" value={statuses} onChange={setStatuses}
          options={[{ v: 'todo', label: '미착수' }, { v: 'progress', label: '진행중' }, { v: 'done', label: '완료' }]} />
        <Toggle label="기수" value={cohorts} onChange={setCohorts}
          options={[{ v: '26', label: '26년' }, { v: '2', label: '2기' }, { v: '?', label: '미상' }]} />
      </div>

      <p className="mt-3 text-base text-slate-600" data-testid="result-count">
        {participants == null ? '명단 불러오는 중…' : `${results.length}명`}
        {results.length > LIMIT && ` · 앞 ${LIMIT}명만 표시합니다. 검색어를 더 입력하세요`}
      </p>

      {participants != null && results.length === 0 && (
        <div className="mt-4 rounded-xl border-2 border-dashed border-slate-400 bg-white p-6 text-center">
          <p className="text-xl font-bold">전화 뒷 4자리로 찾아보세요. 이쪽이 훨씬 정확합니다</p>
          <Button className="mt-4" size="lg" variant="primary" onClick={() => navigate('/manual')}>명단에 없는 분 추가</Button>
        </div>
      )}

      <ul className="mt-2 divide-y-2 divide-slate-200 overflow-hidden rounded-xl border-2 border-slate-300 bg-white" aria-label="검색 결과">
        {shown.map(({ participant: p }, i) => {
          const r = index.get(p.id)
          return (
            <li key={p.id}>
              <button type="button" onClick={() => open(p)} data-testid="result-row"
                className={`flex min-h-16 w-full items-center gap-4 px-4 text-left hover:bg-blue-50 focus:bg-blue-50 ${i === 0 && q ? 'bg-blue-50/60' : ''}`}>
                <span className="w-24 font-mono text-3xl font-extrabold tracking-wider" data-testid="phone-last4">{p.phone_last4 ?? '----'}</span>
                <span className="w-24 text-2xl font-bold">{p.name_masked}</span>
                <span className="w-28 text-lg text-slate-700">{p.birth_year ?? '생년 ?'}</span>
                <span className="w-24 text-lg text-slate-700">{p.age_group === '?' ? '연령 ?' : `${p.age_group}대`} · {p.sex === 'F' ? '여' : p.sex === 'M' ? '남' : '?'}</span>
                <Badge tone={TRACK_TONE[p.track]}>트랙 {p.track}</Badge>
                <Badge>{p.cohort === '26' ? '26년' : p.cohort === '2' ? '2기' : '기수 미상'}</Badge>
                <span className="ml-auto"><StatusBadge r={r} /></span>
              </button>
            </li>
          )
        })}
      </ul>
      {q && shown.length > 0 && <p className="mt-2 text-sm text-slate-600">Enter: 첫 번째 결과 선택 · Esc: 검색어 지우기</p>}
    </Screen>
  )
}

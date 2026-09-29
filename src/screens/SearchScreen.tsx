import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useParticipants, useResponseIndex } from '../app/context'
import { Badge, Button, Card, Chip, Screen, TRACK_TONE } from '../components/ui'
import { searchParticipants } from '../lib/search'
import { COHORT_LABEL, TRACK_LABEL, type LocalResponse, type Participant } from '../lib/types'

const LIMIT = 50
type StatusFilter = 'todo' | 'progress' | 'done'
const SEARCH_KEY = 'namdongu.lastSearch'

export function statusOf(r: LocalResponse | undefined): StatusFilter {
  if (!r) return 'todo'
  return r.status === 'in_progress' ? 'progress' : 'done'
}

function StatusBadge({ r }: { r: LocalResponse | undefined }) {
  if (!r) return <Badge>미착수</Badge>
  if (r.status === 'in_progress') return <Badge tone="orange">진행중 · {r.entered_by ?? '?'}</Badge>
  const label = { done: '완료', refused: '거부', revisit: '재방문' }[r.status]
  return <Badge tone={r.status === 'done' ? 'green' : 'red'}>{label} · {r.entered_by ?? '?'}</Badge>
}

function Toggle<T extends string>({ value, options, onChange, label }: {
  value: T[]; options: { v: T; label: string }[]; onChange: (v: T[]) => void; label: string
}) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = value.includes(o.v)
        return (
          <Chip key={o.v} selected={on} onClick={() => onChange(on ? value.filter((x) => x !== o.v) : [...value, o.v])}>
            {o.label}
          </Chip>
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
  const [statuses, setStatuses] = useState<StatusFilter[]>([])

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  useEffect(() => { try { sessionStorage.setItem(SEARCH_KEY, q) } catch { /* 무시 */ } }, [q])

  const results = useMemo(() => {
    const list = (participants ?? []).filter((p) => p.active !== false || index.has(p.id))
    return searchParticipants(list, q).filter(({ participant: p }) =>
      (!statuses.length || statuses.includes(statusOf(index.get(p.id)))))
  }, [participants, q, statuses, index])

  const shown = results.slice(0, LIMIT)
  // 검색어를 함께 넘긴다: 뒷 4자리로 찾았으면 본인 확인에서 번호 대조가 끝난 것
  const open = (p: Participant) => navigate(`/p/${p.id}`, { state: { q } })

  return (
    <Screen>
      <h1 className="text-[26px] font-bold leading-tight text-grey-900">어떤 분을 응대하세요?</h1>
      <p className="mt-1 text-[15px] text-grey-500">전화번호 뒷 4자리나 이름으로 찾아요. 뒷 4자리가 더 정확해요.</p>

      <div className="mt-6 flex gap-3">
        <div className="relative flex-1">
          <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-5 top-1/2 h-6 w-6 -translate-y-1/2 text-grey-400" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            aria-label="검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown[0]) { e.preventDefault(); open(shown[0].participant) }
              if (e.key === 'Escape') setQ('')
            }}
            placeholder="8800 또는 간경자"
            className="min-h-16 w-full rounded-2xl bg-white pl-14 pr-16 text-[22px] font-semibold text-grey-900 shadow-[var(--shadow-card)] ring-1 ring-inset ring-grey-200 transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
            inputMode="search"
            autoComplete="off"
          />
          {q && (
            <button type="button" aria-label="검색어 지우기" onClick={() => { setQ(''); inputRef.current?.focus() }}
              className="absolute right-4 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-grey-300 text-[15px] font-bold text-white hover:bg-grey-400">
              ✕
            </button>
          )}
        </div>
        <Button size="lg" variant="tonal" className="min-h-16 rounded-2xl" onClick={() => navigate('/manual')}>명단에 없는 분 추가</Button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Toggle label="상태" value={statuses} onChange={setStatuses}
          options={[{ v: 'todo', label: '미착수' }, { v: 'progress', label: '진행중' }, { v: 'done', label: '완료' }]} />
        <p className="ml-auto text-[14px] text-grey-500" data-testid="result-count">
          {participants == null ? '명단 불러오는 중…' : `${results.length}명`}
          {results.length > LIMIT && ` · 앞 ${LIMIT}명만 표시합니다. 검색어를 더 입력하세요`}
        </p>
      </div>

      {participants != null && results.length === 0 && (
        <Card className="mt-4 py-12 text-center">
          <p className="text-[19px] font-bold text-grey-900">전화 뒷 4자리로 찾아보세요. 이쪽이 훨씬 정확합니다</p>
          <p className="mt-1 text-[15px] text-grey-500">그래도 없으면 명단 외로 추가해 응대할 수 있어요.</p>
          <Button className="mt-5" size="lg" variant="primary" onClick={() => navigate('/manual')}>명단에 없는 분 추가</Button>
        </Card>
      )}

      {shown.length > 0 && (
        <ul className="mt-4 overflow-hidden rounded-[20px] bg-white p-2 shadow-[var(--shadow-card)]" aria-label="검색 결과">
          {shown.map(({ participant: p }, i) => {
            const r = index.get(p.id)
            return (
              <li key={p.id}>
                <button type="button" onClick={() => open(p)} data-testid="result-row"
                  className={`flex min-h-16 w-full items-center gap-5 rounded-2xl px-4 text-left transition-colors hover:bg-grey-50 focus:bg-blue-50 ${i === 0 && q ? 'bg-grey-50' : ''}`}>
                  <span className="tabular w-20 text-[24px] font-bold tracking-wide text-grey-900" data-testid="phone-last4">{p.phone_last4 ?? '----'}</span>
                  <span className="w-20 text-[19px] font-semibold text-grey-900">{p.name_masked}</span>
                  <span className="w-44 text-[15px] text-grey-500">
                    {p.birth_year ? `${p.birth_year}년생` : '생년 미상'} · {p.age_group === '?' ? '연령 ?' : `${p.age_group}대`} {p.sex === 'F' ? '여' : p.sex === 'M' ? '남' : ''}
                  </span>
                  <Badge tone={TRACK_TONE[p.track]}>{TRACK_LABEL[p.track]}</Badge>
                  {p.cohort !== '3' && <Badge tone="red">{COHORT_LABEL[p.cohort]}</Badge>}
                  <span className="ml-auto flex items-center gap-3"><StatusBadge r={r} /><span aria-hidden className="text-grey-300">›</span></span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {q && shown.length > 0 && <p className="mt-3 text-center text-[13px] text-grey-400">Enter 첫 번째 결과 열기 · Esc 지우기</p>}
    </Screen>
  )
}

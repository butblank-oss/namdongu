import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEngine } from '../app/context'
import { Button, Card, Chip, PageTitle } from '../components/ui'
import { ETC } from '../lib/defaultSchema'
import { TRACK_DESC, TRACK_LABEL, type Question, type SurveyPayload, type Track } from '../lib/types'

/*
 * 인쇄용 설문지 (A4 세로). 줄 서 계신 어르신이 미리 체크하고, 응대 때 직원이 앱에 옮겨 적는다.
 * 저장된 최신 설문(survey_schema)을 그대로 읽으므로 설문지를 고치면 인쇄본도 바로 바뀐다.
 * 입구에서 대상을 확인해 해당 용지를 드린다 → 용지는 대상별 3종.
 */

const TRACKS: Track[] = ['A', 'B', 'C']
/** 어르신이 아니라 직원이 적는 문항 (기본값). 화면에서 바꿀 수 있다 */
const DEFAULT_STAFF_KEYS = ['reward', 'real_name', 'result', 'memo', 'c_checklist', 'c_blocked']
const STAFF_KEYS_STORE = 'print-survey-staff-keys'

const ACCENT: Record<Track, string> = { A: '#3182f6', B: '#f2994a', C: '#9b51e0' }

function loadStaffKeys(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STAFF_KEYS_STORE) ?? 'null')
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string')
  } catch { /* 저장소를 못 쓰면 기본값 */ }
  return DEFAULT_STAFF_KEYS
}

/** 대상 용지에 들어갈 문항 (동의 → 대상별 → 마무리) */
export function printQuestions(payload: SurveyPayload, track: Track): Question[] {
  return [...payload.sections.intake, ...payload.sections[track], ...payload.sections.closing].filter((q) => q.type !== 'divider')
}

function conditionNote(q: Question, all: Question[]): string | null {
  if (!q.showIf) return null
  const parent = all.find((x) => x.key === q.showIf!.key)
  return `${parent ? `‘${parent.label}’ ` : ''}[${q.showIf.in.join(' · ')}] 고르신 분만 답해 주세요`
}

/*
 * 70대 어르신이 돋보기 없이 읽을 수 있게: 본문 15pt 이상, 줄 간격 1.5배 이상, 회색 대신 진한 글씨, 체크 칸 7mm.
 * 크기를 바꿀 때는 여기만 고친다.
 */
const T = {
  question: '17pt',
  option: '15.5pt',
  hint: '13pt',
  notice: '13pt',
  lineHeight: 1.55,
  box: '7mm',
  optionGapY: '3.5mm',
  questionGap: '8mm',
  staff: '11pt',
  staffOption: '10.5pt',
}

function Box({ round, size = T.box }: { round?: boolean; size?: string }) {
  return <span aria-hidden className="inline-block shrink-0 border-2 border-black bg-white"
    style={{ width: size, height: size, borderRadius: round ? '50%' : '1.2mm' }} />
}

function Lines({ n }: { n: number }) {
  return <div>{Array.from({ length: n }, (_, i) => <div key={i} className="border-b-2 border-black/70" style={{ height: '12mm' }} />)}</div>
}

/** 글자 수로 열 수를 정한다 (큰 글씨라 3열은 짧은 보기만) */
function columnsFor(options: string[]): number {
  const longest = options.reduce((m, o) => Math.max(m, o.length), 0)
  return longest <= 6 && options.length > 2 ? 3 : 2
}

function PaperQuestion({ q, no, all, staff, staffNames }: { q: Question; no: number; all: Question[]; staff?: boolean; staffNames: string[] }) {
  const options = q.type === 'staff' ? staffNames : q.options ?? []
  const multi = q.type !== 'single'
  const cols = columnsFor(options)
  const note = conditionNote(q, all)
  if (staff && options.length === 0) {
    return (
      <div data-testid="paper-question" className="flex items-end gap-[2mm] font-bold text-black" style={{ breakInside: 'avoid', marginBottom: '2mm', fontSize: T.staff }}>
        <span className="shrink-0">{q.label}</span>
        <span className="flex-1 border-b border-black/60" style={{ height: '7mm' }} />
      </div>
    )
  }
  if (staff) {
    return (
      <div data-testid="paper-question" style={{ breakInside: 'avoid', marginBottom: '2mm' }}>
        <p className="font-bold text-black" style={{ fontSize: T.staff }}>{q.label}</p>
        <div className="mt-[1.5mm] flex flex-wrap gap-x-[5mm] gap-y-[1.5mm]" style={{ fontSize: T.staffOption }}>
          {options.map((o) => <span key={o} className="flex items-center gap-[1.5mm]"><Box round={!multi} size="4.5mm" />{o}</span>)}
        </div>
      </div>
    )
  }
  return (
    <div data-testid="paper-question" style={{ breakInside: 'avoid', paddingBottom: T.questionGap, lineHeight: T.lineHeight }}>
      <p className="font-bold text-black" style={{ fontSize: T.question }}>
        <span className="mr-[2mm]">{no}.</span>{q.label}
      </p>
      {(q.type === 'single' || q.type === 'multi') && (
        <p className="font-semibold text-black/80" style={{ fontSize: T.hint }}>{multi ? '여러 개 고르셔도 돼요' : '하나만 골라 주세요'}</p>
      )}
      {note && <p className="mt-[1mm] font-semibold text-black/80" style={{ fontSize: T.hint }}>※ {note}</p>}
      {q.notice && (
        <p className="mt-[2.5mm] whitespace-pre-line rounded-[2mm] border-2 border-black/50 px-[4mm] py-[3mm] text-black" style={{ fontSize: T.notice, lineHeight: 1.6 }}>{q.notice}</p>
      )}
      {options.length > 0 ? (
        <div className="mt-[3mm] grid gap-x-[5mm]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, rowGap: T.optionGapY, fontSize: T.option }}>
          {options.map((o) => (
            <div key={o} className="flex items-center gap-[2.5mm] text-black" style={o === ETC ? { gridColumn: `span ${Math.min(cols, 2)}` } : undefined}>
              <Box round={!multi} />
              <span className="leading-snug">{o}</span>
              {o === ETC && <span className="ml-[1mm] flex-1 border-b-2 border-black/70" style={{ height: '7mm' }} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-[2mm]"><Lines n={q.type === 'textarea' ? 3 : 1} /></div>
      )}
    </div>
  )
}

/** 성함·전화번호: 밑줄 하나씩 (전화번호는 10~11자리를 모두 적으시도록) */
function NameAndPhone() {
  const row = (label: string) => (
    <div className="flex items-end gap-[3mm] font-bold">
      <span className="shrink-0" style={{ width: '26mm' }}>{label}</span>
      <span className="flex-1 border-b-2 border-black" style={{ height: '12mm' }} />
    </div>
  )
  return (
    <div data-testid="name-phone" className="mt-[6mm] space-y-[4mm]" style={{ fontSize: '16pt' }}>
      {row('성함')}
      {row('전화번호')}
    </div>
  )
}

/** A4 한 쪽에서 위아래 여백(12mm)을 뺀 본문 높이 */
const PAGE_BODY_MM = 297 - 24

interface Block { key: string; node: ReactNode }

/**
 * 용지 한 종(대상 1개). 문항 높이를 실제로 재서 A4 쪽마다 나눠 담는다 → 화면에 보이는 그대로 인쇄되고 문항이 잘리지 않는다.
 */
function Paper({ track, payload, staffKeys, staffNames }: { track: Track; payload: SurveyPayload; staffKeys: Set<string>; staffNames: string[] }) {
  const all = printQuestions(payload, track)
  const elder = all.filter((q) => !staffKeys.has(q.key) && q.type !== 'staff')
  const staff = all.filter((q) => staffKeys.has(q.key) || q.type === 'staff')
  const accent = ACCENT[track]

  const blocks: Block[] = [
    {
      key: 'head',
      node: (
        <>
          <header className="flex items-stretch gap-[4mm] pb-[4mm]" style={{ borderBottom: `2.5mm solid ${accent}` }}>
            <div className="flex-1" style={{ lineHeight: 1.45 }}>
              <p className="font-semibold text-black/80" style={{ fontSize: '12pt' }}>맬리브레인 3기 · 남동구 치매안심센터</p>
              <h2 className="font-extrabold" style={{ fontSize: '24pt', lineHeight: 1.25 }}>맬리브레인 이용 설문</h2>
              <p className="mt-[1mm]" style={{ fontSize: '14pt' }}>해당하는 곳에 <b>✓ 표시</b>해 주세요.<br />어려운 문항은 비워 두시면 직원이 도와드려요.</p>
            </div>
            <div className="flex flex-col items-center justify-center rounded-[3mm] px-[5mm] text-white" style={{ background: accent, minWidth: '36mm' }}>
              <span className="font-extrabold" style={{ fontSize: '18pt' }}>{TRACK_LABEL[track]}</span>
              <span className="text-center leading-tight" style={{ fontSize: '9.5pt' }}>{TRACK_DESC[track]}</span>
            </div>
          </header>
          <NameAndPhone />
          <div style={{ height: '9mm' }} />
        </>
      ),
    },
    ...elder.map((q, i) => ({ key: q.key, node: <PaperQuestion q={q} no={i + 1} all={all} staffNames={staffNames} /> })),
    { key: '__end', node: <p className="pb-[4mm] text-center font-bold" style={{ fontSize: '16pt' }}>다 쓰셨으면 직원에게 주세요. 감사합니다!</p> },
  ]
  if (staff.length > 0) {
    blocks.push({
      key: '__staff',
      node: (
        <div className="rounded-[2mm] border-[1.4px] border-dashed border-black/70 px-[4mm] py-[3mm]">
          <p className="mb-[3mm] flex items-center gap-[3mm] font-bold" style={{ fontSize: '11pt' }}>
            직원 기입란
            <span className="font-medium text-black/70">입력자 ____________</span>
            <span className="ml-auto flex items-center gap-[1.5mm] font-medium text-black/70"><Box size="4.5mm" /> 앱 입력 완료</span>
          </p>
          <div className="grid grid-cols-2 gap-x-[6mm]">
            {staff.map((q, i) => (
              <div key={q.key} style={q.type === 'textarea' || (q.options?.length ?? 0) > 4 ? { gridColumn: 'span 2' } : undefined}>
                <PaperQuestion q={q} no={i + 1} all={all} staff staffNames={staffNames} />
              </div>
            ))}
          </div>
        </div>
      ),
    })
  }

  // 쪽 나누기: 숨긴 곳에 한 번 그려 높이를 재고, 본문 높이(273mm)를 넘지 않게 순서대로 담는다
  const signature = blocks.map((b) => b.key).join('|') + JSON.stringify(payload) + [...staffKeys].join(',')
  const [pages, setPages] = useState<{ sig: string; keys: string[][] } | null>(null)
  const [fontsTick, setFontsTick] = useState(0)
  const measureRef = useRef<HTMLDivElement>(null)
  const ready = pages && pages.sig === `${signature}#${fontsTick}`

  useEffect(() => {
    let alive = true
    void document.fonts?.ready.then(() => { if (alive) setFontsTick((t) => t + 1) })
    return () => { alive = false }
  }, [])

  useLayoutEffect(() => {
    if (ready || !measureRef.current) return
    const root = measureRef.current
    const ruler = root.querySelector<HTMLElement>('[data-ruler]')!
    const limit = ruler.getBoundingClientRect().height || Infinity // jsdom 은 높이가 0 → 한 쪽에 모두
    const out: string[][] = [[]]
    const used: number[] = [0]
    let staffH = -1
    for (const el of root.querySelectorAll<HTMLElement>('[data-block]')) {
      const h = el.getBoundingClientRect().height
      if (el.dataset.block === '__staff') { staffH = h; continue }
      if (used[used.length - 1] > 0 && used[used.length - 1] + h > limit) { out.push([]); used.push(0) }
      out[out.length - 1].push(el.dataset.block!)
      used[used.length - 1] += h
    }
    // 직원 기입란은 순서와 상관없으니, 뒤쪽부터 남는 공간이 있는 쪽의 맨 아래에 넣는다 (빈 쪽이 하나 더 생기지 않게)
    if (staffH >= 0) {
      let at = -1
      for (let i = out.length - 1; i >= 0; i--) if (used[i] + staffH <= limit) { at = i; break }
      if (at < 0) { out.push([]); at = out.length - 1 }
      out[at].push('__staff')
    }
    setPages({ sig: `${signature}#${fontsTick}`, keys: out })
  })

  const byKey = new Map(blocks.map((b) => [b.key, b.node]))
  return (
    <div data-testid="paper" data-track={track} className="paper-set">
      {!ready ? (
        <div ref={measureRef} aria-hidden className="pointer-events-none fixed left-[-10000px] top-0 bg-white text-black" style={{ width: '184mm' }}>
          <div data-ruler style={{ height: `${PAGE_BODY_MM}mm`, position: 'absolute', visibility: 'hidden' }} />
          {blocks.map((b) => <div key={b.key} data-block={b.key} style={{ display: 'flow-root' }}>{b.node}</div>)}
        </div>
      ) : (
        pages.keys.map((keys, pi) => (
          <section key={pi} data-testid="sheet" className="sheet mx-auto bg-white text-black"
            style={{ width: '210mm', height: '297mm', boxSizing: 'border-box', padding: '12mm 13mm', position: 'relative', overflow: 'hidden', fontFamily: 'inherit' }}>
            <div className="flex h-full flex-col">
              {keys.map((k) => <div key={k} style={{ display: 'flow-root', marginTop: k === '__staff' ? 'auto' : undefined }}>{byKey.get(k)}</div>)}
            </div>
            {pages.keys.length > 1 && (
              <span className="absolute bottom-[5mm] right-[13mm] font-semibold text-black/70" style={{ fontSize: '11pt' }}>
                {TRACK_LABEL[track]} · {pi + 1} / {pages.keys.length}쪽
              </span>
            )}
          </section>
        ))
      )}
    </div>
  )
}

export function PrintSurveyScreen() {
  const engine = useEngine()
  const navigate = useNavigate()
  const payload = engine.schema.payload
  const staffNames = engine.staff.filter((s) => s.active).map((s) => s.name)
  const [tracks, setTracks] = useState<Track[]>(TRACKS)
  const [staffKeys, setStaffKeysState] = useState<string[]>(loadStaffKeys)
  const staffSet = useMemo(() => new Set(staffKeys), [staffKeys])
  const allQs = useMemo(() => {
    const seen = new Map<string, Question>()
    for (const t of TRACKS) for (const q of printQuestions(payload, t)) if (q.type !== 'staff') seen.set(q.key, q)
    return [...seen.values()]
  }, [payload])

  const setStaffKeys = (keys: string[]) => {
    setStaffKeysState(keys)
    try { localStorage.setItem(STAFF_KEYS_STORE, JSON.stringify(keys)) } catch { /* 저장 못 해도 화면엔 반영 */ }
  }
  const toggleTrack = (t: Track) => setTracks((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : TRACKS.filter((x) => x === t || cur.includes(x)))

  return (
    <div className="print-survey">
      <style>{`
        @page { size: A4 portrait; margin: 0; }
        @media print {
          .print-survey .sheet { margin: 0 !important; box-shadow: none !important; break-after: page; }
          .print-survey .paper-set:last-child .sheet:last-child { break-after: auto; }
        }
        @media screen {
          .print-survey .sheet { margin-bottom: 8mm; box-shadow: var(--shadow-card); }
        }
      `}</style>
      <div className="no-print mx-auto max-w-5xl px-6 pb-4 pt-8">
        <div className="mb-4"><Button variant="ghost" onClick={() => navigate('/')}>← 돌아가기</Button></div>
        <PageTitle sub={`설문지 v${engine.schema.version} 기준 · 설문지를 고치면 여기도 바로 바뀝니다 · A4 세로`}
          right={<Button variant="primary" onClick={() => window.print()} disabled={tracks.length === 0}>인쇄 · PDF 저장</Button>}>
          인쇄용 설문지
        </PageTitle>
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-[15px] font-semibold text-grey-700">인쇄할 용지</span>
            {TRACKS.map((t) => (
              <Chip key={t} selected={tracks.includes(t)} onClick={() => toggleTrack(t)}>{TRACK_LABEL[t]}</Chip>
            ))}
          </div>
          <details>
            <summary className="cursor-pointer text-[15px] font-semibold text-grey-700">직원이 적는 문항 고르기 <span className="font-normal text-grey-500">(체크한 문항은 아래 ‘직원 기입란’으로 갑니다)</span></summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {allQs.map((q) => (
                <Chip key={q.key} selected={staffSet.has(q.key)}
                  onClick={() => setStaffKeys(staffSet.has(q.key) ? staffKeys.filter((k) => k !== q.key) : [...staffKeys, q.key])}>
                  {q.label}
                </Chip>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setStaffKeys(DEFAULT_STAFF_KEYS)}>기본값으로</Button>
          </details>
          <p className="text-[14px] text-grey-500">
            화면에 보이는 쪽 그대로 인쇄됩니다(문항이 쪽 사이에서 잘리지 않아요). 인쇄 창에서 <b>여백: 없음</b>, <b>배경 그래픽: 켜기</b>(대상 색 띠)로 두세요.
          </p>
        </Card>
      </div>
      <div className="pb-10 print:pb-0">
        {tracks.map((t) => <Paper key={t} track={t} payload={payload} staffKeys={staffSet} staffNames={staffNames} />)}
      </div>
    </div>
  )
}

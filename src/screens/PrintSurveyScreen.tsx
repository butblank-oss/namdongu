import { useMemo, useState } from 'react'
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

function Box({ round }: { round?: boolean }) {
  return <span aria-hidden className="inline-block shrink-0 border-[1.6px] border-black bg-white"
    style={{ width: '5mm', height: '5mm', borderRadius: round ? '50%' : '1mm' }} />
}

function Lines({ n }: { n: number }) {
  return <div>{Array.from({ length: n }, (_, i) => <div key={i} className="border-b border-black/60" style={{ height: '9mm' }} />)}</div>
}

function PaperQuestion({ q, no, all, staff, staffNames }: { q: Question; no: number; all: Question[]; staff?: boolean; staffNames: string[] }) {
  const options = q.type === 'staff' ? staffNames : q.options ?? []
  const multi = q.type !== 'single'
  const cols = options.length > 10 ? 3 : options.reduce((m, o) => Math.max(m, o.length), 0) > 12 ? 2 : 3
  const note = conditionNote(q, all)
  if (staff && options.length === 0) {
    return (
      <div data-testid="paper-question" className="flex items-end gap-[2mm] font-bold text-black" style={{ breakInside: 'avoid', marginBottom: '2mm', fontSize: '11pt' }}>
        <span className="shrink-0">{q.label}</span>
        <span className="flex-1 border-b border-black/60" style={{ height: '7mm' }} />
      </div>
    )
  }
  return (
    <div data-testid="paper-question" style={{ breakInside: 'avoid', marginBottom: staff ? '2mm' : '3.5mm' }}>
      <p className="font-bold leading-snug text-black" style={{ fontSize: staff ? '11pt' : '13.5pt' }}>
        {!staff && <span className="mr-[2mm]">{no}.</span>}{q.label}
        {(q.type === 'single' || q.type === 'multi') && !staff && (
          <span className="ml-[2mm] font-medium text-black/60" style={{ fontSize: '11pt' }}>
            {multi ? '(여러 개 고르셔도 돼요)' : '(하나만)'}
          </span>
        )}
      </p>
      {note && <p className="mt-[1mm] text-black/60" style={{ fontSize: '10.5pt' }}>※ {note}</p>}
      {q.notice && (
        <p className="mt-[2mm] whitespace-pre-line rounded-[1.5mm] border border-black/40 px-[3mm] py-[2mm] leading-snug text-black/80" style={{ fontSize: '9.5pt' }}>{q.notice}</p>
      )}
      {options.length > 0 && staff ? (
        <div className="mt-[1.5mm] flex flex-wrap gap-x-[5mm] gap-y-[1.5mm]" style={{ fontSize: '10pt' }}>
          {options.map((o) => <span key={o} className="flex items-center gap-[1.5mm]"><Box round={!multi} />{o}</span>)}
        </div>
      ) : options.length > 0 ? (
        <div className="mt-[1.5mm] grid gap-x-[4mm] gap-y-[1.5mm]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, fontSize: staff ? '10.5pt' : '12.5pt' }}>
          {options.map((o) => (
            <div key={o} className="flex items-center gap-[2mm] text-black" style={o === ETC ? { gridColumn: `span ${Math.min(cols, 2)}` } : undefined}>
              <Box round={!multi} />
              <span className="leading-tight">{o}</span>
              {o === ETC && <span className="ml-[1mm] flex-1 border-b border-black/60" style={{ height: '5mm' }} />}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-[2mm]"><Lines n={q.type === 'textarea' && !staff ? 3 : 1} /></div>
      )}
    </div>
  )
}

function Paper({ track, payload, staffKeys, staffNames }: { track: Track; payload: SurveyPayload; staffKeys: Set<string>; staffNames: string[] }) {
  const all = printQuestions(payload, track)
  const elder = all.filter((q) => !staffKeys.has(q.key) && q.type !== 'staff')
  const staff = all.filter((q) => staffKeys.has(q.key) || q.type === 'staff')
  const accent = ACCENT[track]
  return (
    <section data-testid="paper" data-track={track} className="paper mx-auto bg-white text-black"
      style={{ width: '210mm', boxSizing: 'border-box', padding: '12mm 13mm', fontFamily: 'inherit' }}>
      <header className="flex items-stretch gap-[4mm] pb-[4mm]" style={{ borderBottom: `2.5mm solid ${accent}` }}>
        <div className="flex-1">
          <p className="font-semibold text-black/60" style={{ fontSize: '11pt' }}>맬리브레인 3기 · 남동구 치매안심센터</p>
          <h2 className="font-extrabold leading-tight" style={{ fontSize: '20pt' }}>맬리브레인 이용 설문</h2>
          <p className="mt-[1mm]" style={{ fontSize: '12pt' }}>해당하는 곳에 <b>✓ 표시</b>해 주세요. 어려운 문항은 비워 두시면 직원이 도와드려요.</p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-[3mm] px-[5mm] text-white" style={{ background: accent, minWidth: '34mm' }}>
          <span className="font-extrabold" style={{ fontSize: '17pt' }}>{TRACK_LABEL[track]}</span>
          <span className="text-center leading-tight" style={{ fontSize: '9pt' }}>{TRACK_DESC[track]}</span>
        </div>
      </header>

      <div className="mt-[4mm] grid grid-cols-2 gap-[6mm]" style={{ fontSize: '13pt', breakInside: 'avoid' }}>
        <label className="flex items-end gap-[2mm] font-bold">성함<span className="flex-1 border-b border-black" style={{ height: '8mm' }} /></label>
        <div className="flex items-end gap-[2mm] font-bold">
          전화번호 뒷 4자리
          <span className="flex gap-[1.5mm]">{[0, 1, 2, 3].map((i) => <span key={i} className="inline-block border-[1.6px] border-black" style={{ width: '9mm', height: '10mm' }} />)}</span>
        </div>
      </div>

      <div className="mt-[5mm]">
        {elder.map((q, i) => <PaperQuestion key={q.key} q={q} no={i + 1} all={all} staffNames={staffNames} />)}
        <p className="mt-[2mm] text-center font-bold" style={{ fontSize: '13pt' }}>다 쓰셨으면 직원에게 주세요. 감사합니다!</p>
      </div>

      {staff.length > 0 && (
        <div className="mt-[5mm] rounded-[2mm] border-[1.4px] border-dashed border-black/70 px-[4mm] py-[3mm]">
          <p className="mb-[3mm] flex items-center gap-[3mm] font-bold" style={{ fontSize: '11pt' }}>
            직원 기입란
            <span className="font-medium text-black/70">입력자 ____________</span>
            <span className="ml-auto flex items-center gap-[1.5mm] font-medium text-black/70"><Box /> 앱 입력 완료</span>
          </p>
          <div className="grid grid-cols-2 gap-x-[6mm]">
            {staff.map((q, i) => (
              <div key={q.key} style={q.type === 'textarea' || (q.options?.length ?? 0) > 4 ? { gridColumn: 'span 2' } : undefined}>
                <PaperQuestion q={q} no={i + 1} all={all} staff staffNames={staffNames} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
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
        @page { size: A4 portrait; margin: 12mm 13mm; }
        @media print {
          .print-survey .paper { width: auto !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; background: none !important; }
          .print-survey .paper + .paper { break-before: page; }
        }
        @media screen {
          .print-survey .paper { position: relative; min-height: 297mm; margin-bottom: 8mm; box-shadow: var(--shadow-card); }
          /* 인쇄하면 쪽이 나뉘는 자리 (A4 297mm - 위아래 여백 24mm = 본문 273mm마다) */
          .print-survey .paper::before {
            content: ''; position: absolute; left: 0; right: 0; top: 12mm; bottom: 0; pointer-events: none;
            background-image: repeating-linear-gradient(to bottom, transparent 0, transparent calc(273mm - 1px), #f04452 calc(273mm - 1px), #f04452 273mm);
          }
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
            빨간 선은 인쇄할 때 쪽이 나뉘는 자리입니다. 인쇄 창에서 <b>여백: 기본</b>, <b>배경 그래픽: 켜기</b>(대상 색 띠)로 두세요. 용지는 대상마다 새 쪽에서 시작합니다.
          </p>
        </Card>
      </div>
      <div className="pb-10 print:pb-0">
        {tracks.map((t) => <Paper key={t} track={t} payload={payload} staffKeys={staffSet} staffNames={staffNames} />)}
      </div>
    </div>
  )
}

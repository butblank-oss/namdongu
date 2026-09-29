import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useDB, useEngine } from '../app/context'
import { QuestionField } from '../components/QuestionField'
import { Badge, Button, Screen, TRACK_TONE } from '../components/ui'
import { etcKey, RESULT_STATUS } from '../lib/defaultSchema'
import { nowIso } from '../lib/engine'
import { buildSections, isVisible, missingRequired } from '../lib/survey'
import { TRACK_DESC, TRACK_LABEL, type AnswerValue, type Answers, type LocalResponse } from '../lib/types'

const PERSIST_DELAY = 250

/** 예약 key 는 응답 테이블 컬럼에도 반영한다 */
function applyAnswers(r: LocalResponse, answers: Answers): LocalResponse {
  const str = (v: AnswerValue | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    ...r,
    answers,
    consent: str(answers.consent),
    real_name: str(answers.real_name) ?? r.real_name,
    result: str(answers.result),
  }
}

export function SurveyScreen() {
  const { rid = '' } = useParams()
  const db = useDB()
  const engine = useEngine()
  const [initial, setInitial] = useState<LocalResponse | null | undefined>(undefined)

  // 한 번만 읽는다. 이후 서버/다른 기기 변경이 들어와도 입력 중인 화면을 덮어쓰지 않는다
  useEffect(() => {
    let alive = true
    void db.responses.get(engine.resolveId(rid)).then((r) => { if (alive) setInitial(r ?? null) })
    return () => { alive = false }
  }, [db, engine, rid])

  if (initial === undefined) return <Screen><p className="text-xl">불러오는 중…</p></Screen>
  if (initial === null) return <Screen><p className="text-xl">응답을 찾을 수 없습니다.</p></Screen>
  return <SurveyForm key={rid} initial={initial} />
}

function SurveyForm({ initial }: { initial: LocalResponse }) {
  const engine = useEngine()
  const navigate = useNavigate()
  const [answers, setAnswers] = useState<Answers>(() => ({
    ...initial.answers,
    ...(initial.real_name && !initial.answers.real_name ? { real_name: initial.real_name } : {}),
  }))
  const answersRef = useRef(answers)
  const [errors, setErrors] = useState<string[]>([])
  const [tried, setTried] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isEdit = initial.status !== 'in_progress'

  const sections = useMemo(() => buildSections(engine.schema.payload, initial.track, answers),
    [engine.schema.payload, initial.track, answers])
  const allQuestions = useMemo(() => sections.flatMap((s) => s.questions), [sections])
  const staffNames = useMemo(() => engine.staff.filter((s) => s.active).map((s) => s.name), [engine.staff])

  // 진행률: 보이는 필수 문항 중 답한 수
  const required = allQuestions.filter((q) => q.type !== 'divider' && q.required && isVisible(q, answers))
  const missingNow = missingRequired(allQuestions, answers)
  const doneCount = required.length - missingNow.length

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const snapshot = answersRef.current
    await engine.updateResponse(initial.id, (r) => applyAnswers(r, snapshot))
  }, [engine, initial.id])

  // 화면을 떠날 때 마지막 입력을 저장
  useEffect(() => () => { if (timer.current) void flush() }, [flush])

  const onChange = useCallback((key: string, value: AnswerValue) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value }
      answersRef.current = next
      return next
    })
    setErrors((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : prev))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), PERSIST_DELAY)
  }, [flush])

  const complete = useCallback(async () => {
    setTried(true)
    const snapshot = answersRef.current
    const questions = buildSections(engine.schema.payload, initial.track, snapshot).flatMap((s) => s.questions)
    const missing = missingRequired(questions, snapshot)
    setErrors(missing)
    if (missing.length) {
      const el = document.querySelector<HTMLElement>(`[data-testid="question-${missing[0]}"]`)
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      el?.querySelector<HTMLElement>('button, input, textarea')?.focus({ preventScroll: true })
      return
    }
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const result = typeof snapshot.result === 'string' ? snapshot.result : ''
    await engine.updateResponse(initial.id, (r) => ({
      ...applyAnswers(r, snapshot),
      status: RESULT_STATUS[result] ?? 'done',
      completed_at: r.completed_at && isEdit ? r.completed_at : nowIso(),
    }))
    navigate(`/r/${engine.resolveId(initial.id)}/done`)
  }, [engine, initial.id, initial.track, navigate, isEdit])

  const remove = useCallback(async () => {
    if (!window.confirm('이 응답을 삭제할까요? 목록에서 사라지고 이 어르신을 새로 응대할 수 있게 됩니다.')) return
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    await engine.updateResponse(initial.id, (r) => ({ ...r, deleted_at: nowIso() }))
    await engine.logAccess('delete', initial.participant_id, engine.resolveId(initial.id))
    navigate('/')
  }, [engine, initial.id, initial.participant_id, navigate])

  const leave = useCallback(async () => {
    await flush()
    navigate(-1)
  }, [flush, navigate])

  // 키보드: Ctrl+Enter 응대 완료
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void complete() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [complete])

  const who = initial.manual_info
    ? `${initial.manual_info.name} (${initial.manual_info.phone_last4}) · 명단 외`
    : null
  const participantLabel = useParticipantLabel(initial.participant_id) ?? who
  const pct = required.length ? Math.round((doneCount / required.length) * 100) : 100

  return (
    <Screen className="pb-32">
      <div className="sticky top-[60px] z-30 -mx-6 mb-4 border-b-2 border-slate-300 bg-slate-100/95 px-6 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button onClick={() => void leave()}>← 뒤로</Button>
          <span className="text-xl font-bold">{participantLabel}</span>
          <Badge tone={TRACK_TONE[initial.track]}>{TRACK_LABEL[initial.track]}</Badge>
          {initial.verified === 'skipped' && <Badge tone="red">본인 확인 못함</Badge>}
          {isEdit && <Badge tone="green">완료된 응답 수정 중</Badge>}
          {engine.isAdmin && <Button variant="danger" onClick={() => void remove()}>응답 삭제</Button>}
          <span className="ml-auto text-lg font-bold" data-testid="progress-required">필수 {doneCount} / {required.length}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-300" aria-hidden>
            <div className="h-full rounded-full bg-emerald-600 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <nav className="flex gap-1" aria-label="섹션 이동">
            {sections.map((s) => (
              <button key={s.id} type="button" className="rounded px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })}>
                {s.title}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="space-y-8" data-testid="survey-step">
        {sections.map((sec) => (
          <section key={sec.id} id={`sec-${sec.id}`} className="scroll-mt-40 space-y-3" aria-label={sec.title}>
            <h2 className="flex items-center gap-3 text-2xl font-extrabold text-slate-800">
              {sec.title}
              {sec.id === 'track' && <span className="text-base font-semibold text-slate-600">{TRACK_DESC[initial.track]}</span>}
            </h2>
            {sec.id === 'track' && engine.schema.payload.guides[initial.track] && (
              <p className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-lg">{engine.schema.payload.guides[initial.track]}</p>
            )}
            {sec.questions.filter((q) => isVisible(q, answers)).map((q) => q.type === 'divider'
              ? <hr key={q.key} className="border-t-2 border-slate-300" />
              : (
                <QuestionField key={q.key} q={q} value={answers[q.key]} etcValue={answers[etcKey(q.key)] as string | undefined}
                  invalid={errors.includes(q.key)} staffNames={staffNames} onChange={onChange} />
              ))}
          </section>
        ))}
        {answers.consent === '미동의' && (
          <p className="rounded-xl bg-amber-100 p-4 text-lg">개인정보 미동의라 설문 문항은 생략합니다. 응대 결과만 남겨 주세요.</p>
        )}
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t-2 border-slate-300 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          {tried && errors.length > 0
            ? <span className="font-bold text-red-700" role="status">필수 문항 {errors.length}개가 비어 있습니다</span>
            : <span className="text-base text-slate-600">입력은 자동 저장됩니다 · Ctrl+Enter 응대 완료</span>}
          <Button size="lg" variant="success" className="ml-auto" onClick={() => void complete()}>
            {isEdit ? '수정 완료' : '응대 완료'}
          </Button>
        </div>
      </div>
    </Screen>
  )
}

function useParticipantLabel(pid: string | null): string | null {
  const db = useDB()
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    if (!pid) return
    void db.participants.get(pid).then((p) => { if (p) setLabel(`${p.full_name || p.name_masked} (${p.phone_last4 ?? '----'})`) })
  }, [db, pid])
  return label
}

/** 관문을 통과하지 않은 응답이면 본인 확인 화면으로 돌려보낸다 */
export function GuardedSurvey() {
  const { rid = '' } = useParams()
  const engine = useEngine()
  const [target, setTarget] = useState<string | null | undefined>(undefined)
  const passed = engine.passedGate.has(rid) || engine.passedGate.has(engine.resolveId(rid))
  useEffect(() => {
    if (passed) return
    void engine.db.responses.get(engine.resolveId(rid)).then((r) => setTarget(r?.participant_id ? `/p/${r.participant_id}` : r ? null : '/'))
  }, [engine, rid, passed])
  if (passed) return <SurveyScreen />
  if (target === undefined) return <Screen><p className="text-xl">불러오는 중…</p></Screen>
  if (target) return <Navigate to={target} replace />
  // 명단 외 응답은 직원이 직접 입력한 정보라 조회 관문이 없다
  engine.passedGate.add(rid)
  return <SurveyScreen />
}

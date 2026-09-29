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
    <Screen className="max-w-3xl pb-36">
      <div className="sticky top-[60px] z-30 -mx-6 mb-6 bg-grey-100/90 px-6 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => void leave()} aria-label="뒤로"
            className="grid h-10 w-10 place-items-center rounded-xl text-[22px] text-grey-700 hover:bg-grey-200">←</button>
          <span className="text-[21px] font-bold text-grey-900">{participantLabel}</span>
          <Badge tone={TRACK_TONE[initial.track]}>{TRACK_LABEL[initial.track]}</Badge>
          {initial.verified === 'skipped' && <Badge tone="red">본인 확인 못함</Badge>}
          {isEdit && <Badge tone="green">완료된 응답 수정 중</Badge>}
          <span className="tabular ml-auto text-[15px] font-semibold text-grey-600" data-testid="progress-required">
            필수 <span className="text-blue-500">{doneCount}</span> / {required.length}
          </span>
          {engine.isAdmin && <Button variant="dangerWeak" size="sm" onClick={() => void remove()}>응답 삭제</Button>}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grey-200" aria-hidden>
            <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <nav className="flex gap-1" aria-label="섹션 이동">
            {sections.map((s) => (
              <button key={s.id} type="button" className="rounded-lg px-2.5 py-1 text-[14px] font-semibold text-grey-500 hover:bg-grey-200 hover:text-grey-800"
                onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })}>
                {s.title}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="space-y-10" data-testid="survey-step">
        {sections.map((sec) => (
          <section key={sec.id} id={`sec-${sec.id}`} className="scroll-mt-40 space-y-3" aria-label={sec.title}>
            <h2 className="flex items-baseline gap-2 px-1 text-[22px] font-bold text-grey-900">
              {sec.title}
              {sec.id === 'track' && <span className="text-[15px] font-medium text-grey-500">{TRACK_DESC[initial.track]}</span>}
            </h2>
            {sec.id === 'track' && engine.schema.payload.guides[initial.track] && (
              <p className="rounded-2xl bg-blue-50 px-5 py-4 text-[16px] leading-relaxed text-blue-700">{engine.schema.payload.guides[initial.track]}</p>
            )}
            {sec.questions.filter((q) => isVisible(q, answers)).map((q) => q.type === 'divider'
              ? <div key={q.key} className="h-2" />
              : (
                <QuestionField key={q.key} q={q} value={answers[q.key]} etcValue={answers[etcKey(q.key)] as string | undefined}
                  invalid={errors.includes(q.key)} staffNames={staffNames} onChange={onChange} />
              ))}
          </section>
        ))}
        {answers.consent === '미동의' && (
          <p className="rounded-2xl bg-orange-50 px-5 py-4 text-[16px] text-orange-600">개인정보 미동의라 설문 문항은 생략합니다. 응대 결과만 남겨 주세요.</p>
        )}
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 bg-white/95 shadow-[0_-1px_0_var(--color-grey-200)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-4 px-6 py-4">
          {tried && errors.length > 0
            ? <span className="text-[15px] font-semibold text-red-500" role="status">필수 문항 {errors.length}개가 비어 있습니다</span>
            : <span className="text-[14px] text-grey-500">입력은 자동 저장돼요 · Ctrl+Enter 응대 완료</span>}
          <Button size="xl" variant="primary" className="ml-auto min-w-56" onClick={() => void complete()}>
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

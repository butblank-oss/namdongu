import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useDB, useEngine } from '../app/context'
import { QuestionField } from '../components/QuestionField'
import { Badge, Button, Screen, TRACK_TONE } from '../components/ui'
import { RESULT_STATUS } from '../lib/defaultSchema'
import { nowIso } from '../lib/engine'
import { buildSteps, isVisible, missingRequired } from '../lib/survey'
import type { AnswerValue, Answers, LocalResponse } from '../lib/types'

const PERSIST_DELAY = 250

/** 예약 key 는 응답 테이블 컬럼에도 반영한다 */
function applyAnswers(r: LocalResponse, answers: Answers): LocalResponse {
  const str = (v: AnswerValue | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    ...r,
    answers,
    consent: str(answers.consent),
    helpers: Array.isArray(answers.helpers) ? answers.helpers : [],
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
  const stepKey = `namdongu.step.${initial.id}`
  const [stepIdx, setStepIdx] = useState(() => {
    try { return Number(sessionStorage.getItem(stepKey) ?? 0) || 0 } catch { return 0 }
  })
  const [errors, setErrors] = useState<string[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const topRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(() => buildSteps(engine.schema.payload, initial.track), [engine.schema.payload, initial.track])
  const idx = Math.min(stepIdx, steps.length - 1)
  const step = steps[idx]
  const isLast = idx === steps.length - 1
  const staffNames = useMemo(() => engine.staff.filter((s) => s.active).map((s) => s.name), [engine.staff])

  useEffect(() => { try { sessionStorage.setItem(stepKey, String(idx)) } catch { /* 무시 */ } }, [stepKey, idx])

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

  const validate = useCallback(() => {
    const missing = missingRequired(step, answersRef.current)
    setErrors(missing)
    if (missing.length) {
      const el = document.querySelector<HTMLElement>(`[data-testid="question-${missing[0]}"]`)
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      el?.querySelector<HTMLElement>('button, input, textarea')?.focus({ preventScroll: true })
    }
    return missing.length === 0
  }, [step])

  const goNext = useCallback(async () => {
    if (!validate()) return
    await flush()
    setStepIdx(idx + 1)
    topRef.current?.scrollIntoView?.({ block: 'start' })
  }, [validate, flush, idx])

  const goPrev = useCallback(async () => {
    await flush()
    setErrors([])
    setStepIdx(Math.max(0, idx - 1))
  }, [flush, idx])

  const complete = useCallback(async () => {
    if (!validate()) return
    const snapshot = answersRef.current
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const result = typeof snapshot.result === 'string' ? snapshot.result : ''
    await engine.updateResponse(initial.id, (r) => ({
      ...applyAnswers(r, snapshot),
      status: RESULT_STATUS[result] ?? 'done',
      completed_at: nowIso(),
    }))
    try { sessionStorage.removeItem(stepKey) } catch { /* 무시 */ }
    navigate(`/r/${engine.resolveId(initial.id)}/done`)
  }, [validate, engine, initial.id, navigate, stepKey])

  const remove = useCallback(async () => {
    if (!window.confirm('이 응답을 삭제할까요? 목록에서 사라지고 이 어르신을 새로 응대할 수 있게 됩니다.')) return
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    await engine.updateResponse(initial.id, (r) => ({ ...r, deleted_at: nowIso() }))
    await engine.logAccess('delete', initial.participant_id, engine.resolveId(initial.id))
    navigate('/')
  }, [engine, initial.id, initial.participant_id, navigate])

  const leave = useCallback(async () => {
    await flush()
    navigate('/')
  }, [flush, navigate])

  // 키보드: Ctrl+Enter 다음/완료, Alt+← 이전, Alt+→ 다음
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void (isLast ? complete() : goNext()) }
      else if (e.altKey && e.key === 'ArrowRight' && !isLast) { e.preventDefault(); void goNext() }
      else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); void goPrev() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [isLast, complete, goNext, goPrev])

  const who = initial.manual_info
    ? `${initial.manual_info.name} (${initial.manual_info.phone_last4}) · 명단 외`
    : null
  const participantLabel = useParticipantLabel(initial.participant_id) ?? who
  const trackGuide = step.id.startsWith(initial.track) && step.id.endsWith('-0') ? engine.schema.payload.guides[initial.track] : null

  return (
    <Screen className="pb-32">
      <div ref={topRef} className="sticky top-[60px] z-30 -mx-6 mb-4 flex items-center gap-3 border-b-2 border-slate-300 bg-slate-100/95 px-6 py-3 backdrop-blur">
        <Button onClick={() => void leave()}>← 목록으로</Button>
        <span className="text-xl font-bold">{participantLabel}</span>
        <Badge tone={TRACK_TONE[initial.track]}>트랙 {initial.track}</Badge>
        {initial.verified === 'skipped' && <Badge tone="red">본인 확인 못함</Badge>}
        {engine.isAdmin && <Button variant="danger" onClick={() => void remove()}>응답 삭제</Button>}
        <span className="ml-auto text-lg text-slate-600">{step.title}</span>
        <span className="rounded-lg bg-slate-900 px-4 py-1 text-2xl font-black text-white" data-testid="step-indicator">
          {idx + 1} / {steps.length}
        </span>
      </div>

      {trackGuide && <p className="mb-4 rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-lg">{trackGuide}</p>}

      <div className="space-y-3" data-testid="survey-step">
        {step.questions.filter((q) => isVisible(q, answers)).map((q) => (
          <QuestionField key={q.key} q={q} value={answers[q.key]} invalid={errors.includes(q.key)}
            staffNames={staffNames} onChange={onChange} />
        ))}
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t-2 border-slate-300 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-3">
          <Button size="lg" onClick={() => void goPrev()} disabled={idx === 0}>이전</Button>
          {errors.length > 0 && <span className="font-bold text-red-700" role="status">필수 문항 {errors.length}개가 비어 있습니다</span>}
          <span className="ml-auto hidden text-sm text-slate-500 lg:inline">Ctrl+Enter {isLast ? '완료' : '다음'} · Alt+← 이전</span>
          {isLast
            ? <Button size="lg" variant="success" onClick={() => void complete()}>응대 완료</Button>
            : <Button size="lg" variant="primary" onClick={() => void goNext()}>다음</Button>}
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
    void db.participants.get(pid).then((p) => { if (p) setLabel(`${p.name_masked} (${p.phone_last4 ?? '----'})`) })
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

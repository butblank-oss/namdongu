import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDB, useEngine, useResponseIndex } from '../app/context'
import { Badge, Button, Modal, Screen, TRACK_TONE } from '../components/ui'
import { nowIso } from '../lib/engine'
import { COHORT_LABEL, TRACK_DESC, TRACK_LABEL, type Participant, type Verified } from '../lib/types'

export function VerifyScreen() {
  const { pid = '' } = useParams()
  const engine = useEngine()
  const navigate = useNavigate()
  const db = useDB()
  const participant = useLiveQuery(() => db.participants.get(pid).then((p) => p ?? null), [db, pid])
  if (participant === undefined) return <Screen><p className="text-xl">불러오는 중…</p></Screen>
  if (participant === null) {
    return (
      <Screen>
        <p className="text-xl">명단에서 찾을 수 없습니다.</p>
        <Button className="mt-4" onClick={() => navigate('/')}>찾기로 돌아가기</Button>
      </Screen>
    )
  }
  return <VerifyCard key={pid} participant={participant} onBack={() => navigate('/')} engine={engine} />
}

function VerifyCard({ participant: p, onBack, engine }: { participant: Participant; onBack: () => void; engine: ReturnType<typeof useEngine> }) {
  const navigate = useNavigate()
  const location = useLocation()
  const index = useResponseIndex()
  const existing = index.get(p.id)
  // 뒷 4자리로 검색해 들어왔으면 어르신이 이미 번호를 말씀하신 것 → 성함만 확인
  const searchedDigits = (location.state as { q?: string } | null)?.q?.trim() ?? ''
  const cameByPhone = /^\d{4}$/.test(searchedDigits) && searchedDigits === p.phone_last4
  const [typed, setTyped] = useState(cameByPhone ? searchedDigits : '')
  const [ackConflict, setAckConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const okRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const complete4 = /^\d{4}$/.test(typed)
  const matched = complete4 && typed === p.phone_last4
  const mismatched = complete4 && !matched

  // 열람 기록 + 다른 기기에 "이 분을 열었음" 알림
  useEffect(() => {
    void engine.logAccess('view', p.id)
    engine.openParticipant(p.id)
    // 서버에 더 최신 응답이 있는지 확인 (오프라인이면 조용히 실패)
    engine.remote.fetchResponseByParticipant(p.id).then((r) => { if (r) void engine.mergeRemote(r) }).catch(() => {})
    if (cameByPhone) okRef.current?.focus()
    else inputRef.current?.focus()
    return () => engine.openParticipant(null)
  }, [engine, p.id, cameByPhone])

  useEffect(() => { if (matched) okRef.current?.focus() }, [matched])

  const others = engine.othersOpening(p.id)
  const takenBy = existing && existing.status === 'in_progress' && existing.device_id !== engine.device ? existing.entered_by : null
  const alreadyDone = existing && existing.status !== 'in_progress'
  const conflict = !ackConflict && (others.length > 0 || takenBy || alreadyDone)

  async function proceed(verified: Verified) {
    if (busy) return
    setBusy(true)
    const patch = { verified, verified_by: engine.me, verified_at: nowIso() }
    let id: string
    // 목록 인덱스가 늦게 읽혀도 중복 응답을 만들지 않도록 DB에서 다시 확인
    const found = await engine.findResponseFor(p.id)
    if (found) {
      await engine.takeOver(found.id, patch)
      id = found.id
    } else {
      // 대상 구분(트랙)은 명단의 활동 기록으로 자동 판정된 값을 그대로 쓴다
      const r = await engine.createResponse({ participant: p, track: p.track, verified })
      id = r.id
    }
    engine.passedGate.add(id)
    await engine.logAccess('verify', p.id, id)
    navigate(`/r/${id}`)
  }

  return (
    <Screen>
      {conflict && (
        <Modal title="다른 직원이 응대 중일 수 있습니다" onClose={onBack}>
          <div className="space-y-2 text-lg" data-testid="conflict-warning">
            {others.map((o) => <p key={o.device_id}><b>{o.staff_name || '다른 기기'}</b>님이 지금 이 어르신 화면을 열어 두었습니다.</p>)}
            {takenBy && <p><b>{takenBy}</b>님이 이 어르신 설문을 진행 중입니다.</p>}
            {alreadyDone && <p>이미 응대가 끝난 분입니다 (입력자 <b>{existing!.entered_by}</b>). 이어받으면 기존 응답을 수정합니다.</p>}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button size="lg" onClick={onBack}>취소</Button>
            <Button size="lg" variant="primary" onClick={() => setAckConflict(true)}>이어받기</Button>
          </div>
        </Modal>
      )}

      <div className="rounded-2xl border-2 border-slate-300 bg-white p-8">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="text-4xl font-extrabold">{p.name_masked}</span>
          <span className="text-2xl">{p.birth_year ? `${p.birth_year}년생` : '생년 미상'}</span>
          <span className="text-2xl text-slate-700">{p.age_group === '?' ? '' : `${p.age_group}대 · `}{p.sex === 'F' ? '여성' : p.sex === 'M' ? '남성' : '성별 미상'}</span>
          {p.cohort !== '3' && <Badge tone="red">{COHORT_LABEL[p.cohort]}</Badge>}
        </div>
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-lg" data-testid="target-desc">
          <Badge tone={TRACK_TONE[p.track]}>{TRACK_LABEL[p.track]}</Badge> {TRACK_DESC[p.track]}
        </p>

        <hr className="my-6 border-slate-200" />

        {cameByPhone ? (
          <div className="text-center">
            <p className="text-2xl font-bold text-emerald-800" data-testid="verify-status">✓ 전화번호 뒷자리 {p.phone_last4} 일치</p>
            <p className="mt-3 text-3xl font-extrabold">“{p.name_masked[0]}○○ 님 맞으세요? {p.birth_year ? `${p.birth_year}년생이시고요?` : ''}”</p>
            <p className="mt-2 text-lg text-slate-600">성함과 생년이 맞으면 확인 완료를 누르세요.</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-3xl font-extrabold">“전화번호 뒷 네 자리가 어떻게 되세요?”</p>
            <p className="mt-2 text-lg text-slate-600">어르신이 말씀하신 번호를 입력하면 명단과 자동으로 맞춰 봅니다.</p>
            <input ref={inputRef} aria-label="어르신이 말한 뒷 4자리" value={typed} inputMode="numeric" maxLength={4} autoComplete="off"
              onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))}
              onKeyDown={(e) => { if (e.key === 'Enter' && matched) void proceed('ok') }}
              className={`mx-auto mt-4 block w-72 rounded-xl border-4 px-4 py-3 text-center font-mono text-6xl font-black tracking-[0.3em] ${
                matched ? 'border-emerald-600 bg-emerald-50' : mismatched ? 'border-red-600 bg-red-50' : 'border-slate-400'}`} />
            <p className="mt-3 min-h-8 text-2xl font-bold" data-testid="verify-status" role="status">
              {matched && <span className="text-emerald-800">✓ 명단과 일치합니다</span>}
              {mismatched && <span className="text-red-700">✗ 명단의 번호와 다릅니다. 다시 여쭤 보세요</span>}
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Button ref={okRef} size="xl" variant="success" disabled={busy || !(cameByPhone || matched)} onClick={() => void proceed('ok')}>
          본인 확인 완료
        </Button>
        <Button size="xl" onClick={onBack}>다른 분입니다</Button>
        <Button size="xl" variant="secondary" disabled={busy} onClick={() => void proceed(mismatched ? 'failed' : 'skipped')}>확인 못 했지만 진행</Button>
      </div>
    </Screen>
  )
}

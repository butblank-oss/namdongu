import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDB, useEngine, useResponseIndex } from '../app/context'
import { Badge, Button, Card, Modal, Screen, TRACK_TONE } from '../components/ui'
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
        <Button variant="white" className="mt-4" onClick={() => navigate('/')}>찾기로 돌아가기</Button>
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
    <>
      {conflict && (
        <Modal title="다른 직원이 응대 중일 수 있습니다" onClose={onBack}>
          <div className="space-y-2 text-[17px] leading-relaxed text-grey-700" data-testid="conflict-warning">
            {others.map((o) => <p key={o.device_id}><b>{o.staff_name || '다른 기기'}</b>님이 지금 이 어르신 화면을 열어 두었습니다.</p>)}
            {takenBy && <p><b>{takenBy}</b>님이 이 어르신 설문을 진행 중입니다.</p>}
            {alreadyDone && <p>이미 응대가 끝난 분입니다 (입력자 <b>{existing!.entered_by}</b>). 이어받으면 기존 응답을 수정합니다.</p>}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            <Button size="lg" variant="secondary" onClick={onBack}>취소</Button>
            <Button size="lg" variant="primary" onClick={() => setAckConflict(true)}>이어받기</Button>
          </div>
        </Modal>
      )}

      <Screen className="max-w-3xl">
      <Card className="p-8">
        <div className="flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-grey-100 text-[22px] font-bold text-grey-700" aria-hidden>
            {(p.full_name || p.name_masked)[0]}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[30px] font-bold leading-tight text-grey-900" data-testid="verify-name">{p.full_name || p.name_masked}</span>
              {p.full_name && <span className="text-[17px] text-grey-400">{p.name_masked}</span>}
              {p.cohort !== '3' && <Badge tone="red">{COHORT_LABEL[p.cohort]}</Badge>}
            </div>
            <p className="mt-1 text-[17px] text-grey-600">
              {p.birth_year ? `${p.birth_year}년생` : '생년 미상'} · {p.age_group === '?' ? '' : `${p.age_group}대 `}{p.sex === 'F' ? '여성' : p.sex === 'M' ? '남성' : '성별 미상'}
            </p>
            <p className="mt-3 inline-flex items-center gap-2 text-[15px] text-grey-600" data-testid="target-desc">
              <Badge tone={TRACK_TONE[p.track]}>{TRACK_LABEL[p.track]}</Badge> {TRACK_DESC[p.track]}
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl bg-grey-50 px-6 py-8 text-center">
          {cameByPhone ? (
            <>
              <p className="inline-flex items-center gap-2 rounded-full bg-green-50 px-4 py-1.5 text-[15px] font-semibold text-green-600" data-testid="verify-status">
                ✓ 전화번호 뒷자리 {p.phone_last4} 일치
              </p>
              <p className="mt-4 text-[26px] font-bold leading-snug text-grey-900">“{p.full_name || `${p.name_masked[0]}○○`} 님 맞으세요? {p.birth_year ? `${p.birth_year}년생이시고요?` : ''}”</p>
              <p className="mt-2 text-[15px] text-grey-500">성함과 생년이 맞으면 확인 완료를 누르세요.</p>
            </>
          ) : (
            <>
              <p className="text-[26px] font-bold leading-snug text-grey-900">“전화번호 뒷 네 자리가 어떻게 되세요?”</p>
              <p className="mt-2 text-[15px] text-grey-500">어르신이 말씀하신 번호를 입력하면 명단과 자동으로 맞춰 봅니다.</p>
              <input ref={inputRef} aria-label="어르신이 말한 뒷 4자리" value={typed} inputMode="numeric" maxLength={4} autoComplete="off" placeholder="····"
                onChange={(e) => setTyped(e.target.value.replace(/\D/g, '').slice(0, 4))}
                onKeyDown={(e) => { if (e.key === 'Enter' && matched) void proceed('ok') }}
                className={`tabular mx-auto mt-6 block w-64 rounded-2xl bg-white px-4 py-4 text-center text-[48px] font-bold tracking-[0.35em] text-grey-900 transition-shadow focus:outline-none ${
                  matched ? 'ring-2 ring-green-500' : mismatched ? 'ring-2 ring-red-500' : 'ring-1 ring-grey-200 focus:ring-2 focus:ring-blue-500'}`} />
              <p className="mt-4 min-h-7 text-[17px] font-semibold" data-testid="verify-status" role="status">
                {matched && <span className="text-green-600">✓ 명단과 일치합니다</span>}
                {mismatched && <span className="text-red-500">✗ 명단의 번호와 다릅니다. 다시 여쭤 보세요</span>}
              </p>
            </>
          )}
        </div>
      </Card>

      <div className="mt-5 flex flex-col gap-3">
        <Button ref={okRef} size="xl" variant="primary" className="w-full" disabled={busy || !(cameByPhone || matched)} onClick={() => void proceed('ok')}>
          본인 확인 완료
        </Button>
        <div className="grid grid-cols-2 gap-3">
          <Button size="lg" variant="white" onClick={onBack}>다른 분입니다</Button>
          <Button size="lg" variant="white" disabled={busy} onClick={() => void proceed(mismatched ? 'failed' : 'skipped')}>확인 못 했지만 진행</Button>
        </div>
      </div>
      </Screen>
    </>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDB, useEngine, useResponseIndex } from '../app/context'
import { Badge, Button, Modal, Screen, TRACK_TONE } from '../components/ui'
import { nowIso } from '../lib/engine'
import type { Participant, Track, Verified } from '../lib/types'

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
  const index = useResponseIndex()
  const existing = index.get(p.id)
  const [realName, setRealName] = useState('')
  const [track, setTrack] = useState<Track>(existing?.track ?? p.track)
  const [ackConflict, setAckConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const okRef = useRef<HTMLButtonElement>(null)

  // 열람 기록 + 다른 기기에 "이 분을 열었음" 알림
  useEffect(() => {
    void engine.logAccess('view', p.id)
    engine.openParticipant(p.id)
    // 서버에 더 최신 응답이 있는지 확인 (오프라인이면 조용히 실패)
    engine.remote.fetchResponseByParticipant(p.id).then((r) => { if (r) void engine.mergeRemote(r) }).catch(() => {})
    okRef.current?.focus()
    return () => engine.openParticipant(null)
  }, [engine, p.id])

  const others = engine.othersOpening(p.id)
  const takenBy = existing && existing.status === 'in_progress' && existing.device_id !== engine.device ? existing.entered_by : null
  const alreadyDone = existing && existing.status !== 'in_progress'
  const conflict = !ackConflict && (others.length > 0 || takenBy || alreadyDone)

  async function proceed(verified: Verified) {
    if (busy) return
    setBusy(true)
    const patch = {
      verified, verified_by: engine.me, verified_at: nowIso(), track,
      ...(realName.trim() ? { real_name: realName.trim() } : {}),
    }
    let id: string
    // 목록 인덱스가 늦게 읽혀도 중복 응답을 만들지 않도록 DB에서 다시 확인
    const existing = await engine.findResponseFor(p.id)
    if (existing) {
      await engine.takeOver(existing.id, {
        ...patch,
        ...(realName.trim() ? { answers: { ...existing.answers, real_name: realName.trim() } } : {}),
      })
      id = existing.id
    } else {
      const r = await engine.createResponse({ participant: p, track, verified, realName })
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

      <div className="rounded-2xl border-2 border-slate-300 bg-white p-8 text-center">
        <p className="text-3xl font-extrabold leading-snug">“전화번호 뒷 네 자리가 어떻게 되세요?”</p>
        <p className="mt-6 font-mono text-8xl font-black tracking-[0.2em]" data-testid="verify-phone">{p.phone_last4 ?? '----'}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-2xl">
          <span>생년 <b>{p.birth_year ?? '?'}</b></span>
          <span>{p.age_group === '?' ? '연령 ?' : `${p.age_group}대`} · {p.sex === 'F' ? '여성' : p.sex === 'M' ? '남성' : '성별 ?'}</span>
          <span className="font-bold">{p.name_masked}</span>
          <Badge>{p.cohort === '26' ? '26년' : p.cohort === '2' ? '2기' : '기수 미상'}</Badge>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2" role="group" aria-label="트랙">
          <span className="text-lg text-slate-600">트랙</span>
          {(['A', 'B', 'C'] as const).map((t) => (
            <button key={t} type="button" aria-pressed={track === t} onClick={() => setTrack(t)}
              className={`min-h-11 min-w-14 rounded-lg border-2 text-xl font-bold ${track === t ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white'}`}>
              {t}
            </button>
          ))}
          {track !== p.track && <Badge tone={TRACK_TONE[p.track]}>명단 기준 {p.track}</Badge>}
        </div>

        <label className="mx-auto mt-6 block max-w-md text-left">
          <span className="text-base text-slate-600">전체 성함 (선택)</span>
          <input value={realName} onChange={(e) => setRealName(e.target.value)} aria-label="전체 성함"
            className="mt-1 min-h-12 w-full rounded-lg border-2 border-slate-400 px-3 text-xl" autoComplete="off" />
        </label>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Button ref={okRef} size="xl" variant="success" disabled={busy} onClick={() => void proceed('ok')}>본인 확인 완료</Button>
        <Button size="xl" onClick={onBack}>다른 분입니다</Button>
        <Button size="xl" variant="secondary" disabled={busy} onClick={() => void proceed('skipped')}>확인 못 했지만 진행</Button>
      </div>
    </Screen>
  )
}

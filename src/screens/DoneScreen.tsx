import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { useDB, useEngine } from '../app/context'
import { NetworkStatus } from '../components/TopBar'
import { Button, Screen } from '../components/ui'

export function DoneScreen() {
  const { rid = '' } = useParams()
  const navigate = useNavigate()
  const db = useDB()
  const engine = useEngine()
  const r = useLiveQuery(() => db.responses.get(engine.resolveId(rid)), [db, engine, rid])
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => { btn.current?.focus() }, [])

  const next = () => {
    try { sessionStorage.removeItem('namdongu.lastSearch') } catch { /* 무시 */ }
    navigate('/')
  }
  const label = { done: '응대 완료', refused: '응대 거부로 종료', revisit: '재방문 예정으로 종료', in_progress: '진행중' }

  return (
    <Screen className="text-center">
      <div className="mt-10 rounded-2xl border-2 border-emerald-600 bg-white p-10">
        <p className="text-5xl">✓</p>
        <h1 className="mt-4 text-4xl font-extrabold" data-testid="done-title">{r ? label[r.status] : '저장됨'}</h1>
        <p className="mt-4 text-xl text-slate-700">이 기기에 먼저 저장되었고, 온라인이면 자동으로 서버에 올라갑니다.</p>
        <div className="mt-4 flex justify-center"><NetworkStatus testId="net-status-done" /></div>
        <Button ref={btn} size="xl" variant="primary" className="mt-8 w-full max-w-xl" onClick={next}>다음 분 찾기</Button>
        <Button className="mt-4" onClick={() => navigate(`/r/${rid}`)}>방금 응답 다시 보기</Button>
      </div>
    </Screen>
  )
}

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
    <Screen className="max-w-xl text-center">
      <div className="mt-16 flex flex-col items-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-blue-50" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-10 w-10 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h1 className="mt-6 text-[28px] font-bold text-grey-900" data-testid="done-title">{r ? label[r.status] : '저장됨'}</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-grey-500">이 기기에 먼저 저장되었고,<br />온라인이면 자동으로 서버에 올라갑니다.</p>
        <div className="mt-4"><NetworkStatus testId="net-status-done" /></div>
        <Button ref={btn} size="xl" variant="primary" className="mt-10 w-full" onClick={next}>다음 분 찾기</Button>
        <Button variant="ghost" className="mt-3" onClick={() => navigate(`/r/${rid}`)}>방금 응답 다시 보기</Button>
      </div>
    </Screen>
  )
}

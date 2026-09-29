import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { Button, Screen } from './components/ui'
import { Engine } from './lib/engine'
import { SupabaseRemote, supabaseConfigured } from './lib/supabaseRemote'

// 로그인 없음: 페이지를 열면 담당자가 자기 이름을 골라 바로 쓴다 (2026-09-29 운영 결정)
function Live() {
  const engine = useMemo(() => new Engine(new SupabaseRemote()), [])
  return <App engine={engine} />
}

function Demo() {
  const [engine, setEngine] = useState<Engine | null>(null)
  if (engine) return <App engine={engine} />
  return (
    <Screen>
      <h1 className="text-[26px] font-bold text-grey-900">Supabase 설정이 없습니다</h1>
      <p className="mt-2 text-grey-700">VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 를 .env.local 에 넣으세요.</p>
      <Button className="mt-6" variant="primary" size="lg" onClick={async () => {
        const { FakeServer, FakeRemote, makeFakeParticipants, makeFakeStaff } = await import('./lib/fakeRemote')
        const server = new FakeServer()
        server.participants = makeFakeParticipants(1523)
        server.staff = makeFakeStaff()
        setEngine(new Engine(new FakeRemote(server)))
      }}>가짜 데이터로 데모 실행 (개발용)</Button>
    </Screen>
  )
}

function Misconfigured() {
  return <Screen><p className="text-[19px] text-grey-700">서비스 설정 오류: 관리자에게 문의하세요.</p></Screen>
}

// 와이파이가 끊긴 상태에서 새로고침해도 앱이 뜨도록 (배포 빌드에서만)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigured ? <Live /> : import.meta.env.DEV ? <Demo /> : <Misconfigured />}
  </StrictMode>,
)

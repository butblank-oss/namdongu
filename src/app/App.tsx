import { useEffect, useState } from 'react'
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { EngineContext, SignOutContext, useEngine } from './context'
import { TopBar } from '../components/TopBar'
import { Button, Screen } from '../components/ui'
import type { Engine } from '../lib/engine'
import { AdminScreen } from '../screens/AdminScreen'
import { DoneScreen } from '../screens/DoneScreen'
import { ManualAddScreen } from '../screens/ManualAddScreen'
import { PrintCardsScreen } from '../screens/PrintCardsScreen'
import { SearchScreen } from '../screens/SearchScreen'
import { GuardedSurvey } from '../screens/SurveyScreen'
import { VerifyScreen } from '../screens/VerifyScreen'

function StaffPicker() {
  const engine = useEngine()
  const active = engine.staff.filter((s) => s.active)
  return (
    <Screen>
      <h1 className="text-3xl font-extrabold">본인 이름을 골라 주세요</h1>
      <p className="mt-2 text-lg text-slate-600">이 노트북에 저장되며, 상단에서 언제든 바꿀 수 있습니다.</p>
      {active.length === 0 && <p className="mt-6 text-lg">담당자 명단을 불러오는 중… (오프라인이면 온라인 연결 후 다시 시도하세요)</p>}
      <div className="mt-6 grid grid-cols-4 gap-3">
        {active.map((s) => (
          <Button key={s.id} size="lg" onClick={() => engine.setMe(s.name)}>{s.name}</Button>
        ))}
      </div>
    </Screen>
  )
}

function Shell() {
  const engine = useEngine()
  if (!engine.me) return <StaffPicker />
  return (
    <>
      <TopBar />
      <Routes>
        <Route path="/" element={<SearchScreen />} />
        <Route path="/p/:pid" element={<VerifyScreen />} />
        <Route path="/r/:rid" element={<GuardedSurvey />} />
        <Route path="/r/:rid/done" element={<DoneScreen />} />
        <Route path="/manual" element={<ManualAddScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="/print" element={<PrintCardsScreen />} />
        <Route path="*" element={<SearchScreen />} />
      </Routes>
    </>
  )
}

export function App({ engine, memory, initialPath, start = true, onSignOut }: {
  engine: Engine; memory?: boolean; initialPath?: string; start?: boolean; onSignOut?: () => Promise<void>
}) {
  const [ready, setReady] = useState(!start)
  useEffect(() => {
    if (!start) return
    let alive = true
    void engine.start().then(() => { if (alive) setReady(true) })
    return () => { alive = false; engine.stop() }
  }, [engine, start])

  const body = ready ? <Shell /> : <Screen><p className="text-xl">불러오는 중…</p></Screen>
  return (
    <EngineContext.Provider value={engine}>
      <SignOutContext.Provider value={onSignOut ?? null}>
        {memory
          ? <MemoryRouter initialEntries={[initialPath ?? '/']}>{body}</MemoryRouter>
          : <HashRouter>{body}</HashRouter>}
      </SignOutContext.Provider>
    </EngineContext.Provider>
  )
}

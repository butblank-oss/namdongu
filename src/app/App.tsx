import { useEffect, useState } from 'react'
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { EngineContext, useEngine } from './context'
import { TopBar } from '../components/TopBar'
import { PageTitle, Screen } from '../components/ui'
import type { Engine } from '../lib/engine'
import { AdminScreen } from '../screens/AdminScreen'
import { ApplicantsScreen } from '../screens/ApplicantsScreen'
import { DashboardScreen } from '../screens/DashboardScreen'
import { ResponseListScreen } from '../screens/ResponseListScreen'
import { DoneScreen } from '../screens/DoneScreen'
import { ManualAddScreen } from '../screens/ManualAddScreen'
import { PrintCardsScreen } from '../screens/PrintCardsScreen'
import { PrintSurveyScreen } from '../screens/PrintSurveyScreen'
import { SearchScreen } from '../screens/SearchScreen'
import { GuardedSurvey } from '../screens/SurveyScreen'
import { VerifyScreen } from '../screens/VerifyScreen'

function StaffPicker() {
  const engine = useEngine()
  const active = engine.staff.filter((s) => s.active)
  return (
    <Screen>
      <PageTitle sub="이 노트북에 저장되며, 상단에서 언제든 바꿀 수 있습니다.">본인 이름을 골라 주세요</PageTitle>
      {active.length === 0 && <p className="mt-6 text-[17px] text-grey-500">담당자 명단을 불러오는 중… (오프라인이면 온라인 연결 후 다시 시도하세요)</p>}
      <div className="mt-6 grid grid-cols-4 gap-4">
        {active.map((s) => (
          <button key={s.id} type="button" onClick={() => engine.setMe(s.name)}
            className="min-h-16 rounded-2xl bg-white text-lg font-semibold text-grey-900 shadow-card transition-colors hover:bg-blue-50 hover:text-blue-600">{s.name}</button>
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
        <Route path="/print-survey" element={<PrintSurveyScreen />} />
        <Route path="/list" element={<ResponseListScreen />} />
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/applicants" element={<ApplicantsScreen />} />
        <Route path="*" element={<SearchScreen />} />
      </Routes>
    </>
  )
}

export function App({ engine, memory, initialPath, start = true }: {
  engine: Engine; memory?: boolean; initialPath?: string; start?: boolean
}) {
  const [ready, setReady] = useState(!start)
  useEffect(() => {
    if (!start) return
    let alive = true
    void engine.start().then(() => { if (alive) setReady(true) })
    return () => { alive = false; engine.stop() }
  }, [engine, start])

  const body = ready ? <Shell /> : <Screen><p className="text-[19px] text-grey-500">불러오는 중…</p></Screen>
  return (
    <EngineContext.Provider value={engine}>
      {memory
        ? <MemoryRouter initialEntries={[initialPath ?? '/']}>{body}</MemoryRouter>
        : <HashRouter>{body}</HashRouter>}
    </EngineContext.Provider>
  )
}

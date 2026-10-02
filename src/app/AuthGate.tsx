import { useEffect, useRef, useState } from 'react'
import { App } from './App'
import { Screen } from '../components/ui'
import { AuthError, type AuthApi, type AuthState } from '../lib/auth'
import type { Engine } from '../lib/engine'
import { ChangePasswordScreen, LoginScreen, NotStaffScreen } from '../screens/LoginScreen'

/*
 * 앱 맨 앞의 로그인 관문.
 * 로그인 → (첫 로그인이면) 새 비밀번호 → 앱. 입력자는 로그인한 담당자로 고정된다.
 * 엔진(동기화)은 로그인을 마친 뒤에만 만든다: 로그인 전에는 DB 가 아무것도 돌려주지 않는다.
 */
export function AuthGate({ auth, makeEngine }: { auth: AuthApi; makeEngine: () => Engine }) {
  const [state, setState] = useState<AuthState | 'loading'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const engineRef = useRef<{ key: string; engine: Engine } | null>(null)

  useEffect(() => {
    let alive = true
    auth.current()
      .then((s) => { if (alive) setState(s) })
      .catch((e) => { if (alive) { setLoadError(e instanceof AuthError ? e.message : String(e)); setState({ kind: 'signedOut' }) } })
    const off = auth.onSignedOut(() => { engineRef.current = null; setState({ kind: 'signedOut' }) })
    return () => { alive = false; off() }
  }, [auth])

  const signOut = async () => {
    engineRef.current = null
    await auth.signOut().catch(() => {})
    setState({ kind: 'signedOut' })
  }
  const attempt = async (fn: () => Promise<AuthState>): Promise<string | null> => {
    try { setLoadError(null); setState(await fn()); return null } catch (e) { return e instanceof AuthError ? e.message : '다시 시도해 주세요.' }
  }

  if (state === 'loading') return <Screen><p className="text-[17px] text-grey-500">불러오는 중…</p></Screen>
  if (state.kind === 'signedOut') {
    return (
      <>
        {loadError && <p role="alert" className="bg-red-50 px-6 py-3 text-center text-[15px] font-semibold text-red-600">{loadError}</p>}
        <LoginScreen onSubmit={(email, pw) => attempt(() => auth.signIn(email, pw))} />
      </>
    )
  }
  if (state.kind === 'notStaff') return <NotStaffScreen email={state.email} onSignOut={() => void signOut()} />
  if (state.staff.must_change_password) {
    return <ChangePasswordScreen name={state.staff.name} onSignOut={() => void signOut()}
      onSubmit={(pw) => attempt(() => auth.changePassword(pw))} />
  }

  // 로그인 완료: 담당자마다 엔진 하나
  const key = state.staff.id
  if (engineRef.current?.key !== key) {
    const engine = makeEngine()
    engine.lockIdentity(state.staff.name, () => void signOut())
    engineRef.current = { key, engine }
  }
  return <App key={key} engine={engineRef.current.engine} />
}

import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Button, Screen } from '../components/ui'
import { clearLocalData } from '../lib/db'
import { getSupabase } from '../lib/supabaseRemote'

export function AuthGate({ children }: { children: (session: Session, signOut: () => Promise<void>) => ReactNode }) {
  const sb = getSupabase()
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    void sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [sb])

  async function signOut() {
    const r = await clearLocalData()
    if (!r.cleared && !window.confirm(`서버에 아직 올라가지 않은 응답이 ${r.pending}건 있습니다. 이 기기에 남겨 두고 로그아웃할까요?`)) return
    await sb.auth.signOut()
  }

  if (session === undefined) return <Screen><p className="text-xl">확인 중…</p></Screen>
  if (!session) return <LoginScreen />
  return <>{children(session, signOut)}</>
}

function LoginScreen() {
  const sb = getSupabase()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const { error } = password
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href.split('#')[0], shouldCreateUser: false } })
    setBusy(false)
    if (error) setMsg(`로그인 실패: ${error.message}`)
    else if (!password) setMsg('메일로 로그인 링크를 보냈습니다. 이 노트북에서 여세요.')
  }

  return (
    <Screen className="max-w-md">
      <form onSubmit={(e) => void login(e)} className="mt-20 space-y-4 rounded-2xl border-2 border-slate-300 bg-white p-8">
        <h1 className="text-2xl font-extrabold">맬리브레인 현장 설문</h1>
        <p className="text-slate-600">원메딕스 임직원 전용. 로그인 전에는 어떤 데이터도 보이지 않습니다.</p>
        <label className="block text-lg font-bold">이메일
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username"
            className="mt-1 min-h-12 w-full rounded-lg border-2 border-slate-400 px-3" />
        </label>
        <label className="block text-lg font-bold">비밀번호 <span className="text-sm font-normal text-slate-500">(비우면 매직링크 발송)</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
            className="mt-1 min-h-12 w-full rounded-lg border-2 border-slate-400 px-3" />
        </label>
        {msg && <p role="alert" className="font-semibold">{msg}</p>}
        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>{password ? '로그인' : '로그인 링크 받기'}</Button>
      </form>
    </Screen>
  )
}

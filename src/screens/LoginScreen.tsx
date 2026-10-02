import { useState, type FormEvent } from 'react'
import { Button, Card, inputCls } from '../components/ui'
import { PASSWORD_RULES, passwordOk } from '../lib/auth'

function Frame({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-6 flex items-center gap-2 text-[17px] font-bold text-grey-900">
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-blue-500 text-[13px] font-extrabold text-white">M</span>
        맬리브레인 현장
      </div>
      <h1 className="text-[26px] font-bold leading-tight text-grey-900">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-grey-600">{sub}</p>
      <Card className="mt-6 p-6">{children}</Card>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] font-semibold text-grey-700">{label}</span>
      {children}
    </label>
  )
}

export function LoginScreen({ onSubmit }: { onSubmit: (email: string, password: string) => Promise<string | null> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || !email.trim() || !password) return
    setBusy(true)
    setError(await onSubmit(email, password))
    setBusy(false)
  }

  return (
    <Frame title="로그인" sub="담당자 계정으로 로그인해 주세요. 아이디는 회사 이메일입니다.">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Field label="회사 이메일">
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com" className={inputCls} autoFocus />
        </Field>
        <Field label="비밀번호">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <p className="rounded-xl bg-grey-50 px-4 py-3 text-[14px] leading-relaxed text-grey-600">
          처음 로그인하시면 비밀번호에 <b className="text-grey-800">본인 휴대폰 번호 11자리</b>를 숫자만 입력하세요. 로그인하면 바로 새 비밀번호를 정합니다.
        </p>
        {error && <p role="alert" className="text-[15px] font-semibold text-red-500">{error}</p>}
        <Button type="submit" size="lg" variant="primary" className="w-full" disabled={busy || !email.trim() || !password}>
          {busy ? '확인 중…' : '로그인'}
        </Button>
        <p className="text-center text-[13px] text-grey-500">비밀번호를 잊으셨으면 관리자에게 초기화를 요청하세요.</p>
      </form>
    </Frame>
  )
}

export function ChangePasswordScreen({ name, onSubmit, onSignOut }: {
  name: string
  onSubmit: (password: string) => Promise<string | null>
  onSignOut: () => void
}) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const same = pw.length > 0 && pw === pw2
  const ready = passwordOk(pw) && same

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy || !ready) return
    setBusy(true)
    setError(await onSubmit(pw))
    setBusy(false)
  }

  return (
    <Frame title={`${name}님, 새 비밀번호를 정해 주세요`} sub="처음 비밀번호(휴대폰 번호)로는 계속 쓸 수 없습니다. 다음부터는 새 비밀번호로 로그인합니다.">
      <form onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Field label="새 비밀번호">
          <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} autoFocus />
        </Field>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[14px]" aria-label="비밀번호 조건">
          {PASSWORD_RULES.map((r) => {
            const ok = r.ok(pw)
            return (
              <li key={r.label} data-ok={ok} className={`flex items-center gap-1.5 font-semibold ${ok ? 'text-green-600' : 'text-grey-400'}`}>
                <span aria-hidden>{ok ? '✓' : '·'}</span>{r.label}
              </li>
            )
          })}
        </ul>
        <Field label="새 비밀번호 확인">
          <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
        </Field>
        {pw2.length > 0 && !same && <p className="text-[14px] font-semibold text-red-500">두 비밀번호가 다릅니다.</p>}
        {error && <p role="alert" className="text-[15px] font-semibold text-red-500">{error}</p>}
        <Button type="submit" size="lg" variant="primary" className="w-full" disabled={busy || !ready}>
          {busy ? '저장 중…' : '비밀번호 바꾸고 시작하기'}
        </Button>
        <button type="button" onClick={onSignOut} className="block w-full text-center text-[14px] font-semibold text-grey-500 hover:text-grey-700">로그아웃</button>
      </form>
    </Frame>
  )
}

export function NotStaffScreen({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <Frame title="담당자로 등록되지 않은 계정입니다" sub={`${email} 계정은 이 행사의 담당자 명단에 없습니다. 관리자에게 등록을 요청하세요.`}>
      <Button size="lg" variant="secondary" className="w-full" onClick={onSignOut}>다른 계정으로 로그인</Button>
    </Frame>
  )
}

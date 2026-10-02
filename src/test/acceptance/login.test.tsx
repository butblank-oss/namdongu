import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthGate } from '../../app/AuthGate'
import { AuthError, passwordOk, type AuthApi, type AuthState } from '../../lib/auth'
import { makeDevice, makeServer } from '../helpers'

/** Supabase Auth 대신 쓰는 가짜: 김다희 계정, 첫 비밀번호 = 휴대폰 번호 */
function fakeAuth(opts: { mustChange?: boolean; staff?: boolean } = {}) {
  let password = '01012345678'
  let mustChange = opts.mustChange ?? true
  let signedIn = false
  const staff = () => ({ id: 's-dahee', name: '김다희', role: 'operator' as const, active: true, must_change_password: mustChange })
  const state = (): AuthState => !signedIn ? { kind: 'signedOut' }
    : opts.staff === false ? { kind: 'notStaff', email: 'dahee@company.com' }
    : { kind: 'signedIn', email: 'dahee@company.com', staff: staff() }
  const calls: string[] = []
  const api: AuthApi = {
    async current() { return state() },
    async signIn(email, pw) {
      calls.push(`signIn:${email}`)
      if (email !== 'dahee@company.com' || pw !== password) throw new AuthError('이메일 또는 비밀번호가 맞지 않습니다.')
      signedIn = true
      return state()
    },
    async changePassword(pw) {
      if (!passwordOk(pw)) throw new AuthError('비밀번호 조건을 확인해 주세요.')
      password = pw; mustChange = false
      return state()
    },
    async signOut() { signedIn = false; calls.push('signOut') },
    onSignedOut() { return () => {} },
  }
  return { api, calls, get password() { return password } }
}

function setup(auth: AuthApi) {
  const server = makeServer()
  render(<AuthGate auth={auth} makeEngine={() => {
    const { engine } = makeDevice(server, { name: '김다희', role: 'operator' })
    engine.me = null
    return engine
  }} />)
}

test('첫 로그인: 휴대폰 번호로 들어가면 바로 새 비밀번호를 정하고, 입력자는 로그인 계정으로 고정된다', async () => {
  const auth = fakeAuth()
  setup(auth.api)
  const user = userEvent.setup()

  await user.type(await screen.findByLabelText('회사 이메일'), 'dahee@company.com')
  await user.type(screen.getByLabelText('비밀번호'), '01099999999')
  await user.click(screen.getByRole('button', { name: '로그인' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('이메일 또는 비밀번호가 맞지 않습니다.')

  await user.clear(screen.getByLabelText('비밀번호'))
  await user.type(screen.getByLabelText('비밀번호'), '01012345678')
  await user.click(screen.getByRole('button', { name: '로그인' }))

  expect(await screen.findByText('김다희님, 새 비밀번호를 정해 주세요')).toBeInTheDocument()
  const submit = screen.getByRole('button', { name: '비밀번호 바꾸고 시작하기' })
  await user.type(screen.getByLabelText('새 비밀번호'), 'abcd1234')   // 특수문자 없음
  await user.type(screen.getByLabelText('새 비밀번호 확인'), 'abcd1234')
  expect(submit).toBeDisabled()
  await user.clear(screen.getByLabelText('새 비밀번호')); await user.clear(screen.getByLabelText('새 비밀번호 확인'))
  await user.type(screen.getByLabelText('새 비밀번호'), 'Brain#2026')
  await user.type(screen.getByLabelText('새 비밀번호 확인'), 'Brain#2027')
  expect(screen.getByText('두 비밀번호가 다릅니다.')).toBeInTheDocument()
  expect(submit).toBeDisabled()
  await user.clear(screen.getByLabelText('새 비밀번호 확인'))
  await user.type(screen.getByLabelText('새 비밀번호 확인'), 'Brain#2026')
  await user.click(submit)

  expect(await screen.findByLabelText('검색', {}, { timeout: 5000 })).toBeInTheDocument()
  expect(screen.getByTestId('signed-in-as')).toHaveTextContent('김다희')
  expect(screen.queryByLabelText('입력자')).not.toBeInTheDocument() // 입력자를 고를 수 없다
  expect(auth.password).toBe('Brain#2026')
})

test('비밀번호를 이미 바꾼 계정은 바로 앱으로, 로그아웃하면 로그인 화면', async () => {
  const auth = fakeAuth({ mustChange: false })
  setup(auth.api)
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('회사 이메일'), 'dahee@company.com')
  await user.type(screen.getByLabelText('비밀번호'), '01012345678')
  await user.click(screen.getByRole('button', { name: '로그인' }))
  expect(await screen.findByLabelText('검색', {}, { timeout: 5000 })).toBeInTheDocument()

  await user.click(screen.getByText('더보기'))
  await user.click(screen.getByRole('button', { name: '로그아웃' }))
  await waitFor(() => expect(screen.getByLabelText('회사 이메일')).toBeInTheDocument())
  expect(auth.calls).toContain('signOut')
})

test('담당자로 연결되지 않은 계정은 앱에 들어갈 수 없다', async () => {
  const auth = fakeAuth({ staff: false })
  setup(auth.api)
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('회사 이메일'), 'dahee@company.com')
  await user.type(screen.getByLabelText('비밀번호'), '01012345678')
  await user.click(screen.getByRole('button', { name: '로그인' }))
  expect(await screen.findByText('담당자로 등록되지 않은 계정입니다')).toBeInTheDocument()
  expect(screen.queryByLabelText('검색')).not.toBeInTheDocument()
})

test('비밀번호 규칙: 8자 이상 + 영문 + 숫자 + 특수문자', () => {
  expect(passwordOk('Brain#2026')).toBe(true)
  expect(passwordOk('a1!b2@c3')).toBe(true)
  expect(passwordOk('01012345678')).toBe(false)
  expect(passwordOk('abcdefgh!')).toBe(false)
  expect(passwordOk('Ab1!')).toBe(false)
  expect(passwordOk('Brain 2026!')).toBe(false)
  expect(passwordOk('비밀번호1234!a')).toBe(false)
})

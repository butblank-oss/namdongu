import { getSupabase } from './supabaseRemote'
import type { Staff } from './types'

/*
 * 담당자 로그인 (Supabase Auth). 2026-10-02 개발팀 검토로 로그인 필수.
 * - 아이디 = 회사 이메일, 첫 비밀번호 = 본인 휴대폰 번호(숫자만, scripts/create-staff-accounts.mts 가 만든다)
 * - 첫 로그인 직후 새 비밀번호를 정해야 앱을 쓸 수 있다 (staff.must_change_password, DB 가 해시로 확인)
 */

export interface MyStaff extends Pick<Staff, 'id' | 'name' | 'role' | 'active'> {
  must_change_password: boolean
}

export type AuthState =
  | { kind: 'signedOut' }
  | { kind: 'notStaff'; email: string }
  | { kind: 'signedIn'; email: string; staff: MyStaff }

export interface AuthApi {
  current(): Promise<AuthState>
  signIn(email: string, password: string): Promise<AuthState>
  /** 새 비밀번호로 바꾼다. 반환: 바뀐 뒤의 상태 */
  changePassword(password: string): Promise<AuthState>
  signOut(): Promise<void>
  /** 다른 탭에서 로그아웃하는 등 세션이 바뀌면 알려 준다 */
  onSignedOut(cb: () => void): () => void
}

export const PASSWORD_RULES: { label: string; ok: (pw: string) => boolean }[] = [
  { label: '8자 이상', ok: (pw) => pw.length >= 8 },
  { label: '영문 포함', ok: (pw) => /[A-Za-z]/.test(pw) },
  { label: '숫자 포함', ok: (pw) => /\d/.test(pw) },
  { label: '특수문자 포함', ok: (pw) => /[!-/:-@[-`{-~]/.test(pw) },
  { label: '영문·숫자·특수문자만', ok: (pw) => pw.length > 0 && /^[!-~]+$/.test(pw) },
]

export function passwordOk(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.ok(pw))
}

export class AuthError extends Error {}

/** Supabase 오류 문구를 직원이 읽을 말로 */
export function authMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e)
  if (/invalid login credentials/i.test(m)) return '이메일 또는 비밀번호가 맞지 않습니다.'
  if (/email not confirmed/i.test(m)) return '아직 사용할 수 없는 계정입니다. 관리자에게 문의하세요.'
  if (/should be different/i.test(m)) return '처음 비밀번호(휴대폰 번호)와 다른 비밀번호로 정해 주세요.'
  if (/weak|password should/i.test(m)) return '비밀번호 조건을 확인해 주세요.'
  if (/fetch|network|failed/i.test(m)) return '인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
  if (/rate limit|too many/i.test(m)) return '잠시 뒤 다시 시도해 주세요.'
  return '로그인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'
}

const CACHE_KEY = 'namdongu.authStaff'

function readCache(userId: string): MyStaff | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { userId: string; staff: MyStaff } | null
    return v && v.userId === userId ? v.staff : null
  } catch { return null }
}
function writeCache(userId: string, staff: MyStaff | null) {
  try {
    if (staff) localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, staff }))
    else localStorage.removeItem(CACHE_KEY)
  } catch { /* 저장 못 해도 로그인은 된다 */ }
}

export function supabaseAuth(): AuthApi {
  const sb = getSupabase()

  async function stateFor(userId: string, email: string): Promise<AuthState> {
    const { data, error } = await sb.from('staff')
      .select('id, name, role, active, must_change_password').eq('auth_user_id', userId).maybeSingle()
    if (error) {
      // 와이파이가 끊긴 채 다시 열었을 때: 이 노트북에서 마지막으로 확인한 담당자 정보로 계속 쓴다
      const cached = readCache(userId)
      if (cached && !cached.must_change_password) return { kind: 'signedIn', email, staff: cached }
      throw new AuthError(authMessage(error))
    }
    const staff = data as MyStaff | null
    if (!staff || !staff.active) { writeCache(userId, null); return { kind: 'notStaff', email } }
    writeCache(userId, staff)
    return { kind: 'signedIn', email, staff }
  }

  return {
    async current() {
      const { data } = await sb.auth.getSession()
      const u = data.session?.user
      return u ? stateFor(u.id, u.email ?? '') : { kind: 'signedOut' }
    },
    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (error || !data.user) throw new AuthError(authMessage(error))
      return stateFor(data.user.id, data.user.email ?? email)
    },
    async changePassword(password) {
      if (!passwordOk(password)) throw new AuthError('비밀번호 조건을 확인해 주세요.')
      const { data, error } = await sb.auth.updateUser({ password })
      if (error || !data.user) throw new AuthError(authMessage(error))
      const r = await sb.rpc('password_changed')
      if (r.error) throw new AuthError(authMessage(r.error))
      return stateFor(data.user.id, data.user.email ?? '')
    },
    async signOut() {
      const { data } = await sb.auth.getSession()
      if (data.session?.user) writeCache(data.session.user.id, null)
      await sb.auth.signOut()
    },
    onSignedOut(cb) {
      const { data } = sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') cb() })
      return () => data.subscription.unsubscribe()
    },
  }
}

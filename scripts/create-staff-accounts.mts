// 담당자 로그인 계정을 만들고 staff 에 연결한다 (Supabase Auth, service role 키로 로컬에서만 실행).
// 사용: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/create-staff-accounts.mts <staff.csv> [--dry-run] [--reset] [--add-missing]
//   staff.csv 열: name,email,phone   (name 은 staff 표의 이름과 같아야 함, phone 은 휴대폰 번호 10~11자리)
//   첫 비밀번호 = 휴대폰 번호(숫자만). 첫 로그인 직후 앱이 새 비밀번호를 정하게 한다.
//   --reset : 이미 있는 계정도 비밀번호를 휴대폰 번호로 되돌리고 다시 바꾸게 한다 (비밀번호를 잊었을 때)
//   --add-missing : staff 표에 없는 이름은 담당자(operator)로 새로 추가한다
//   CSV 는 UTF-8 또는 엑셀 기본 저장(CP949) 모두 읽는다
// ⚠ staff.csv 에는 휴대폰 번호가 있으니 커밋하지 말 것 (*.csv 는 .gitignore). 실행 뒤 secret key 는 대시보드에서 삭제.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseCsv } from './csv.ts'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const reset = args.includes('--reset')
const addMissing = args.includes('--add-missing')
const [csvPath] = args.filter((a) => !a.startsWith('--'))
if (!csvPath) {
  console.error('사용: create-staff-accounts.mts <staff.csv> [--dry-run] [--reset] [--add-missing]')
  process.exit(1)
}

const bytes = readFileSync(csvPath)
let text: string
try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { text = new TextDecoder('euc-kr').decode(bytes) }
const rows = parseCsv(text.replace(/^\uFEFF/, '')).map((r) => ({
  name: (r.name ?? r['이름'] ?? '').trim(),
  email: (r.email ?? r['이메일'] ?? '').trim().toLowerCase(),
  // 엑셀이 01012345678 을 숫자로 바꿔 앞의 0 을 지우는 경우를 되살린다
  phone: (r.phone ?? r['휴대폰'] ?? r['전화번호'] ?? '').replace(/\D/g, '').replace(/^(1\d{8,9})$/, '0$1'),
}))

const problems: string[] = []
for (const [i, r] of rows.entries()) {
  const at = `${i + 2}행(${r.name || '이름 없음'})`
  if (!r.name) problems.push(`${at}: 이름이 비었습니다`)
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) problems.push(`${at}: 이메일 형식이 아닙니다`)
  if (!/^01\d{8,9}$/.test(r.phone)) problems.push(`${at}: 휴대폰 번호는 01로 시작하는 10~11자리여야 합니다`)
}
const dup = (k: 'name' | 'email') => rows.map((r) => r[k]).filter((v, i, a) => v && a.indexOf(v) !== i)
for (const d of dup('name')) problems.push(`이름 중복: ${d}`)
for (const d of dup('email')) problems.push(`이메일 중복: ${d}`)
if (problems.length) { console.error(problems.join('\n')); process.exit(1) }

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const { data: staffRows, error: staffErr } = await sb.from('staff').select('id, name, auth_user_id, active')
if (staffErr) throw staffErr
const staffByName = new Map(staffRows!.map((s) => [s.name as string, s]))
const missing = rows.filter((r) => !staffByName.has(r.name)).map((r) => r.name)
if (missing.length && !addMissing) { console.error(`staff 표에 없는 이름: ${missing.join(', ')} (--add-missing 으로 추가하거나 관리자 화면에서 먼저 추가하세요)`); process.exit(1) }

// 이미 있는 Auth 사용자 (이메일로 찾기)
const existing = new Map<string, string>()
for (let page = 1; ; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
  if (error) throw error
  for (const u of data.users) if (u.email) existing.set(u.email.toLowerCase(), u.id)
  if (data.users.length < 200) break
}

const plan = rows.map((r) => ({ ...r, userId: existing.get(r.email) ?? null }))
console.table(plan.map((p) => ({
  이름: p.name, 이메일: p.email, 담당자: staffByName.has(p.name) ? '있음' : '새로 추가',
  계정: p.userId ? (reset ? '있음 → 비밀번호 초기화' : '있음 → 연결만') : '새로 만듦',
})))
if (dryRun) process.exit(0)

if (missing.length) {
  const { error } = await sb.from('staff').insert(missing.map((name) => ({ name, role: 'operator', active: true })))
  if (error) { console.error(`담당자 추가 실패: ${error.message}`); process.exit(1) }
}

let ok = 0
for (const p of plan) {
  let userId = p.userId
  if (!userId) {
    const { data, error } = await sb.auth.admin.createUser({ email: p.email, password: p.phone, email_confirm: true, user_metadata: { name: p.name } })
    if (error) { console.error(`${p.name}: 계정 생성 실패 - ${error.message}`); continue }
    userId = data.user.id
  } else if (reset) {
    const { error } = await sb.auth.admin.updateUserById(userId, { password: p.phone })
    if (error) { console.error(`${p.name}: 비밀번호 초기화 실패 - ${error.message}`); continue }
  }
  // 연결. 연결이 바뀌거나 must_change_password 가 다시 true 가 되면 DB 트리거가 첫 비밀번호 해시를 기록한다
  const link = await sb.from('staff').update({ auth_user_id: userId, email: p.email }).eq('name', p.name)
  if (link.error) { console.error(`${p.name}: staff 연결 실패 - ${link.error.message}`); continue }
  if (reset) {
    await sb.from('staff').update({ must_change_password: false }).eq('name', p.name)
    const again = await sb.from('staff').update({ must_change_password: true }).eq('name', p.name)
    if (again.error) { console.error(`${p.name}: 초기화 표시 실패 - ${again.error.message}`); continue }
  }
  ok++
}
console.log({ total: plan.length, ok, fail: plan.length - ok })

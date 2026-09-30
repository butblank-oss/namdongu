// 4기 안내용 전체 휴대폰 번호를 participant_contacts 에 채운다. 현장 직원은 번호를 입력하지 않는다.
// 사용: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/import-contacts.mts \
//        <applicants.xlsx> <S3_user_info.csv> <S4_presignup_list.csv> [--dry-run]
// 연결: 신청 id(xlsx.id) = S4.registration_id → S4.user_id = participants.id
// 안전장치: 번호 끝 4자리가 명단의 뒷 4자리와 같을 때만 넣는다. 번호는 앱(anon)에서 읽을 수 없는 표에만 저장된다.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { parseCsv } from './csv.ts'
import { classifyRow, toParticipant } from '../src/lib/importRules.ts'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [xlsxPath, s3Path, s4Path] = args.filter((a) => !a.startsWith('--'))
if (!xlsxPath || !s3Path || !s4Path) {
  console.error('사용: import-contacts.mts <applicants.xlsx> <S3_user_info.csv> <S4_presignup_list.csv> [--dry-run]')
  process.exit(1)
}

// xlsx 는 파이썬 openpyxl 로 id·mobileNumber 두 열만 읽는다
const py = `import openpyxl,json,sys
ws=openpyxl.load_workbook(sys.argv[1],read_only=True).worksheets[0]
rows=list(ws.iter_rows(values_only=True)); h=[str(x) for x in rows[0]]
i,m=h.index('id'),h.index('mobileNumber')
print(json.dumps([{'id':str(r[i]),'mobile':str(r[m] or '')} for r in rows[1:]]))`
const apps = JSON.parse(execFileSync('python3', ['-c', py, xlsxPath]).toString()) as { id: string; mobile: string }[]

/** +821012345678 / 01012345678 / 010-1234-5678 → 010-1234-5678 (휴대폰이 아니면 null) */
export function normalizeMobile(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('82')) d = '0' + d.slice(2)
  if (!/^01\d{8,9}$/.test(d)) return null
  return `${d.slice(0, 3)}-${d.slice(3, d.length - 4)}-${d.slice(-4)}`
}

const roster = (parseCsv(readFileSync(s3Path, 'utf8')) as never[])
  .filter((r) => classifyRow(r) === null).map((r) => toParticipant(r, '0000-00-00'))
const reg2user = new Map(parseCsv(readFileSync(s4Path, 'utf8')).map((r) => [r.registration_id, r.user_id]))
const byId = new Map(roster.map((p) => [p.id, p]))

const rows = new Map<string, { participant_id: string; mobile: string }>()
let linked = 0, badFormat = 0, last4Mismatch = 0
for (const a of apps) {
  const p = byId.get(reg2user.get(a.id) ?? '')
  if (!p) continue
  linked++
  const mobile = normalizeMobile(a.mobile)
  if (!mobile) { badFormat++; continue }
  if (mobile.slice(-4) !== p.phone_last4) { last4Mismatch++; continue }
  rows.set(p.id, { participant_id: p.id, mobile })
}
console.log({ applicants: apps.length, roster: roster.length, linked, badFormat, last4Mismatch, toUpsert: rows.size })
if (dryRun) process.exit(0)

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const list = [...rows.values()].map((r) => ({ ...r, source: 'applicants_xlsx', updated_at: new Date().toISOString() }))
let ok = 0, fail = 0
for (let i = 0; i < list.length; i += 200) {
  const { error } = await sb.from('participant_contacts').upsert(list.slice(i, i + 200), { onConflict: 'participant_id' })
  if (error) { fail += Math.min(200, list.length - i); console.error(error.message) } else ok += Math.min(200, list.length - i)
}
console.log({ ok, fail })

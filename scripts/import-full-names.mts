// 신청폼 신청자 명단(xlsx)의 실명을 participants.full_name 에 채운다.
// 사용: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/import-full-names.mts \
//        <applicants.xlsx> <S3_user_info.csv> <S4_presignup_list.csv> [--dry-run]
// 연결: 신청 id(xlsx.id) = S4.registration_id → S4.user_id = participants.id
// 안전장치: 실명이 마스킹 이름과 모양이 맞을 때만 넣는다(길이 같고 * 자리 빼고 일치). 주소·전체 번호는 저장하지 않는다.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { parseCsv } from './csv.ts'
import { classifyRow, fullNameMatchesMasked, toParticipant } from '../src/lib/importRules.ts'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [xlsxPath, s3Path, s4Path] = args.filter((a) => !a.startsWith('--'))
if (!xlsxPath || !s3Path || !s4Path) {
  console.error('사용: import-full-names.mts <applicants.xlsx> <S3_user_info.csv> <S4_presignup_list.csv> [--dry-run]')
  process.exit(1)
}

// xlsx 는 파이썬 openpyxl 로 id·name 두 열만 읽는다
const py = `import openpyxl,json,sys
ws=openpyxl.load_workbook(sys.argv[1],read_only=True).worksheets[0]
rows=list(ws.iter_rows(values_only=True)); h=[str(x) for x in rows[0]]
i,n=h.index('id'),h.index('name')
print(json.dumps([{'id':str(r[i]),'name':str(r[n] or '')} for r in rows[1:]]))`
const apps = JSON.parse(execFileSync('python3', ['-c', py, xlsxPath]).toString()) as { id: string; name: string }[]

const roster = (parseCsv(readFileSync(s3Path, 'utf8')) as never[])
  .filter((r) => classifyRow(r) === null).map((r) => toParticipant(r, '0000-00-00'))
const reg2user = new Map(parseCsv(readFileSync(s4Path, 'utf8')).map((r) => [r.registration_id, r.user_id]))
const byId = new Map(roster.map((p) => [p.id, p]))
const clean = (n: string) => n.replace(/\(.*?\)/g, '').replace(/\s+/g, '').trim()

const updates: { id: string; full_name: string }[] = []
let linked = 0, shapeMismatch = 0
for (const a of apps) {
  const p = byId.get(reg2user.get(a.id) ?? '')
  if (!p) continue
  linked++
  const name = clean(a.name)
  if (fullNameMatchesMasked(name, p.name_masked)) updates.push({ id: p.id, full_name: name })
  else shapeMismatch++
}
console.log({ applicants: apps.length, roster: roster.length, linked, shapeMismatch, toUpdate: updates.length })
if (dryRun) process.exit(0)

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
let ok = 0, fail = 0
for (let i = 0; i < updates.length; i += 25) {
  const res = await Promise.all(updates.slice(i, i + 25).map((u) =>
    sb.from('participants').update({ full_name: u.full_name }).eq('id', u.id)))
  for (const r of res) { if (r.error) fail++; else ok++ }
}
console.log({ ok, fail })

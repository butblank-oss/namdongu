// 명단의 앱 버전을 participants.app_version / app_os 에 채운다 (설문 화면의 '업데이트 필요' 표시용).
// 사용: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/import-app-versions.mts <app_version.csv> [--dry-run]
//   CSV 열: user_id,app_version,os
// 명단(participants)에 있는 분만 바꾼다. 버전이 비어 있으면 null.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parseCsv } from './csv.ts'
import { compareVersion, LATEST_APP_VERSION } from '../src/lib/defaultSchema.ts'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [csvPath] = args.filter((a) => !a.startsWith('--'))
if (!csvPath) { console.error('사용: import-app-versions.mts <app_version.csv> [--dry-run]'); process.exit(1) }

const rows = parseCsv(readFileSync(csvPath, 'utf8').replace(/^﻿/, '')).map((r) => ({
  id: (r.user_id ?? '').trim(),
  app_version: (r.app_version ?? '').trim() || null,
  app_os: (r.os ?? '').trim() || null,
})).filter((r) => r.id)

const count = (f: (v: string | null) => boolean) => rows.filter((r) => f(r.app_version)).length
console.log({
  rows: rows.length,
  latest: count((v) => compareVersion(v, LATEST_APP_VERSION) === 0),
  outdated: count((v) => (compareVersion(v, LATEST_APP_VERSION) ?? 0) < 0),
  unknown: count((v) => compareVersion(v, LATEST_APP_VERSION) == null),
})
if (dryRun) process.exit(0)

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const ids = new Set<string>()
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('participants').select('id').order('id').range(from, from + 999)
  if (error) throw error
  for (const r of data ?? []) ids.add(r.id as string)
  if (!data || data.length < 1000) break
}
let ok = 0, skipped = 0, fail = 0
const targets = rows.filter((r) => ids.has(r.id))
skipped = rows.length - targets.length
// 같은 값끼리 묶어 한 번에 바꾼다 (버전·기기 조합이 몇십 개뿐)
const groups = new Map<string, string[]>()
for (const r of targets) {
  const k = JSON.stringify([r.app_version, r.app_os])
  groups.set(k, [...(groups.get(k) ?? []), r.id])
}
for (const [k, list] of groups) {
  const [app_version, app_os] = JSON.parse(k) as [string | null, string | null]
  for (let i = 0; i < list.length; i += 200) {
    const part = list.slice(i, i + 200)
    const { error } = await sb.from('participants').update({ app_version, app_os }).in('id', part)
    if (error) { fail += part.length; console.error(error.message) } else ok += part.length
  }
}
console.log({ ok, fail, notInRoster: skipped })

// Usage: npx tsx scripts/import-participants.ts <csv path> --snapshot 2026-09-14 [--dry-run]
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (also read from a local .env if present).
//
// NOTE: this script never touches the `responses` table. Completed responses keep the
// track they were answered under; only participants.track is updated here.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parseCsv } from './csv.ts'
import {
  EXPECTED_20260914,
  TARGET_PROVIDER,
  transformRows,
  type ImportSummary,
  type ParticipantRow,
  type SourceRow,
} from '../src/lib/importRules.ts'

export interface ImportClient {
  selectIds(): Promise<string[]>
  upsert(rows: Record<string, unknown>[]): Promise<void>
  deactivate(ids: string[]): Promise<void>
}

export interface RunSummary extends ImportSummary {
  totalSource: number
  providerRows: number
  nullPhone: number
  deactivated: string[]
  warnings: string[]
  dryRun: boolean
}

const BATCH = 500

export function toDbRow(p: ParticipantRow, nowIso: string): Record<string, unknown> {
  return {
    id: p.id,
    name_masked: p.name_masked,
    phone_last4: p.phone_last4,
    birth_year: p.birth_year,
    age_group: p.age_group,
    sex: p.sex,
    days_since_last_activity: p.days_since_last_activity,
    total_activity_cnt: p.total_activity_cnt,
    cohort: p.cohort,
    track: p.track,
    snapshot_date: p.snapshot_date,
    active: true,
    updated_at: nowIso,
  }
}

function pctDiff(actual: number, expected: number): number {
  return expected === 0 ? (actual === 0 ? 0 : 1) : Math.abs(actual - expected) / expected
}

export function compareExpected(s: ImportSummary): string[] {
  const warnings: string[] = []
  const chk = (label: string, a: number, e: number) => {
    if (pctDiff(a, e) > 0.02) warnings.push(`${label}: actual ${a} vs expected ${e}`)
  }
  chk('total', s.included.length, EXPECTED_20260914.total)
  for (const t of ['A', 'B', 'C'] as const) chk(`track ${t}`, s.byTrack[t], EXPECTED_20260914.byTrack[t])
  for (const c of ['26', '2', '?'] as const) chk(`cohort ${c}`, s.byCohort[c], EXPECTED_20260914.byCohort[c])
  return warnings
}

export async function runImport(opts: {
  rows: Record<string, string>[]
  snapshotDate: string
  client: ImportClient | null
  dryRun: boolean
}): Promise<RunSummary> {
  const { rows, snapshotDate, client, dryRun } = opts
  const t = transformRows(rows as SourceRow[], snapshotDate)
  const providerRows = rows.filter((r) => (r.provider_names ?? '').includes(TARGET_PROVIDER)).length
  const nullPhone = t.included.filter((p) => p.phone_last4 == null).length
  const warnings = compareExpected(t)
  const summary: RunSummary = {
    ...t, totalSource: rows.length, providerRows, nullPhone, deactivated: [], warnings, dryRun,
  }
  if (dryRun) return summary
  if (!client) throw new Error('client required unless dryRun')

  const nowIso = new Date().toISOString()
  const dbRows = t.included.map((p) => toDbRow(p, nowIso))
  const existing = await client.selectIds()
  for (let i = 0; i < dbRows.length; i += BATCH) await client.upsert(dbRows.slice(i, i + BATCH))
  const keep = new Set(t.included.map((p) => p.id))
  const missing = existing.filter((id) => !keep.has(id))
  for (let i = 0; i < missing.length; i += BATCH) await client.deactivate(missing.slice(i, i + BATCH))
  summary.deactivated = missing
  return summary
}

export function supabaseAdapter(url: string, key: string): ImportClient {
  const sb = createClient(url, key, { auth: { persistSession: false } })
  return {
    async selectIds() {
      const ids: string[] = []
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('participants').select('id').order('id').range(from, from + 999)
        if (error) throw new Error(`select participants: ${error.message}`)
        ids.push(...(data ?? []).map((r: { id: string }) => r.id))
        if (!data || data.length < 1000) break
      }
      return ids
    },
    async upsert(rows) {
      const { error } = await sb.from('participants').upsert(rows, { onConflict: 'id' })
      if (error) throw new Error(`upsert participants: ${error.message}`)
    },
    async deactivate(ids) {
      // URL 길이 제한 때문에 나눠서 보낸다
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await sb
          .from('participants')
          .update({ active: false, updated_at: new Date().toISOString() })
          .in('id', ids.slice(i, i + 200))
        if (error) throw new Error(`deactivate participants: ${error.message}`)
      }
    },
  }
}

export function loadDotEnv(path = '.env'): void {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!m || line.trim().startsWith('#')) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
}

export function printSummary(s: RunSummary): void {
  const L = console.log
  L(`Source rows:        ${s.totalSource}`)
  L(`Provider rows:      ${s.providerRows}`)
  L(`Excluded:           ${JSON.stringify(s.excluded)} (not_target counted among all rows)`)
  L(`Included total:     ${s.included.length}`)
  L(`By track:           ${JSON.stringify(s.byTrack)}`)
  L(`By cohort:          ${JSON.stringify(s.byCohort)}`)
  L(`Null birth_year:    ${s.nullBirthYear}`)
  L(`Null phone_last4:   ${s.nullPhone}`)
  L(`Expected 2026-09-14: ${JSON.stringify(EXPECTED_20260914)}`)
  if (s.warnings.length) {
    L('!!!!!!!! WARNING: result differs from expected by more than 2% !!!!!!!!')
    for (const w of s.warnings) L(`  - ${w}`)
    L('(only meaningful for the 2026-09-14 snapshot)')
  } else {
    L('Comparison with expected: within 2%')
  }
  L(s.dryRun ? 'DRY RUN: no network calls made.' : `Deactivated (absent from import): ${s.deactivated.length}`)
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const si = args.indexOf('--snapshot')
  const snapshot = si >= 0 ? args[si + 1] : undefined
  const csvPath = args.find((a, i) => !a.startsWith('--') && i !== si + 1)
  if (!csvPath || !snapshot || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot)) {
    console.error('Usage: npx tsx scripts/import-participants.ts <csv path> --snapshot YYYY-MM-DD [--dry-run]')
    process.exit(1)
  }
  loadDotEnv()
  let client: ImportClient | null = null
  if (!dryRun) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      console.error('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY (set in env or .env).')
      process.exit(1)
    }
    client = supabaseAdapter(url, key)
  }
  const rows = parseCsv(readFileSync(resolve(csvPath), 'utf8'))
  printSummary(await runImport({ rows, snapshotDate: snapshot, client, dryRun }))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1) })
}

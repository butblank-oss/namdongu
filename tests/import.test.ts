// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCsv } from '../scripts/csv.ts'
import { runImport, type ImportClient } from '../scripts/import-participants.ts'
import { computeTrack } from '../src/lib/importRules.ts'

const fixture = () => parseCsv(readFileSync('tests/fixtures/S3_user_info.sample.csv', 'utf8'))

describe('parseCsv', () => {
  it('handles quotes, commas, newlines, escaped quotes, CRLF and BOM', () => {
    const t = '﻿a,b,c\r\n1,"x,y","line1\nline2"\r\n"q""q",,3\r\n'
    expect(parseCsv(t)).toEqual([
      { a: '1', b: 'x,y', c: 'line1\nline2' },
      { a: 'q"q', b: '', c: '3' },
    ])
  })
  it('handles missing trailing newline and empty input', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([{ a: '1', b: '2' }])
    expect(parseCsv('')).toEqual([])
  })
  it('parses the fixture with embedded newline intact', () => {
    const rows = fixture()
    expect(rows).toHaveLength(26)
    expect(rows.some((r) => r.challenge_names.includes('\n'))).toBe(true)
    expect(Object.keys(rows[0])).toHaveLength(26)
  })
})

describe('track boundaries', () => {
  it('follows dsl/total rules', () => {
    expect(computeTrack(null, 99)).toBe('C')
    expect(computeTrack(30, 0)).toBe('A')
    expect(computeTrack(31, 21)).toBe('B')
    expect(computeTrack(31, 20)).toBe('C')
  })
})

function fake(existing: string[] = []) {
  const calls = { upserts: [] as Record<string, unknown>[][], deactivated: [] as string[][] }
  const client: ImportClient = {
    selectIds: async () => existing,
    upsert: async (r) => { calls.upserts.push(r) },
    deactivate: async (ids) => { calls.deactivated.push(ids) },
  }
  return { client, calls }
}

describe('runImport on fixture', () => {
  it('has exact counts', async () => {
    const s = await runImport({ rows: fixture(), snapshotDate: '2026-09-14', client: null, dryRun: true })
    expect(s.totalSource).toBe(26)
    expect(s.providerRows).toBe(24)
    expect(s.excluded).toEqual({ not_target: 2, no_name: 1, test_account: 4, withdrawn: 1 })
    expect(s.included).toHaveLength(17) // duplicate user_id collapsed
    expect(s.byTrack).toEqual({ A: 11, B: 3, C: 3 })
    expect(s.byCohort).toEqual({ '26': 14, '2': 2, '?': 1 })
    expect(s.nullBirthYear).toBe(2)
    expect(s.nullPhone).toBe(1)
    expect(s.warnings.length).toBeGreaterThan(0)
  })

  it('dry run makes no client calls', async () => {
    const { client, calls } = fake(['x'])
    await runImport({ rows: fixture(), snapshotDate: '2026-09-14', client, dryRun: true })
    expect(calls.upserts).toHaveLength(0)
    expect(calls.deactivated).toHaveLength(0)
  })

  it('outputs only allowed columns, no PII', async () => {
    const { client, calls } = fake()
    await runImport({ rows: fixture(), snapshotDate: '2026-09-14', client, dryRun: false })
    const allowed = new Set([
      'id', 'name_masked', 'phone_last4', 'birth_year', 'age_group', 'sex',
      'days_since_last_activity', 'total_activity_cnt', 'cohort', 'track',
      'snapshot_date', 'active', 'updated_at',
    ])
    const out = calls.upserts.flat()
    expect(out).toHaveLength(17)
    for (const r of out) {
      for (const k of Object.keys(r)) expect(allowed.has(k)).toBe(true)
      expect(r.active).toBe(true)
      for (const k of ['nickname', 'birthdate', 'email_masked', 'mobile_masked']) expect(k in r).toBe(false)
      if (r.phone_last4 != null) expect(String(r.phone_last4)).toMatch(/^\d{4}$/)
    }
  })

  it('re-import deactivates missing ids and upserts', async () => {
    const rows = fixture()
    const first = await runImport({ rows, snapshotDate: '2026-09-14', client: null, dryRun: true })
    const ids = first.included.map((p) => p.id)
    const { client, calls } = fake([...ids, 'gone-1', 'gone-2'])
    const s = await runImport({ rows, snapshotDate: '2026-09-14', client, dryRun: false })
    expect(calls.upserts.flat()).toHaveLength(17)
    expect(calls.deactivated).toEqual([['gone-1', 'gone-2']])
    expect(s.deactivated).toEqual(['gone-1', 'gone-2'])
  })

  it('batches upserts in 500s', async () => {
    const base = fixture()[0]
    const rows = Array.from({ length: 1201 }, (_, i) => ({ ...base, user_id: `id-${i}` }))
    const { client, calls } = fake()
    await runImport({ rows, snapshotDate: '2026-09-14', client, dryRun: false })
    expect(calls.upserts.map((b) => b.length)).toEqual([500, 500, 201])
  })
})

describe('script source', () => {
  it("never touches the responses table", () => {
    const src = readFileSync('scripts/import-participants.ts', 'utf8')
    expect(src).not.toMatch(/\.from\(\s*['"`]responses['"`]\s*\)/)
  })
})

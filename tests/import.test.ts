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
    expect(s.excluded).toEqual({ not_target: 2, no_name: 1, test_account: 4, withdrawn: 1, not_cohort3: 3 })
    expect(s.included).toHaveLength(14) // 3기만, duplicate user_id collapsed
    expect(s.included.every((p) => p.cohort === '3')).toBe(true)
    expect(s.byTrack).toEqual({ A: 9, B: 2, C: 3 })
    expect(s.byCohort).toEqual({ '3': 15, '2': 2, '1': 0, '?': 1 })
    expect(s.nullBirthYear).toBe(1)
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
    expect(out).toHaveLength(14)
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
    expect(calls.upserts.flat()).toHaveLength(14)
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

describe('normalizeSex (실제 추출본 형식)', () => {
  it('F/M 과 female/male 을 모두 받는다', async () => {
    const { normalizeSex } = await import('../src/lib/importRules.ts')
    expect(['F', 'M', 'female', 'male', 'male ', '미상', ''].map(normalizeSex)).toEqual(['F', 'M', 'F', 'M', 'M', '?', '?'])
  })
})

describe('normalizeCohort (3기 = 2026년 과정)', () => {
  it('가장 최근 기수를 고른다', async () => {
    const { normalizeCohort } = await import('../src/lib/importRules.ts')
    expect(normalizeCohort('두뇌운동 치매예방교실-26년')).toBe('3')
    expect(normalizeCohort('두뇌운동 치매예방교실 2기 | 두뇌운동 치매예방교실-26년')).toBe('3')
    expect(normalizeCohort('두뇌운동 치매예방교실 | 두뇌운동 치매예방교실 2기')).toBe('2')
    expect(normalizeCohort('단기 기억력 측정해보기 | 두뇌운동 치매예방교실')).toBe('1')
    expect(normalizeCohort('단기 기억력 측정해보기')).toBe('?')
  })
})

describe('마스킹 없는 추출본 (2026-10-26 형식: name · mobile_number)', () => {
  const unmasked = () => fixture().map(({ name_masked: _n, mobile_masked: _m, ...r }, i) => ({
    ...r, name: ['홍길동', '이', '남궁민수 ', ''][i % 4], mobile_number: `010-1234-${String(1000 + i)}`,
  }))

  it('이름을 앱 형식으로 가리고, 실명·뒷4자리를 채운다', async () => {
    const s = await runImport({ rows: unmasked(), snapshotDate: '2026-10-26', client: null, dryRun: true })
    const byName = new Map(s.included.map((p) => [p.full_name, p]))
    expect(byName.get('홍길동')?.name_masked).toBe('홍*동')
    expect(byName.get('이')?.name_masked).toBe('*')
    expect(byName.get('남궁민수')?.name_masked).toBe('남*민수')
    expect(s.fullNameMismatch).toBe(0)
    for (const p of s.included) expect(p.phone_last4).toMatch(/^1\d{3}$/)
    expect(s.excluded.no_name).toBeGreaterThan(0)
  })

  it('전체 번호는 participants 가 아니라 contacts 로만 간다', async () => {
    const contacts: { participant_id: string; mobile: string }[] = []
    const { client, calls } = fake()
    client.insertContacts = async (rows) => { contacts.push(...rows); return rows.length }
    const s = await runImport({ rows: unmasked(), snapshotDate: '2026-10-26', client, dryRun: false })
    for (const r of calls.upserts.flat()) { expect('mobile_number' in r).toBe(false); expect('mobile' in r).toBe(false) }
    expect(contacts).toHaveLength(s.included.length)
    for (const c of contacts) expect(c.mobile).toMatch(/^010-1234-1\d{3}$/)
    expect(s.contacts).toEqual({ available: s.included.length, inserted: s.included.length })
  })
})

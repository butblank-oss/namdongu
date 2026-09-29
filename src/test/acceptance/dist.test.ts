// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite'
import { parseCsv } from '../../../scripts/csv'
import { FIXTURE } from '../helpers'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

test('#1 프로덕션 빌드 산출물에 명단·가짜 생성기가 없다', async () => {
  const out = mkdtempSync(join(tmpdir(), 'namdongu-dist-'))
  const savedEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  const saved = { u: process.env.VITE_SUPABASE_URL, k: process.env.VITE_SUPABASE_ANON_KEY }
  delete process.env.VITE_SUPABASE_URL
  delete process.env.VITE_SUPABASE_ANON_KEY
  try {
    await build({ root: process.cwd(), mode: 'production', logLevel: 'silent', build: { outDir: out, emptyOutDir: true } })
    const files = walk(out)
    expect(files.length).toBeGreaterThan(0)

    const csv = parseCsv(readFileSync(join(process.cwd(), 'tests/fixtures/S3_user_info.sample.csv'), 'utf8'))
    const secrets = new Set<string>()
    for (const r of csv) for (const k of ['name_masked', 'nickname', 'mobile_masked']) if (r[k]) secrets.add(r[k])
    for (const p of FIXTURE) secrets.add(p.name_masked)
    expect(secrets.size).toBeGreaterThan(3)

    for (const f of files) {
      const name = f.slice(out.length + 1)
      expect(name).not.toMatch(/\.csv$/i)
      expect(name).not.toMatch(/(^|\/)roster[^/]*\.json$/i)
      const text = readFileSync(f, 'utf8')
      for (const s of secrets) expect(text.includes(s), `${name} 에 "${s}" 포함`).toBe(false)
      expect(text.includes('makeFakeParticipants'), `${name} 에 makeFakeParticipants`).toBe(false)
    }
  } finally {
    process.env.NODE_ENV = savedEnv
    if (saved.u !== undefined) process.env.VITE_SUPABASE_URL = saved.u
    if (saved.k !== undefined) process.env.VITE_SUPABASE_ANON_KEY = saved.k
    rmSync(out, { recursive: true, force: true })
  }
}, 120_000)

test('#1 .gitignore 가 *.csv 를 막는다', () => {
  const lines = readFileSync(join(process.cwd(), '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim())
  expect(lines).toContain('*.csv')
})

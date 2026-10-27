// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { asService, bootDb } from './db/harness'

const SQL = readFileSync('supabase/migrations/20261027000000_app_version.sql', 'utf8')
const keys = async (db: Awaited<ReturnType<typeof bootDb>>) =>
  ((await asService(db, `select payload->'sections'->'closing' as c from survey_schema where id=1`)).rows[0] as { c: { key: string }[] }).c.map((q) => q.key)

describe('앱 업데이트 문항 마이그레이션', () => {
  it("운영 설문의 '응대 결과' 바로 앞에 넣고, 두 번 실행해도 한 번만 들어간다", async () => {
    const db = await bootDb()
    const closing = ['preorder_4', 'reward', 'result', 'memo'].map((key) => ({ key, type: 'single', label: key, options: ['a'] }))
    await asService(db, `insert into survey_schema (id, payload) values (1, $1::jsonb)`,
      [JSON.stringify({ sections: { intake: [], A: [], B: [], C: [], closing }, guides: {} })])
    await db.exec(SQL)
    expect(await keys(db)).toEqual(['preorder_4', 'reward', 'app_update', 'app_update_fail', 'result', 'memo'])
    await db.exec(SQL)
    expect(await keys(db)).toEqual(['preorder_4', 'reward', 'app_update', 'app_update_fail', 'result', 'memo'])
    const v = await asService(db, `select version from survey_schema where id=1`)
    expect(v.rows).toEqual([{ version: 2 }])
  }, 120000)

  it('설문이 잠겨 있으면 바꾸지 않는다', async () => {
    const db = await bootDb()
    await asService(db, `insert into survey_schema (id, payload, locked) values (1, $1::jsonb, true)`,
      [JSON.stringify({ sections: { intake: [], A: [], B: [], C: [], closing: [{ key: 'result' }] }, guides: {} })])
    await db.exec(SQL)
    expect(await keys(db)).toEqual(['result'])
  }, 120000)
})

describe("설문지 저장 검사: '기타' 직접 입력값", () => {
  it("'<key>__etc' 응답이 있어도 그 문항이 남아 있으면 저장된다. 문항을 지우면 막힌다", async () => {
    const db = await bootDb()
    const sch = (keys: string[]) => JSON.stringify({ sections: { intake: keys.map((key) => ({ key, type: 'multi', label: key, options: ['기타'] })), A: [], B: [], C: [], closing: [{ key: 'result', type: 'single', label: 'r', options: ['a'] }] }, guides: {} })
    await asService(db, `insert into survey_schema (id, payload) values (1, $1::jsonb)`, [sch(['b_like', 'x'])])
    await asService(db, `insert into responses (manual_info, track, answers) values ('{"name":"t"}','B','{"b_like":["기타"],"b_like__etc":"산책"}')`)
    await db.exec(SQL)
    const v = await asService(db, `select payload::text like '%app_update%' as ok from survey_schema where id=1`)
    expect(v.rows).toEqual([{ ok: true }])
    let err: unknown
    try { await asService(db, `update survey_schema set payload = $1::jsonb where id=1`, [sch(['x'])]) } catch (e) { err = e }
    expect(String((err as { hint?: string })?.hint)).toBe('KEY_IN_USE')
  }, 120000)
})

// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PAYLOAD } from '../src/lib/defaultSchema'
import { asService, bootDb } from './db/harness'

const SQL = readFileSync('supabase/migrations/20261027020000_reward_partial_family.sql', 'utf8')

describe('리워드 일부 지급 + 가족 연락처 마이그레이션', () => {
  it('운영 설문(10/27 리워드 변경 후 모양)에 넣으면 앱 기본 설문과 같은 모양이 된다. 두 번 실행해도 같다', async () => {
    const db = await bootDb()
    const closing = [
      { key: 'preorder_4', type: 'single', label: 'p', options: ['신청'] },
      { key: 'contact_pref', type: 'multi', label: 'c', options: ['문자', '가족을 통해'] },
      { key: 'reward', type: 'single', label: '리워드 처리', options: ['현장 지급', '수량 부족 · 보건소 방문 지급', '대상 아님'] },
      { key: 'reward_reason', type: 'text', label: '대상 아님 사유', showIf: { key: 'reward', in: ['대상 아님'] } },
      { key: 'real_name', type: 'text', label: '실명', showIf: { key: 'reward', in: ['현장 지급', '수량 부족 · 보건소 방문 지급'] } },
      { key: 'result', type: 'single', label: 'r', options: ['a'] },
    ]
    await asService(db, `insert into survey_schema (id, payload) values (1, $1::jsonb)`,
      [JSON.stringify({ sections: { intake: [], A: [], B: [], C: [], closing }, guides: {} })])
    for (let i = 0; i < 2; i++) await db.exec(SQL)
    const c = ((await asService(db, `select payload->'sections'->'closing' as c from survey_schema where id=1`)).rows[0] as { c: any[] }).c
    expect(c.map((q) => q.key)).toEqual(['preorder_4', 'contact_pref', 'family_consent', 'family_contact', 'reward', 'reward_partial', 'reward_reason', 'real_name', 'result'])
    const def = Object.fromEntries(DEFAULT_PAYLOAD.sections.closing.map((q) => [q.key, q]))
    for (const k of ['family_consent', 'family_contact', 'reward_partial']) {
      const got = c.find((q) => q.key === k)
      expect(got).toEqual(JSON.parse(JSON.stringify(def[k])))
    }
    expect(c.find((q) => q.key === 'reward').options).toEqual(def.reward.options)
    expect(c.find((q) => q.key === 'real_name').showIf).toEqual(def.real_name.showIf)
    const fn = await db.query(`select count(*)::int as n from pg_proc where proname = '_schema_insert_after'`)
    expect(fn.rows).toEqual([{ n: 0 }])
  }, 120000)
})

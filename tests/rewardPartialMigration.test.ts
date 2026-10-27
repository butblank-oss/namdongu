// @vitest-environment node
import { readFileSync } from 'node:fs'
const ITEMS = readFileSync('supabase/migrations/20261027040000_reward_items.sql', 'utf8')
const FAMILY = readFileSync('supabase/migrations/20261027030000_family_fields.sql', 'utf8')
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
    for (const k of ['family_consent']) {
      const got = c.find((q) => q.key === k)
      expect(got).toEqual(JSON.parse(JSON.stringify(def[k])))
    }
    expect(c.find((q) => q.key === 'reward').options).toEqual(def.reward.options)
    const fn = await db.query(`select count(*)::int as n from pg_proc where proname = '_schema_insert_after'`)
    expect(fn.rows).toEqual([{ n: 0 }])
  }, 120000)

  it('가족 연락처를 성함·관계·번호 세 칸으로 나눈다 (옛 칸은 응답이 없을 때만 지움, 재실행 안전)', async () => {
    const db = await bootDb()
    const closing = [
      { key: 'contact_pref', type: 'multi', label: 'c', options: ['문자', '가족을 통해'] },
      { key: 'family_consent', type: 'single', label: 'f', options: ['동의', '미동의'], showIf: { key: 'contact_pref', in: ['가족을 통해'] } },
      { key: 'family_contact', type: 'text', label: '가족 성함 · 관계 · 휴대폰 번호', showIf: { key: 'family_consent', in: ['동의'] } },
      { key: 'result', type: 'single', label: 'r', options: ['a'] },
    ]
    await asService(db, `insert into survey_schema (id, payload) values (1, $1::jsonb)`,
      [JSON.stringify({ sections: { intake: [], A: [], B: [], C: [], closing }, guides: {} })])
    for (let i = 0; i < 2; i++) await db.exec(FAMILY)
    const c = ((await asService(db, `select payload->'sections'->'closing' as c from survey_schema where id=1`)).rows[0] as { c: any[] }).c
    expect(c.map((q) => q.key)).toEqual(['contact_pref', 'family_consent', 'family_name', 'family_relation', 'family_phone', 'result'])
    const def = Object.fromEntries(DEFAULT_PAYLOAD.sections.closing.map((q) => [q.key, q]))
    for (const k of ['family_name', 'family_relation', 'family_phone']) expect(c.find((q) => q.key === k)).toEqual(JSON.parse(JSON.stringify(def[k])))
  }, 120000)

  it('옛 칸에 이미 응답이 있으면 지우지 않고 새 칸을 뒤에 넣는다', async () => {
    const db = await bootDb()
    const closing = [
      { key: 'family_consent', type: 'single', label: 'f', options: ['동의'] },
      { key: 'family_contact', type: 'text', label: 'old' },
      { key: 'result', type: 'single', label: 'r', options: ['a'] },
    ]
    await asService(db, `insert into survey_schema (id, payload) values (1, $1::jsonb)`,
      [JSON.stringify({ sections: { intake: [], A: [], B: [], C: [], closing }, guides: {} })])
    await asService(db, `insert into responses (manual_info, track, answers) values ('{"name":"t"}','A','{"family_contact":"김영희 딸"}')`)
    await db.exec(FAMILY)
    const c = ((await asService(db, `select payload->'sections'->'closing' as c from survey_schema where id=1`)).rows[0] as { c: any[] }).c
    expect(c.map((q) => q.key)).toEqual(['family_consent', 'family_contact', 'family_name', 'family_relation', 'family_phone', 'result'])
  }, 120000)

  it('리워드 정리: 일부 지급은 여러 개 고르기, 지급 못한 사유, 실명 숨김 → 앱 기본 설문과 같다 (재실행 안전)', async () => {
    const db = await bootDb()
    const closing = [
      { key: 'reward', type: 'single', label: '리워드 처리', options: ['현장 지급', '일부 지급 (재고 부족)', '수량 부족 · 보건소 방문 지급', '대상 아님'] },
      { key: 'reward_partial', type: 'text', label: '드린 것 / 못 드린 것', showIf: { key: 'reward', in: ['일부 지급 (재고 부족)'] } },
      { key: 'reward_reason', type: 'text', label: '대상 아님 사유', showIf: { key: 'reward', in: ['대상 아님'] } },
      { key: 'real_name', type: 'text', label: '실명 (선택 · 리워드 배송 확인용)', showIf: { key: 'reward', in: ['현장 지급'] } },
      { key: 'result', type: 'single', label: 'r', options: ['a'] },
    ]
    await asService(db, `insert into survey_schema (id, payload) values (1, $1::jsonb)`,
      [JSON.stringify({ sections: { intake: [], A: [], B: [], C: [], closing }, guides: {} })])
    await asService(db, `insert into responses (manual_info, track, answers) values ('{"name":"t"}','A','{"real_name":"간경자","reward_partial":"칼마디"}')`)
    for (let i = 0; i < 2; i++) await db.exec(ITEMS)
    const c = ((await asService(db, `select payload->'sections'->'closing' as c from survey_schema where id=1`)).rows[0] as { c: any[] }).c
    expect(c.map((q) => q.key)).toEqual(['reward', 'reward_partial', 'reward_reason', 'real_name', 'result'])
    const def = Object.fromEntries(DEFAULT_PAYLOAD.sections.closing.map((q) => [q.key, q]))
    for (const k of ['reward_partial', 'reward_reason', 'real_name']) {
      const { help: _h, ...got } = c.find((q) => q.key === k)
      const { help: _d, ...want } = JSON.parse(JSON.stringify(def[k]))
      expect(got).toEqual(want)
    }
    expect(c.find((q) => q.key === 'reward_partial').help).toBe(def.reward_partial.help)
  }, 120000)
})

// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { asService, bootDb } from './db/harness'

const SQL = readFileSync('supabase/migrations/20261027010000_reward_options.sql', 'utf8')

describe('리워드 보기 변경 마이그레이션', () => {
  it("'추후 배송' → '수량 부족 · 보건소 방문 지급', 리워드 뒤에 사유 문항, 기존 응답도 바꾼다 (두 번 실행해도 같음)", async () => {
    const db = await bootDb()
    const closing = [
      { key: 'preorder_4', type: 'single', label: 'p', options: ['신청'] },
      { key: 'reward', type: 'single', label: '리워드 처리', options: ['현장 지급', '추후 배송', '대상 아님'] },
      { key: 'real_name', type: 'text', label: '실명', showIf: { key: 'reward', in: ['현장 지급', '추후 배송'] } },
      { key: 'result', type: 'single', label: 'r', options: ['a'] },
    ]
    await asService(db, `insert into survey_schema (id, payload) values (1, $1::jsonb)`,
      [JSON.stringify({ sections: { intake: [], A: [], B: [], C: [], closing }, guides: {} })])
    await asService(db, `insert into responses (manual_info, track, answers, client_rev) values ('{"name":"t"}','A','{"reward":"추후 배송","reward__etc":""}', 3)`)
    for (let i = 0; i < 2; i++) await db.exec(SQL)
    const c = ((await asService(db, `select payload->'sections'->'closing' as c from survey_schema where id=1`)).rows[0] as { c: any[] }).c
    expect(c.map((q) => q.key)).toEqual(['preorder_4', 'reward', 'reward_reason', 'real_name', 'result'])
    expect(c[1].options).toEqual(['현장 지급', '수량 부족 · 보건소 방문 지급', '대상 아님'])
    expect(c[2].showIf).toEqual({ key: 'reward', in: ['대상 아님'] })
    expect(c[3].showIf.in).toEqual(['현장 지급', '수량 부족 · 보건소 방문 지급'])
    const r = await asService(db, `select answers->>'reward' as rw, client_rev from responses`)
    expect(r.rows).toEqual([{ rw: '수량 부족 · 보건소 방문 지급', client_rev: 4 }])
  }, 120000)
})

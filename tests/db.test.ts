// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { asAnon, asService, bootDb, type Db } from './db/harness'

const P1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const P2 = 'aaaaaaaa-0000-0000-0000-000000000002'

const payload = (keys: string[], extra: Record<string, unknown> = {}) => ({
  sections: {
    intake: [
      { type: 'divider', title: 'x' },
      ...keys.map((k) => ({ key: k, type: 'single', label: k })),
    ],
    A: [], B: [], C: [], closing: [],
  },
  ...extra,
})

let db: Db

async function rejects(p: Promise<unknown>, hint?: string) {
  let err: any
  try { await p } catch (e) { err = e }
  expect(err, 'expected error').toBeTruthy()
  if (hint) expect(String(err.hint ?? '') + String(err.message)).toContain(hint)
}

beforeAll(async () => {
  db = await bootDb()
  await asService(db, `insert into participants (id,name_masked,phone_last4,track,snapshot_date)
    values ($1,'간*자','8800','A','2026-09-14'), ($2,'나*자','1234','B','2026-09-14')`, [P1, P2])
  await asService(db, `insert into survey_schema (id, payload) values (1, $1::jsonb)`, [JSON.stringify(payload(['q1']))])
}, 120000)

// 로그인 없이 쓰는 운영 결정(20260929010000_public_access.sql) 이후 기준
describe('anon (로그인 없음)', () => {
  for (const t of ['staff', 'participants', 'responses', 'survey_schema']) {
    it(`can select ${t}`, async () => {
      const r = await asAnon(db, `select * from ${t}`)
      expect(Array.isArray(r.rows)).toBe(true) // 권한 오류 없이 조회된다
    })
  }
  it('cannot select access_log', async () => {
    await rejects(asAnon(db, `select * from access_log`))
  })
})

describe('participants', () => {
  it('anon can select', async () => {
    const r = await asAnon(db, `select id from participants`)
    expect(r.rows.length).toBe(2)
  })
  it('anon insert/update/delete fail', async () => {
    await rejects(asAnon(db, `insert into participants (id,name_masked,track,snapshot_date) values (gen_random_uuid(),'x','A','2026-09-14')`))
    await rejects(asAnon(db, `update participants set name_masked='z'`))
    await rejects(asAnon(db, `delete from participants`))
  })
  it('service can insert', async () => {
    const r = await asService(db, `insert into participants (id,name_masked,track,snapshot_date) values (gen_random_uuid(),'서*비','C','2026-09-14') returning id`)
    expect(r.rows.length).toBe(1)
  })
})

describe('responses', () => {
  it('insert/update ok, delete fails, soft delete ok', async () => {
    const ins = await asAnon(db, `insert into responses (participant_id, track) values ($1,'A') returning id`, [P1])
    const id = (ins.rows[0] as any).id
    const up = await asAnon(db, `update responses set answers='{"q1":"x"}'::jsonb, client_rev=1 where id=$1`, [id])
    expect(up.affectedRows).toBe(1)
    await rejects(asAnon(db, `delete from responses where id=$1`, [id]))
    const sd = await asAnon(db, `update responses set deleted_at=now() where id=$1`, [id])
    expect(sd.affectedRows).toBe(1)
  })

  it('partial unique index', async () => {
    await asAnon(db, `insert into responses (participant_id, track) values ($1,'B')`, [P2])
    await rejects(asAnon(db, `insert into responses (participant_id, track) values ($1,'B')`, [P2]))
    await asAnon(db, `insert into responses (manual_info, track) values ('{"n":1}','A')`)
    await asAnon(db, `insert into responses (manual_info, track) values ('{"n":2}','A')`)
    await asAnon(db, `update responses set deleted_at=now() where participant_id=$1`, [P2])
    await asAnon(db, `insert into responses (participant_id, track) values ($1,'B')`, [P2])
    // soft-deleted P1 row does not block a new one either
    await asAnon(db, `insert into responses (participant_id, track) values ($1,'A')`, [P1])
    await asService(db, `update responses set deleted_at=now() where participant_id in ($1,$2) and deleted_at is null`, [P1, P2])
    await asService(db, `update responses set deleted_at=now() where deleted_at is null`)
  })

  it('stale client_rev rejected; updated_at server-set', async () => {
    const ins = await asAnon(db, `insert into responses (manual_info, track, client_rev, updated_at) values ('{"n":9}','A',5,'2000-01-01') returning id, updated_at`)
    const row = ins.rows[0] as any
    expect(new Date(row.updated_at).getFullYear()).toBeGreaterThan(2000)
    await rejects(asAnon(db, `update responses set client_rev=3 where id=$1`, [row.id]), 'STALE_REV')
    const ok = await asAnon(db, `update responses set client_rev=6, updated_at='2001-01-01' where id=$1 returning updated_at`, [row.id])
    expect(new Date((ok.rows[0] as any).updated_at).getFullYear()).toBeGreaterThan(2001)
    await asService(db, `update responses set deleted_at=now() where id=$1`, [row.id])
  })
})

describe('access_log', () => {
  it('insert ok; select/update/delete fail', async () => {
    await asAnon(db, `insert into access_log (participant_id, staff_name, action) values ($1,'김다희','view')`, [P1])
    await rejects(asAnon(db, `select * from access_log`))
    await rejects(asAnon(db, `update access_log set reason='x'`))
    await rejects(asAnon(db, `delete from access_log`))
    const all = await asService(db, `select * from access_log`)
    expect(all.rows.length).toBeGreaterThan(0)
  })
})

describe('survey_schema', () => {
  it('update increments version', async () => {
    const ad = await asAnon(db, `update survey_schema set payload=$1::jsonb returning version`, [JSON.stringify(payload(['q1', 'q2']))])
    expect(ad.affectedRows).toBe(1)
    expect((ad.rows[0] as any).version).toBe(2)
  })

  it('locked rejects payload change; unlock allowed', async () => {
    await asAnon(db, `update survey_schema set locked=true`)
    await rejects(asAnon(db, `update survey_schema set payload=$1::jsonb`, [JSON.stringify(payload(['q1', 'q3']))]), 'LOCKED')
    const un = await asAnon(db, `update survey_schema set locked=false returning locked, version`)
    expect(un.affectedRows).toBe(1)
    expect((un.rows[0] as any).locked).toBe(false)
  })

  it('KEY_IN_USE blocks removing answered key; adding key ok', async () => {
    await asService(db, `insert into responses (manual_info, track, answers) values ('{"n":77}','A','{"q1":"x"}')`)
    await rejects(asAnon(db, `update survey_schema set payload=$1::jsonb`, [JSON.stringify(payload(['q9']))]), 'KEY_IN_USE')
    const ok = await asAnon(db, `update survey_schema set payload=$1::jsonb`, [JSON.stringify(payload(['q1', 'q2']))])
    expect(ok.affectedRows).toBe(1)
  })
})

describe('4기 신청자 연락처 (participant_contacts, preorder4_applicants)', () => {
  it('신청 응답만 전체 번호와 함께 모인다 (service)', async () => {
    await asService(db, `insert into participant_contacts (participant_id, mobile) values ($1,'010-1111-8800')`, [P1])
    await asService(db, `update responses set deleted_at=now() where participant_id=$1 and deleted_at is null`, [P1])
    await asService(db, `insert into responses (participant_id, track, answers, entered_by)
      values ($1,'A','{"preorder_4":"신청","contact_pref":["문자","전화"]}','김소리')`, [P1])
    await asService(db, `insert into responses (manual_info, track, answers)
      values ('{"name":"명단외","phone_last4":"5555"}','C','{"preorder_4":"신청"}'),
             ('{"name":"미신청","phone_last4":"6666"}','C','{"preorder_4":"보류"}')`)
    const r = await asService(db, `select 이름, 휴대폰, 뒷4자리, 대상, 안내_방법, 구분, 입력자, 참여자_id from preorder4_applicants`)
    expect(r.rows).toEqual([
      { 이름: '간*자', 휴대폰: '010-1111-8800', 뒷4자리: '8800', 대상: '활동 중', 안내_방법: '문자, 전화', 구분: '명단', 입력자: '김소리', 참여자_id: P1 },
      { 이름: '명단외', 휴대폰: null, 뒷4자리: '5555', 대상: '거의 미사용', 안내_방법: null, 구분: '명단 외', 입력자: null, 참여자_id: null },
    ])
  })
  it('anon(공개 앱)은 번호와 신청자 표를 읽거나 쓸 수 없다', async () => {
    await rejects(asAnon(db, `select * from participant_contacts`))
    await rejects(asAnon(db, `select * from preorder4_applicants`))
    await rejects(asAnon(db, `insert into participant_contacts (participant_id, mobile) values ($1,'010-2222-1234')`, [P2]))
  })
  it('번호 형식이 아니면 거부', async () => {
    await rejects(asService(db, `insert into participant_contacts (participant_id, mobile) values ($1,'1234')`, [P2]))
  })
})

describe('4기 동의 칸 (preorder4_applicants)', () => {
  it('4기 개인정보 동의를 받은 신청만 등록 가능으로 표시', async () => {
    await asService(db, `insert into responses (manual_info, track, answers)
      values ('{"name":"동의함","phone_last4":"7001"}','A','{"preorder_4":"신청","p4_privacy":"동의","p4_sms":"미동의"}'),
             ('{"name":"안함","phone_last4":"7002"}','A','{"preorder_4":"신청","p4_privacy":"미동의"}')`)
    const r = await asService(db, `select 이름, "4기_등록_가능", "4기_개인정보_동의", 문자_수신_동의 from preorder4_applicants where 이름 in ('동의함','안함') order by 이름`)
    expect(r.rows).toEqual([
      { 이름: '동의함', '4기_등록_가능': true, '4기_개인정보_동의': '동의', 문자_수신_동의: '미동의' },
      { 이름: '안함', '4기_등록_가능': false, '4기_개인정보_동의': '미동의', 문자_수신_동의: null },
    ])
    await rejects(asAnon(db, `select * from preorder4_applicants`))
  })
})

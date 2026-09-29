// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'
import { asAnon, asService, asUser, bootDb, type Db } from './db/harness'

const ADMIN = '11111111-1111-1111-1111-111111111111'
const OP = '22222222-2222-2222-2222-222222222222'
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
  await asService(db, `update staff set auth_user_id=$1, role='admin' where name='강하연'`, [ADMIN])
  await asService(db, `update staff set auth_user_id=$1 where name='김다희'`, [OP])
  await asService(db, `insert into survey_schema (id, payload) values (1, $1::jsonb)`, [JSON.stringify(payload(['q1']))])
}, 120000)

describe('anon', () => {
  for (const t of ['staff', 'participants', 'responses', 'survey_schema', 'access_log']) {
    it(`cannot select ${t}`, async () => {
      await rejects(asAnon(db, `select * from ${t}`))
    })
  }
})

describe('participants', () => {
  it('authenticated can select', async () => {
    const r = await asUser(db, OP, `select id from participants`)
    expect(r.rows.length).toBe(2)
  })
  it('authenticated insert/update/delete fail', async () => {
    await rejects(asUser(db, ADMIN, `insert into participants (id,name_masked,track,snapshot_date) values (gen_random_uuid(),'x','A','2026-09-14')`))
    await rejects(asUser(db, ADMIN, `update participants set name_masked='z'`))
    await rejects(asUser(db, ADMIN, `delete from participants`))
  })
  it('service can insert', async () => {
    const r = await asService(db, `insert into participants (id,name_masked,track,snapshot_date) values (gen_random_uuid(),'서*비','C','2026-09-14') returning id`)
    expect(r.rows.length).toBe(1)
  })
})

describe('responses', () => {
  it('insert/update ok, delete fails, soft delete ok', async () => {
    const ins = await asUser(db, OP, `insert into responses (participant_id, track) values ($1,'A') returning id`, [P1])
    const id = (ins.rows[0] as any).id
    const up = await asUser(db, OP, `update responses set answers='{"q1":"x"}'::jsonb, client_rev=1 where id=$1`, [id])
    expect(up.affectedRows).toBe(1)
    await rejects(asUser(db, OP, `delete from responses where id=$1`, [id]))
    const sd = await asUser(db, OP, `update responses set deleted_at=now() where id=$1`, [id])
    expect(sd.affectedRows).toBe(1)
  })

  it('partial unique index', async () => {
    await asUser(db, OP, `insert into responses (participant_id, track) values ($1,'B')`, [P2])
    await rejects(asUser(db, OP, `insert into responses (participant_id, track) values ($1,'B')`, [P2]))
    await asUser(db, OP, `insert into responses (manual_info, track) values ('{"n":1}','A')`)
    await asUser(db, OP, `insert into responses (manual_info, track) values ('{"n":2}','A')`)
    await asUser(db, OP, `update responses set deleted_at=now() where participant_id=$1`, [P2])
    await asUser(db, OP, `insert into responses (participant_id, track) values ($1,'B')`, [P2])
    // soft-deleted P1 row does not block a new one either
    await asUser(db, OP, `insert into responses (participant_id, track) values ($1,'A')`, [P1])
    await asService(db, `update responses set deleted_at=now() where participant_id in ($1,$2) and deleted_at is null`, [P1, P2])
    await asService(db, `update responses set deleted_at=now() where deleted_at is null`)
  })

  it('stale client_rev rejected; updated_at server-set', async () => {
    const ins = await asUser(db, OP, `insert into responses (manual_info, track, client_rev, updated_at) values ('{"n":9}','A',5,'2000-01-01') returning id, updated_at`)
    const row = ins.rows[0] as any
    expect(new Date(row.updated_at).getFullYear()).toBeGreaterThan(2000)
    await rejects(asUser(db, OP, `update responses set client_rev=3 where id=$1`, [row.id]), 'STALE_REV')
    const ok = await asUser(db, OP, `update responses set client_rev=6, updated_at='2001-01-01' where id=$1 returning updated_at`, [row.id])
    expect(new Date((ok.rows[0] as any).updated_at).getFullYear()).toBeGreaterThan(2001)
    await asService(db, `update responses set deleted_at=now() where id=$1`, [row.id])
  })
})

describe('access_log', () => {
  it('insert ok; update/delete fail; operator cannot select, admin can', async () => {
    await asUser(db, OP, `insert into access_log (participant_id, staff_name, action) values ($1,'김다희','view')`, [P1])
    await rejects(asUser(db, ADMIN, `update access_log set reason='x'`).then((r) => { if (!r.affectedRows) throw new Error('0 rows') }))
    await rejects(asUser(db, ADMIN, `delete from access_log`))
    const op = await asUser(db, OP, `select * from access_log`)
    expect(op.rows.length).toBe(0)
    const ad = await asUser(db, ADMIN, `select * from access_log`)
    expect(ad.rows.length).toBeGreaterThan(0)
    expect((ad.rows[0] as any).auth_user_id).toBe(OP)
  })
})

describe('survey_schema', () => {
  it('operator update blocked; admin update increments version', async () => {
    const op = await asUser(db, OP, `update survey_schema set payload=$1::jsonb`, [JSON.stringify(payload(['q1', 'q2']))])
    expect(op.affectedRows).toBe(0)
    const ad = await asUser(db, ADMIN, `update survey_schema set payload=$1::jsonb returning version`, [JSON.stringify(payload(['q1', 'q2']))])
    expect(ad.affectedRows).toBe(1)
    expect((ad.rows[0] as any).version).toBe(2)
  })

  it('locked rejects payload change; admin can unlock; operator cannot', async () => {
    await asUser(db, ADMIN, `update survey_schema set locked=true`)
    await rejects(asUser(db, ADMIN, `update survey_schema set payload=$1::jsonb`, [JSON.stringify(payload(['q1', 'q3']))]), 'LOCKED')
    const op = await asUser(db, OP, `update survey_schema set locked=false`)
    expect(op.affectedRows).toBe(0)
    const un = await asUser(db, ADMIN, `update survey_schema set locked=false returning locked, version`)
    expect(un.affectedRows).toBe(1)
    expect((un.rows[0] as any).locked).toBe(false)
  })

  it('KEY_IN_USE blocks removing answered key; adding key ok', async () => {
    await asService(db, `insert into responses (manual_info, track, answers) values ('{"n":77}','A','{"q1":"x"}')`)
    await rejects(asUser(db, ADMIN, `update survey_schema set payload=$1::jsonb`, [JSON.stringify(payload(['q9']))]), 'KEY_IN_USE')
    const ok = await asUser(db, ADMIN, `update survey_schema set payload=$1::jsonb`, [JSON.stringify(payload(['q1', 'q2']))])
    expect(ok.affectedRows).toBe(1)
  })
})

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = resolve(__dirname, '../../supabase/migrations/20260929000000_init.sql')

const SUPABASE_ENV = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
`

export type Db = PGlite

export async function bootDb(): Promise<Db> {
  const db = new PGlite()
  await db.exec(SUPABASE_ENV)
  let sql = readFileSync(MIGRATION, 'utf8')
  try {
    await db.exec(sql)
  } catch (e) {
    // Workaround (harness only): if pgcrypto is unavailable in PGlite, strip that line.
    if (/pgcrypto|extension/i.test(String((e as Error).message))) {
      await db.close()
      const db2 = new PGlite()
      await db2.exec(SUPABASE_ENV)
      sql = sql.replace(/^create extension if not exists pgcrypto;\s*$/m, '')
      await db2.exec(sql)
      return db2
    }
    throw e
  }
  return db
}

async function asRole<T = Record<string, unknown>>(
  db: Db, role: string, sub: string | null, sql: string, params: unknown[] = [],
) {
  return db.transaction(async (tx) => {
    await tx.query(`set local role ${role}`)
    if (sub) await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub])
    return tx.query<T>(sql, params)
  })
}

export const asAnon = <T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) =>
  asRole<T>(db, 'anon', null, sql, params)
export const asUser = <T = Record<string, unknown>>(db: Db, uuid: string, sql: string, params: unknown[] = []) =>
  asRole<T>(db, 'authenticated', uuid, sql, params)
export const asService = <T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) =>
  asRole<T>(db, 'service_role', null, sql, params)

import Dexie, { type Table } from 'dexie'
import type { AccessLogEntry, LocalResponse, Participant, ResponseRow, Staff, SurveySchema } from './types'

export interface KV { key: string; value: unknown }
export interface Snapshot { id?: number; at: string; responses: ResponseRow[] }

export class AppDB extends Dexie {
  participants!: Table<Participant, string>
  responses!: Table<LocalResponse, string>
  accessQueue!: Table<AccessLogEntry, string>
  kv!: Table<KV, string>
  snapshots!: Table<Snapshot, number>

  constructor(name = 'namdongu-field') {
    super(name)
    this.version(1).stores({
      participants: 'id, phone_last4, track',
      responses: 'id, participant_id, _dirty, status, updated_at',
      accessQueue: 'id, at',
      kv: 'key',
      snapshots: '++id, at',
    })
  }

  async getKV<T>(key: string): Promise<T | undefined> {
    return (await this.kv.get(key))?.value as T | undefined
  }
  async setKV(key: string, value: unknown) {
    await this.kv.put({ key, value })
  }
}

export let db = new AppDB()

/** 테스트에서 새로고침을 흉내 낼 때: 같은 이름의 DB를 다시 연다 */
export function reopenDB(name?: string) {
  db.close()
  db = new AppDB(name)
  return db
}

export const KV_SCHEMA = 'schema'
export const KV_STAFF = 'staff'
export const KV_PULL_CURSOR = 'pullCursor'

export async function cachedSchema(): Promise<SurveySchema | undefined> {
  return db.getKV<SurveySchema>(KV_SCHEMA)
}
export async function cachedStaff(): Promise<Staff[]> {
  return (await db.getKV<Staff[]>(KV_STAFF)) ?? []
}

/** 로그아웃 시 이 기기의 개인정보 캐시를 지운다. 미동기화 응답이 있으면 지우지 않는다 */
export async function clearLocalData(): Promise<{ cleared: boolean; pending: number }> {
  const pending = await db.responses.where('_dirty').equals(1).count()
  if (pending > 0) return { cleared: false, pending }
  await db.transaction('rw', [db.participants, db.responses, db.accessQueue, db.kv, db.snapshots], async () => {
    await Promise.all([db.participants.clear(), db.responses.clear(), db.kv.clear(), db.snapshots.clear()])
  })
  return { cleared: true, pending: 0 }
}

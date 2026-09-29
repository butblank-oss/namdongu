import { createContext, useContext, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../lib/db'
import type { Engine } from '../lib/engine'
import type { LocalResponse, Participant } from '../lib/types'

export const EngineContext = createContext<Engine | null>(null)

/** engine 상태(동기화, 스키마, 담당자 등)가 바뀌면 다시 그린다 */
export function useEngine(): Engine {
  const engine = useContext(EngineContext)
  if (!engine) throw new Error('EngineContext 없음')
  useSyncExternalStore(engine.subscribe, engine.getVersion)
  return engine
}

export function useParticipants(): Participant[] | undefined {
  return useLiveQuery(() => db.participants.toArray(), [])
}

export function useResponses(): LocalResponse[] | undefined {
  return useLiveQuery(() => db.responses.filter((r) => !r.deleted_at).toArray(), [])
}

/** participant_id → 응답 (삭제 제외) */
export function useResponseIndex(): Map<string, LocalResponse> {
  const list = useResponses() ?? []
  const m = new Map<string, LocalResponse>()
  for (const r of list) if (r.participant_id) m.set(r.participant_id, r)
  return m
}

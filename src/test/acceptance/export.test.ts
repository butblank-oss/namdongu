import { parseCsv } from '../../../scripts/csv'
import { DEFAULT_PAYLOAD } from '../../lib/defaultSchema'
import { buildResponsesCsv, MULTI_SEPARATOR } from '../../lib/exportCsv'
import type { Participant, ResponseRow } from '../../lib/types'
import { FIXTURE } from '../helpers'

function resp(over: Partial<ResponseRow> = {}): ResponseRow {
  return {
    id: 'r1', participant_id: FIXTURE[0].id, manual_info: null, track: 'A', verified: 'ok',
    verified_by: '김다희', verified_at: '2026-09-30T00:00:00.000Z', real_name: null, consent: '동의', helpers: [],
    answers: { consent: '동의', a_freq: '거의 매일', a_pain: ['글씨·버튼이 작음', '소리가 작음'], a_pain__etc: '', memo: '메모 내용' },
    status: 'done', result: '설문 완료', entered_by: '김도영', device_id: 'd', schema_version: 1,
    started_at: '2026-09-30T00:00:00.000Z', completed_at: '2026-09-30T00:10:00.000Z', updated_at: '2026-09-30T00:10:00.000Z',
    client_rev: 3, deleted_at: null, ...over,
  }
}
const pmap = new Map<string, Participant>(FIXTURE.map((p) => [p.id, p]))
const allQuestions = Object.values(DEFAULT_PAYLOAD.sections).flat().filter((q) => q.type !== 'divider')

describe('CSV 내보내기', () => {
  test('#23 트랙·본인확인 상태·확인자·입력자와 모든 답변 열이 들어간다', () => {
    const csv = buildResponsesCsv([resp()], pmap, DEFAULT_PAYLOAD)
    const [row] = parseCsv(csv)
    expect(row['트랙']).toBe('A')
    expect(row['본인확인']).toBe('확인')
    expect(row['확인자']).toBe('김다희')
    expect(row['입력자']).toBe('김도영')
    const header = Object.keys(row)
    for (const q of allQuestions) expect(header).toContain(`${q.label} [${q.key}]`)
    expect(row['요즘 맬리브레인을 얼마나 자주 하세요? [a_freq]']).toBe('거의 매일')
    expect(row['메모 [memo]']).toBe('메모 내용')
  })

  test('#23 본인확인 상태 라벨: failed/skipped', () => {
    const csv = buildResponsesCsv(
      [resp({ id: 'r2', verified: 'skipped' }), resp({ id: 'r3', participant_id: FIXTURE[1].id, verified: 'failed' })],
      pmap, DEFAULT_PAYLOAD,
    )
    const rows = parseCsv(csv)
    expect(rows.map((r) => r['본인확인'])).toEqual(['확인 못함', '불일치'])
  })

  test('#23 스키마에 없는 답변 key 도 열로 남는다', () => {
    const csv = buildResponsesCsv([resp({ answers: { old_key: '옛 답' } })], pmap, DEFAULT_PAYLOAD)
    expect(parseCsv(csv)[0]['[old_key]']).toBe('옛 답')
  })

  test('#24 복수 선택은 MULTI_SEPARATOR 로 한 칸에 합쳐진다', () => {
    const csv = buildResponsesCsv([resp()], pmap, DEFAULT_PAYLOAD)
    const [row] = parseCsv(csv)
    expect(row['불편한 점을 모두 골라 주세요 [a_pain]']).toBe(['글씨·버튼이 작음', '소리가 작음'].join(MULTI_SEPARATOR))
  })

  test('#24 쉼표·따옴표·줄바꿈이 든 칸은 따옴표로 감싸 올바르게 복원된다', () => {
    const nasty = '안녕, "세상"\n둘째 줄'
    const csv = buildResponsesCsv([resp({ answers: { memo: nasty } })], pmap, DEFAULT_PAYLOAD)
    expect(csv).toContain('"안녕, ""세상""\n둘째 줄"')
    const rows = parseCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0]['메모 [memo]']).toBe(nasty)
  })

  test('#25 CSV 는 BOM 으로 시작한다', () => {
    const csv = buildResponsesCsv([resp()], pmap, DEFAULT_PAYLOAD)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.startsWith('﻿')).toBe(true)
    expect(buildResponsesCsv([], pmap, DEFAULT_PAYLOAD).startsWith('﻿')).toBe(true)
  })
})

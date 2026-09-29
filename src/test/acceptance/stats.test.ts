import { byHour, byStaff, kpis, questionDistribution } from '../../lib/stats'
import type { Participant, Question, ResponseRow } from '../../lib/types'
import { FIXTURE, P } from '../helpers'

let seq = 0
function R(over: Partial<ResponseRow> = {}): ResponseRow {
  return {
    id: `r${++seq}`, participant_id: `p${seq}`, manual_info: null, track: 'A', verified: 'ok', verified_by: null, verified_at: null,
    real_name: null, consent: null, helpers: [], answers: {}, status: 'done', result: null, entered_by: '강하연', device_id: null,
    schema_version: 1, started_at: '2026-09-14T01:00:00.000Z', completed_at: null, updated_at: '2026-09-14T01:00:00.000Z',
    client_rev: 1, deleted_at: null, ...over,
  }
}

describe('kpis', () => {
  test('상태·트랙·특수 카운트', () => {
    const roster: Participant[] = [...FIXTURE, P(99, '비*활', '0000', 'A', { active: false })]
    const rs = [
      R({ track: 'A', answers: { c_checklist: ['설치', '첫 게임 실행'], preorder_4: '신청', reward: '현장 지급' } }),
      R({ track: 'B', answers: { preorder_4: '미신청', reward: '추후 배송' } }),
      R({ track: 'C', status: 'in_progress', answers: { reward: '대상 아님' } }),
      R({ status: 'refused' }),
      R({ status: 'revisit', participant_id: null }),
    ]
    const k = kpis(rs, roster)
    expect(k.rosterTotal).toBe(7)
    expect(k.byTrack.A).toEqual({ total: 2, done: 1 })
    expect(k.byTrack.B).toEqual({ total: 2, done: 1 })
    expect(k.byTrack.C).toEqual({ total: 3, done: 0 })
    expect([k.done, k.inProgress, k.refused, k.revisit]).toEqual([2, 1, 1, 1])
    expect(k.manualAdded).toBe(1)
    expect(k.firstGame).toBe(1)
    expect(k.preorder4).toBe(1)
    expect(k.rewardGiven).toBe(2)
  })
})

describe('questionDistribution', () => {
  const single: Question = { key: 'q1', type: 'single', label: 'Q', options: ['가', '나', '기타'] }
  const multi: Question = { key: 'q2', type: 'multi', label: 'M', options: ['x', 'y', '기타'] }

  test('단일 선택: 옵션 순서, 미응답 제외, 기타 텍스트', () => {
    const d = questionDistribution(single, [
      R({ answers: { q1: '나' } }), R({ answers: { q1: '나' } }), R({ answers: { q1: '기타', q1__etc: ' 직접 ' } }),
      R({ answers: { q1: '' } }), R({ answers: {} }),
    ])
    expect(d.answered).toBe(3)
    expect(d.counts).toEqual([
      { option: '가', count: 0, pct: 0 }, { option: '나', count: 2, pct: 67 }, { option: '기타', count: 1, pct: 33 },
    ])
    expect(d.etcTexts).toEqual(['직접'])
  })

  test('복수 선택: 합계가 100을 넘을 수 있다', () => {
    const d = questionDistribution(multi, [
      R({ answers: { q2: ['x', 'y'] } }), R({ answers: { q2: ['x', '기타'], q2__etc: '메모' } }), R({ answers: { q2: [] } }),
    ])
    expect(d.answered).toBe(2)
    expect(d.counts.map((c) => [c.option, c.count, c.pct])).toEqual([['x', 2, 100], ['y', 1, 50], ['기타', 1, 50]])
    expect(d.etcTexts).toEqual(['메모'])
  })

  test('응답 없음', () => {
    const d = questionDistribution(single, [])
    expect(d.answered).toBe(0)
    expect(d.counts.every((c) => c.pct === 0)).toBe(true)
  })
})

describe('byStaff', () => {
  test('완료 내림차순, 미지정 처리', () => {
    const rs = [
      R({ entered_by: '가' }), R({ entered_by: '나' }), R({ entered_by: '나' }),
      R({ entered_by: null, status: 'in_progress' }), R({ entered_by: '가', status: 'in_progress' }), R({ entered_by: '가', status: 'refused' }),
    ]
    expect(byStaff(rs)).toEqual([
      { name: '나', done: 2, inProgress: 0 },
      { name: '가', done: 1, inProgress: 1 },
      { name: '(미지정)', done: 0, inProgress: 1 },
    ])
  })
})

describe('byHour', () => {
  test('로컬 시각별, 진행중 제외, 정렬', () => {
    const at = (h: number) => new Date(2026, 8, 14, h, 30).toISOString()
    const rs = [
      R({ completed_at: at(11) }), R({ completed_at: at(10) }), R({ completed_at: at(11), status: 'refused' }),
      R({ completed_at: at(9), status: 'in_progress' }), R({ completed_at: null, status: 'done' }),
    ]
    expect(byHour(rs)).toEqual([{ hour: 10, done: 1 }, { hour: 11, done: 2 }])
  })
})

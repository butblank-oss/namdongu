import { DEFAULT_PAYLOAD } from '../../lib/defaultSchema'
import { buildSections, missingRequired } from '../../lib/survey'

test('설문은 한 화면: 동의 → 대상별 문항 → 마무리', () => {
  for (const track of ['A', 'B', 'C'] as const) {
    const sections = buildSections(DEFAULT_PAYLOAD, track, { consent: '동의' })
    expect(sections.map((s) => s.id)).toEqual(['intake', 'track', 'closing'])
    const keys = sections.flatMap((s) => s.questions).map((q) => q.key)
    expect(keys[0]).toBe('consent')
    expect(keys).toEqual(expect.arrayContaining(['preorder_4', 'reward', 'result']))
  }
})

test('개인정보 미동의면 설문 문항 없이 응대 결과·메모만 남는다', () => {
  const sections = buildSections(DEFAULT_PAYLOAD, 'B', { consent: '미동의' })
  const keys = sections.flatMap((s) => s.questions).map((q) => q.key)
  expect(keys).toEqual(['consent', 'result', 'memo'])
  expect(missingRequired(sections.flatMap((s) => s.questions), { consent: '미동의' })).toEqual(['result'])
})

test('의견을 묻는 문항은 대부분 여러 개 선택이고 기타를 받는다', () => {
  const all = Object.values(DEFAULT_PAYLOAD.sections).flat().filter((q) => q.type === 'single' || q.type === 'multi')
  const multi = all.filter((q) => q.type === 'multi')
  expect(multi.length).toBeGreaterThanOrEqual(12)
  expect(multi.filter((q) => q.options?.includes('기타')).length).toBeGreaterThanOrEqual(8)
})

test('도와준 담당자 문항이 없다', () => {
  const all = Object.values(DEFAULT_PAYLOAD.sections).flat()
  expect(all.some((q) => q.key === 'helpers' || q.type === 'staff')).toBe(false)
})

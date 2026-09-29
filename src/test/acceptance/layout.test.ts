import { DEFAULT_PAYLOAD } from '../../lib/defaultSchema'
import { buildSteps, missingRequired } from '../../lib/survey'

test('설문은 두 화면: ① 접수(동의) ② 트랙별 문항 + 마무리', () => {
  for (const track of ['A', 'B', 'C'] as const) {
    const steps = buildSteps(DEFAULT_PAYLOAD, track)
    expect(steps).toHaveLength(2)
    expect(steps[0].questions.map((q) => q.key)).toEqual(['consent'])
    const keys = steps[1].questions.map((q) => q.key)
    expect(keys).toContain('reward')
    expect(keys).toContain('result')
    expect(keys.indexOf('__closing')).toBeLessThan(keys.indexOf('reward'))
    // 구분선은 필수 검사에서 빠진다
    expect(missingRequired(steps[1], {})).not.toContain('__closing')
  }
})

test('도와준 담당자 문항이 없다', () => {
  const all = Object.values(DEFAULT_PAYLOAD.sections).flat()
  expect(all.some((q) => q.key === 'helpers' || q.type === 'staff')).toBe(false)
})

import { DEFAULT_PAYLOAD } from '../../lib/defaultSchema'
import { buildSections, isVisible, missingRequired } from '../../lib/survey'

const closing = () => buildSections(DEFAULT_PAYLOAD, 'A', { consent: '동의' }).find((s) => s.id === 'closing')!.questions

test('4기 동의 문항은 4기 사전신청 = 신청일 때만 보이고, 그때는 꼭 답해야 한다', () => {
  const qs = closing()
  const p4 = qs.filter((q) => q.key === 'p4_privacy' || q.key === 'p4_sms')
  expect(p4.map((q) => q.key)).toEqual(['p4_privacy', 'p4_sms'])
  // 바로 '4기 사전신청' 다음에 온다
  expect(qs.findIndex((q) => q.key === 'p4_privacy')).toBe(qs.findIndex((q) => q.key === 'preorder_4') + 1)
  for (const q of p4) {
    expect(q.notice).toMatch(/목적/)
    expect(q.notice).toMatch(/보유 기간/)
    expect(isVisible(q, { preorder_4: '보류' })).toBe(false)
    expect(isVisible(q, { preorder_4: '신청' })).toBe(true)
  }
  expect(missingRequired(qs, { preorder_4: '보류' })).not.toContain('p4_privacy')
  expect(missingRequired(qs, { preorder_4: '신청' })).toEqual(expect.arrayContaining(['p4_privacy', 'p4_sms']))
  expect(missingRequired(qs, { preorder_4: '신청', p4_privacy: '동의', p4_sms: '미동의' })).not.toContain('p4_sms')
})

test('4기 필수 동의를 거부하면 4기는 미신청, 리워드는 대상 아님(사유 자동)으로 끝난다', async () => {
  const { applyAnswerRules, p4Declined, P4_DECLINED_REASON } = await import('../../lib/survey')
  let a = applyAnswerRules({}, 'preorder_4', '신청')
  a = applyAnswerRules(a, 'reward', '일부 지급 (재고 부족)')
  a = applyAnswerRules(a, 'reward_partial', ['칼마디'])
  a = applyAnswerRules(a, 'p4_sms', '동의')
  a = applyAnswerRules(a, 'p4_privacy', '미동의')
  expect(a.preorder_4).toBe('미신청')
  expect(a.p4_privacy).toBe('미동의')
  expect(a.p4_sms).toBeUndefined()
  expect(a.reward).toBe('대상 아님')
  expect(a.reward_partial).toBeUndefined()
  expect(a.reward_reason).toBe(P4_DECLINED_REASON)
  expect(p4Declined(a)).toBe(true)
  // 직원이 이미 적은 사유는 덮지 않는다
  expect(applyAnswerRules({ reward_reason: '이미 받으심' }, 'p4_privacy', '미동의').reward_reason).toBe('이미 받으심')
  // 동의하면 아무것도 바꾸지 않는다
  expect(applyAnswerRules({ preorder_4: '신청', reward: '현장 지급' }, 'p4_privacy', '동의')).toEqual({ preorder_4: '신청', reward: '현장 지급', p4_privacy: '동의' })
})

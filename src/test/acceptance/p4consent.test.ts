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

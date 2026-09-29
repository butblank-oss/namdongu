import { act, screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** 현재 스텝의 보이는 필수 문항에 첫 보기를 고른다 */
export async function answerRequired(user: UserEvent) {
  const step = screen.getByTestId('survey-step')
  for (const sec of within(step).queryAllByTestId(/^question-/)) {
    if (!within(sec).queryByLabelText('필수')) continue
    const opts = [...within(sec).queryAllByRole('radio'), ...within(sec).queryAllByRole('checkbox')]
    if (opts.length && !opts.some((o) => o.getAttribute('aria-checked') === 'true')) await user.click(opts[0])
  }
}

/** 검색 → 본인 확인 → 모든 스텝 → 응대 완료 */
export async function completeSurvey(user: UserEvent, query: string, rowIndex = 0) {
  const input = screen.getByLabelText('검색')
  await user.clear(input)
  await user.type(input, query)
  await user.click((await screen.findAllByTestId('result-row'))[rowIndex])
  await user.click(await screen.findByRole('button', { name: '본인 확인 완료' }))
  await screen.findByTestId('step-indicator')
  for (let guard = 0; guard < 20; guard++) {
    await answerRequired(user)
    const done = screen.queryByRole('button', { name: '응대 완료' })
    if (done) { await user.click(done); break }
    const before = screen.getByTestId('step-indicator').textContent
    await user.click(screen.getByRole('button', { name: '다음' }))
    await waitFor(() => expect(screen.getByTestId('step-indicator').textContent).not.toBe(before))
  }
  await screen.findByRole('button', { name: '다음 분 찾기' })
}

export function goOffline(remote: { online: boolean }) {
  remote.online = false
  act(() => { window.dispatchEvent(new Event('offline')) })
}

export function goOnline(remote: { online: boolean }) {
  remote.online = true
  act(() => { window.dispatchEvent(new Event('online')) })
}

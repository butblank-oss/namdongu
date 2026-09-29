import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** 검색 → 본인 확인 → 설문 1스텝까지 (간*자, 트랙 A) */
export async function openSurveyFor(user: UserEvent, query = '간경자', name = '간*자') {
  await user.type(screen.getByLabelText('검색'), query)
  const rows = await screen.findAllByTestId('result-row')
  const row = rows.find((r) => within(r).queryByText(name)) ?? rows[0]
  await user.click(row)
  await user.click(await screen.findByRole('button', { name: '본인 확인 완료' }))
  await screen.findByTestId('survey-step')
}

/** 현재 스텝의 필수 문항마다 첫 보기를 누른다 (이미 답한 문항은 건너뜀) */
export async function fillStepRequired(user: UserEvent) {
  const step = await screen.findByTestId('survey-step')
  const sections = within(step).queryAllByTestId(/^question-/)
  for (const sec of sections) {
    if (!within(sec).queryByLabelText('필수')) continue
    const opts = within(sec).queryAllByRole('radio').concat(within(sec).queryAllByRole('checkbox'))
    if (!opts.length) continue
    if (opts.some((o) => o.getAttribute('aria-checked') === 'true')) continue
    await user.click(opts[0])
  }
}

export function stepText() {
  return screen.getByTestId('step-indicator').textContent ?? ''
}

/** 다음 스텝으로. 스텝 번호가 바뀔 때까지 기다린다 */
export async function clickNext(user: UserEvent) {
  const before = stepText()
  await user.click(screen.getByRole('button', { name: '다음' }))
  await waitFor(() => expect(stepText()).not.toBe(before))
}

/** 마지막 스텝까지 필수를 채워 이동 */
export async function goToLastStep(user: UserEvent) {
  while (screen.queryByRole('button', { name: '다음' })) {
    await fillStepRequired(user)
    await clickNext(user)
  }
  await screen.findByRole('button', { name: '응대 완료' })
}

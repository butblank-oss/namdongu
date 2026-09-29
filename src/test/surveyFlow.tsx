import { screen, waitFor, within } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/** 검색 → (필요하면 뒷 4자리 입력) → 본인 확인 → 설문 한 페이지까지 (간*자, 활동 중) */
export async function openSurveyFor(user: UserEvent, query = '간경자', name = '간*자', digits = '8800') {
  await user.type(screen.getByLabelText('검색'), query)
  const rows = await screen.findAllByTestId('result-row')
  const row = rows.find((r) => within(r).queryByText(name)) ?? rows[0]
  await user.click(row)
  const ok = await screen.findByRole('button', { name: '본인 확인 완료' })
  const input = screen.queryByLabelText('어르신이 말한 뒷 4자리')
  if (input) {
    await user.type(input, digits)
    await waitFor(() => expect(ok).toBeEnabled())
  }
  await user.click(ok)
  await screen.findByTestId('survey-step')
}

/** 보이는 필수 문항마다 (기타가 아닌) 첫 보기를 누른다. 답에 따라 새로 보이는 문항도 반복해서 채운다 */
export async function fillStepRequired(user: UserEvent) {
  for (let pass = 0; pass < 6; pass++) {
    const step = await screen.findByTestId('survey-step')
    let clicked = false
    for (const sec of within(step).queryAllByTestId(/^question-/)) {
      if (!within(sec).queryByLabelText('필수')) continue
      const opts = [...within(sec).queryAllByRole('radio'), ...within(sec).queryAllByRole('checkbox')]
      if (!opts.length || opts.some((o) => o.getAttribute('aria-checked') === 'true')) continue
      await user.click(opts.find((o) => !o.textContent?.includes('기타')) ?? opts[0])
      clicked = true
    }
    if (!clicked) return
  }
}

/** 한 페이지 설문: 필수를 모두 채우고 응대 완료 버튼이 보이는 상태로 둔다 */
export async function goToLastStep(user: UserEvent) {
  await fillStepRequired(user)
  await screen.findByRole('button', { name: /응대 완료|수정 완료/ })
}

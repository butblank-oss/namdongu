import { act, screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
import { fillStepRequired } from '../surveyFlow'

/** 보이는 필수 문항에 첫 보기를 고른다 */
export async function answerRequired(user: UserEvent) {
  await fillStepRequired(user)
}

/** 검색 → 본인 확인 → 한 페이지 설문 → 응대 완료 */
export async function completeSurvey(user: UserEvent, query: string, rowIndex = 0, digits?: string) {
  const input = screen.getByLabelText('검색')
  await user.clear(input)
  await user.type(input, query)
  const row = (await screen.findAllByTestId('result-row'))[rowIndex]
  await user.click(row)
  const ok = await screen.findByRole('button', { name: '본인 확인 완료' })
  const digitInput = screen.queryByLabelText('어르신이 말한 뒷 4자리')
  if (digitInput) {
    await user.type(digitInput, digits ?? '8800')
  }
  await user.click(ok)
  await screen.findByTestId('survey-step')
  await answerRequired(user)
  await user.click(screen.getByRole('button', { name: '응대 완료' }))
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

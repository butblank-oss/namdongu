import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'

test('검색 → 본인 확인 → 설문 설문 한 페이지까지', async () => {
  const server = makeServer()
  const { engine } = makeDevice(server)
  await renderApp(engine)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('검색'), '8800')
  const rows = await screen.findAllByTestId('result-row')
  expect(rows).toHaveLength(2)
  await user.click(rows[0])
  await user.click(await screen.findByRole('button', { name: '본인 확인 완료' }))
  expect(await screen.findByTestId('progress-required')).toHaveTextContent('필수')
  expect(within(screen.getByTestId('survey-step')).getByText('개인정보 수집·이용에 동의하셨나요?')).toBeInTheDocument()
})

import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'

test('admin 응답 삭제는 소프트 삭제이고 열람 기록에 delete 가 남는다', async () => {
  const server = makeServer()
  const { engine, db } = makeDevice(server)
  await renderApp(engine)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('검색'), '1234')
  await user.click((await screen.findAllByTestId('result-row'))[0])
  await user.click(await screen.findByRole('button', { name: '본인 확인 완료' }))
  await screen.findByTestId('step-indicator')

  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await user.click(screen.getByRole('button', { name: '응답 삭제' }))
  await screen.findByLabelText('검색')

  const [r] = await db.responses.toArray()
  expect(r.deleted_at).toBeTruthy()
  await waitFor(() => expect(server.responses.get(r.id)?.deleted_at).toBeTruthy())
  expect(server.accessLog.some((e) => e.action === 'delete' && e.response_id === r.id)).toBe(true)
  // 목록에서는 다시 미착수로 보인다
  expect((await screen.findAllByTestId('result-row'))[0]).toHaveTextContent('미착수')
})

test('operator 에게는 응답 삭제 버튼이 없다', async () => {
  const server = makeServer()
  const { engine } = makeDevice(server, { name: '김다희', role: 'operator' })
  await renderApp(engine)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('검색'), '1234')
  await user.click((await screen.findAllByTestId('result-row'))[0])
  await user.click(await screen.findByRole('button', { name: '본인 확인 완료' }))
  await screen.findByTestId('step-indicator')
  expect(screen.queryByRole('button', { name: '응답 삭제' })).not.toBeInTheDocument()
})

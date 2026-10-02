import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeDevice, makeServer, renderApp } from '../helpers'

test('데모(가짜 데이터) 모드에서는 담당자 이름을 골라 바로 시작한다', async () => {
  const server = makeServer()
  const { engine } = makeDevice(server, { name: '김다희', role: 'operator' })
  try { localStorage.removeItem('namdongu.me') } catch { /* 무시 */ }
  engine.me = null
  await renderApp(engine)
  const user = userEvent.setup()

  expect(screen.getByText('본인 이름을 골라 주세요')).toBeInTheDocument()
  expect(screen.queryByLabelText('검색')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '김다희' }))

  expect(await screen.findByLabelText('검색')).toBeInTheDocument()
  expect(screen.getByLabelText('입력자')).toHaveValue('김다희')
  expect(screen.queryByRole('button', { name: '설문지 편집' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
})

test('admin 역할인 이름을 고르면 설문지 편집 버튼이 보인다', async () => {
  const server = makeServer()
  const { engine } = makeDevice(server, { name: '강하연', role: 'admin' })
  await renderApp(engine)
  expect(await screen.findByRole('button', { name: '설문지 편집' })).toBeInTheDocument()
})

import { render, screen, within } from '@testing-library/react'
import { QuestionField } from '../../components/QuestionField'
import { DEFAULT_GAMES } from '../../lib/defaultSchema'

test('앱 설문의 게임 보기에도 카드 번호가 붙는다 (번호는 응답값에 들어가지 않음)', () => {
  const changes: unknown[] = []
  render(<QuestionField q={{ key: 'a_fav_games', type: 'multi', label: '즐겨 하시는 게임', gameList: true, options: DEFAULT_GAMES }}
    value={undefined} invalid={false} staffNames={[]} onChange={(_k, v) => changes.push(v)} />)
  const nos = screen.getAllByTestId('option-no').map((el) => el.textContent)
  expect(nos).toEqual(DEFAULT_GAMES.map((_, i) => String(i + 1)))
  const btn = screen.getByRole('checkbox', { name: '꿀벌의 숫자놀이' })
  expect(within(btn).getByTestId('option-no')).toHaveTextContent('4')
  btn.click()
  expect(changes).toEqual([['꿀벌의 숫자놀이']])
})

test('게임이 아닌 문항에는 번호가 없다', () => {
  render(<QuestionField q={{ key: 'a_like', type: 'multi', label: '좋은 점', options: ['가', '나'] }}
    value={undefined} invalid={false} staffNames={[]} onChange={() => {}} />)
  expect(screen.queryByTestId('option-no')).not.toBeInTheDocument()
})

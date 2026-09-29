import { screen } from '@testing-library/react'
import { fullNameMatchesMasked, transformRows, type SourceRow } from '../../lib/importRules'
import { searchParticipants } from '../../lib/search'
import { FIXTURE, P, makeDevice, makeServer, renderApp } from '../helpers'

const row = (extra: Record<string, string>): SourceRow => ({
  user_id: 'u1', name_masked: '간*자', mobile_masked: '+8210****8800', birthyear: '1948', age_group: '70대',
  sex_label: 'F', provider_names: '인천 남동구 치매안심센터', challenge_names: '두뇌운동 치매예방교실-26년',
  total_activity_cnt: '5', days_since_last_activity: '3', user_status: 'active', ...extra,
})

test('추출본에 실명 열이 있으면 실명을 읽고, 마스킹 이름과 모양이 다른 건 센다', () => {
  const s = transformRows([row({ name: '간경자' }), { ...row({ name: '홍길동' }), user_id: 'u2' }], '2026-10-25')
  expect(s.nameColumn).toBe('name')
  expect(s.included.find((p) => p.id === 'u1')?.full_name).toBe('간경자')
  expect(s.fullNames).toBe(2)
  expect(s.fullNameMismatch).toBe(1)
  expect(fullNameMatchesMasked('간경자', '간*자')).toBe(true)
})

test('실명 열이 없으면 full_name 을 건드리지 않는다 (키 없음)', () => {
  const s = transformRows([row({})], '2026-09-14')
  expect(s.nameColumn).toBeNull()
  expect('full_name' in s.included[0]).toBe(false)
})

test('실명으로도 검색된다', () => {
  const list = [P(1, '간*자', '8800', 'A', { full_name: '간경자' }), P(2, '간*자', '1111', 'A', { full_name: '간말자' })]
  const hits = searchParticipants(list, '간경자')
  expect(hits[0].participant.full_name).toBe('간경자')
})

test('상세(본인 확인)에 들어가면 실명이 보인다', async () => {
  const server = makeServer([{ ...FIXTURE[0], full_name: '간경자' }, ...FIXTURE.slice(1)])
  const { engine } = makeDevice(server)
  await renderApp(engine, `/p/${FIXTURE[0].id}`)
  expect(await screen.findByTestId('verify-name')).toHaveTextContent('간경자')
})

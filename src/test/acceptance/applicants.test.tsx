import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { EngineContext } from '../../app/context'
import type { Engine } from '../../lib/engine'
import { buildApplicantsCsv } from '../../lib/exportCsv'
import type { Participant } from '../../lib/types'
import { ApplicantsScreen } from '../../screens/ApplicantsScreen'
import { FIXTURE, makeDevice, makeServer } from '../helpers'

async function seed(engine: Engine, p: Participant, preorder: string, p4?: string) {
  const r = await engine.createResponse({ participant: p, track: p.track, verified: 'ok' })
  await engine.updateResponse(r.id, (x) => ({ ...x, status: 'done', completed_at: new Date().toISOString(),
    answers: { ...x.answers, preorder_4: preorder, contact_pref: ['문자', '전화'], ...(p4 ? { p4_privacy: p4, p4_sms: p4 } : {}) } }))
  return r.id
}

test('4기 사전신청을 고른 분만 모이고, 명단 CSV에 전체 번호는 없다', async () => {
  const { engine } = makeDevice(makeServer())
  await engine.start()
  await seed(engine, FIXTURE[0], '신청', '동의')
  await seed(engine, FIXTURE[1], '보류')
  await seed(engine, FIXTURE[3], '신청', '미동의')
  render(
    <EngineContext.Provider value={engine}>
      <MemoryRouter initialEntries={['/applicants']}>
        <Routes><Route path="/applicants" element={<ApplicantsScreen />} /></Routes>
      </MemoryRouter>
    </EngineContext.Provider>,
  )
  expect(await screen.findAllByTestId('applicant-row')).toHaveLength(2)
  expect(screen.getByTestId('applicant-count')).toHaveTextContent('2명')
  expect(screen.getByTestId('applicant-ready')).toHaveTextContent('등록 가능 1명')
  expect(screen.getAllByTestId('applicant-row')[0]).toHaveTextContent('문자, 전화')

  const [responses, participants] = await Promise.all([engine.db.responses.toArray(), engine.db.participants.toArray()])
  const csv = buildApplicantsCsv(responses, new Map(participants.map((p) => [p.id, p])))
  const lines = csv.trim().split('\r\n')
  expect(lines).toHaveLength(3)
  expect(lines[0]).not.toMatch(/휴대폰/)
  expect(lines[0]).toMatch(/4기 등록 가능,4기 개인정보 동의,문자 수신 동의/)
  expect(lines.slice(1).map((l) => l.split(',')[1]).sort()).toEqual(['O', 'X'])
  expect(csv).not.toMatch(/01\d-?\d{3,4}-?\d{4}/)
})

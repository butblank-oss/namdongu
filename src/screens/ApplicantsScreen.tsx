import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEngine, useParticipants, useResponses } from '../app/context'
import { Badge, Button, Card, PageTitle, Screen, TRACK_TONE } from '../components/ui'
import { buildApplicantsCsv, downloadText, isPreorder4, stamp } from '../lib/exportCsv'
import { TRACK_LABEL, type LocalResponse, type Participant } from '../lib/types'

function when(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 4기 사전신청자 모아 보기. 4기 프로그램 등록·문자 안내용 */
export function ApplicantsScreen() {
  const engine = useEngine()
  const navigate = useNavigate()
  const responses = useResponses()
  const participants = useParticipants()
  const pMap = useMemo(() => new Map<string, Participant>((participants ?? []).map((p) => [p.id, p])), [participants])
  const rows = useMemo(() => (responses ?? []).filter(isPreorder4)
    .sort((a, b) => (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at)), [responses])

  const nameOf = (r: LocalResponse) => (r.participant_id ? pMap.get(r.participant_id)?.name_masked : undefined) ?? r.manual_info?.name ?? ''
  const last4Of = (r: LocalResponse) => (r.participant_id ? pMap.get(r.participant_id)?.phone_last4 : undefined) ?? r.manual_info?.phone_last4 ?? ''
  const pref = (r: LocalResponse) => { const v = r.answers.contact_pref; return Array.isArray(v) ? v.join(', ') : (v ?? '') }

  const open = (r: LocalResponse) => { engine.passedGate.add(r.id); navigate(`/r/${r.id}`) }
  const exportCsv = () => {
    downloadText(`4기신청자_${stamp()}.csv`, buildApplicantsCsv(rows, pMap))
    void engine.logAccess('export', null)
  }

  return (
    <Screen className="max-w-6xl">
      <PageTitle sub="설문 마무리에서 '4기 사전신청 → 신청'을 고른 분이 자동으로 모입니다."
        right={<Button variant="primary" onClick={exportCsv} disabled={rows.length === 0}>명단 내려받기</Button>}>
        4기 신청자 <span className="ml-1 text-[19px] font-medium text-grey-500" data-testid="applicant-count">{rows.length}명</span>
      </PageTitle>

      <Card className="mb-6 bg-blue-50 p-5 text-[15px] leading-relaxed text-grey-700 shadow-none">
        <b className="text-grey-900">전체 휴대폰 번호는 이 화면에 나오지 않습니다.</b> 주소만 알면 누구나 여는 페이지라서 번호는 숨겨 두었습니다.
        <br />4기 등록이나 문자 안내에 쓸 번호가 붙은 명단은 관리자가 Supabase → Table Editor → <b>preorder4_applicants</b>에서 내려받습니다.
      </Card>

      {rows.length === 0 ? (
        <Card className="p-12 text-center text-[17px] text-grey-500">아직 4기 신청자가 없습니다</Card>
      ) : (
        <div className="overflow-x-auto rounded-[20px] bg-white p-2 shadow-[var(--shadow-card)]">
          <table className="w-full border-collapse text-left text-[16px]">
            <thead>
              <tr className="text-[14px] font-medium text-grey-500">
                {['응답 시각', '이름', '뒷4자리', '대상', '안내 방법', '입력자'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-grey-100">
              {rows.map((r) => (
                <tr key={r.id} data-testid="applicant-row" tabIndex={0} role="button"
                  onClick={() => open(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(r) } }}
                  className="cursor-pointer text-grey-900 hover:bg-grey-50 focus:bg-grey-50">
                  <td className="tabular px-4 py-4 text-grey-500">{when(r.completed_at ?? r.updated_at)}</td>
                  <td className="px-4 py-4">{nameOf(r)} {!r.participant_id && <Badge tone="grey">명단 외</Badge>}</td>
                  <td className="tabular px-4 py-4 text-grey-500">{last4Of(r)}</td>
                  <td className="px-4 py-4"><Badge tone={TRACK_TONE[r.track]}>{TRACK_LABEL[r.track]}</Badge></td>
                  <td className="px-4 py-4">{pref(r)}</td>
                  <td className="px-4 py-4">{r.entered_by ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Screen>
  )
}

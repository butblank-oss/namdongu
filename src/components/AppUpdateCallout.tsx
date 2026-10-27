import { APP_UPDATE_DONE, compareVersion, LATEST_APP_VERSION } from '../lib/defaultSchema'
import type { AnswerValue, Participant } from '../lib/types'
import { Badge } from './ui'

export type AppUpdateState = 'unknown' | 'outdated' | 'updated' | 'latest'

export function appUpdateState(p: Participant | null | undefined, answer: AnswerValue | undefined): AppUpdateState {
  if (answer === APP_UPDATE_DONE) return 'updated'
  const cmp = compareVersion(p?.app_version, LATEST_APP_VERSION)
  if (cmp == null) return 'unknown'
  return cmp < 0 ? 'outdated' : 'latest'
}

const OS_LABEL: Record<string, string> = { android: '안드로이드', iOS: '아이폰' }
const osLabel = (os: string | null | undefined) => (os ? OS_LABEL[os] ?? os : '')

/** 설문 머리: 앱 버전 한눈에 */
export function AppVersionBadge({ p, answer }: { p: Participant | null | undefined; answer: AnswerValue | undefined }) {
  const state = appUpdateState(p, answer)
  if (state === 'updated') return <Badge tone="green">앱 업데이트 완료 ✓</Badge>
  if (state === 'outdated') return <span data-testid="app-badge"><Badge tone="red">앱 {p!.app_version} · 업데이트 필요</Badge></span>
  if (state === 'latest') return <Badge tone="green">앱 최신 {p!.app_version}</Badge>
  return null
}

/** '앱 업데이트' 문항 바로 위 안내. 구버전이면 빨갛게 크게, 현장에서 업데이트하면 초록으로 강조 */
export function AppUpdateCallout({ p, answer }: { p: Participant | null | undefined; answer: AnswerValue | undefined }) {
  const state = appUpdateState(p, answer)
  const os = osLabel(p?.app_os)
  const store = p?.app_os === 'iOS' ? 'App Store' : 'Play 스토어'
  if (state === 'updated') {
    return (
      <div data-testid="app-callout" data-state="updated" className="flex items-center gap-4 rounded-2xl bg-green-50 px-5 py-4 ring-2 ring-inset ring-green-500">
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-green-500 text-[24px] font-bold text-white">✓</span>
        <div>
          <p className="text-[21px] font-extrabold text-green-700">현장에서 업데이트했어요</p>
          <p className="text-[16px] font-semibold text-green-700">
            {p?.app_version ? <>{p.app_version} → <b>{LATEST_APP_VERSION}</b></> : <>최신 {LATEST_APP_VERSION}</>}{os && ` · ${os}`}
          </p>
        </div>
      </div>
    )
  }
  if (state === 'outdated') {
    return (
      <div data-testid="app-callout" data-state="outdated" className="rounded-2xl bg-red-50 px-5 py-4 ring-2 ring-inset ring-red-500">
        <p className="text-[21px] font-extrabold text-red-600">업데이트가 안 되어 있어요</p>
        <p className="mt-1 text-[18px] font-bold text-red-600">
          지금 <span className="tabular rounded-md bg-white px-2">{p!.app_version}</span> → 최신 <span className="tabular rounded-md bg-white px-2">{LATEST_APP_VERSION}</span>{os && ` · ${os}`}
        </p>
        <p className="mt-2 text-[15px] text-red-700">{store} → 맬리브레인 → <b>업데이트</b>를 눌러 함께 업데이트해 주세요.</p>
      </div>
    )
  }
  if (state === 'latest') {
    return (
      <p data-testid="app-callout" data-state="latest" className="rounded-2xl bg-green-50 px-5 py-3 text-[17px] font-semibold text-green-700">
        이미 최신 버전이에요 ({p!.app_version}{os && ` · ${os}`}). '이미 최신'을 골라 주세요.
      </p>
    )
  }
  return (
    <p data-testid="app-callout" data-state="unknown" className="rounded-2xl bg-grey-100 px-5 py-3 text-[16px] text-grey-700">
      명단에 앱 버전 정보가 없어요. 어르신 휴대폰에서 버전을 확인해 주세요 (최신 {LATEST_APP_VERSION}).
    </p>
  )
}

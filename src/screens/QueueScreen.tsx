import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useEngine } from '../app/context'
import { Badge, Button, Card, PageTitle, Screen, inputCls } from '../components/ui'
import { RemoteError } from '../lib/remote'
import type { Engine } from '../lib/engine'
import { Announcer, ANNOUNCE_LABEL, type AnnounceMode } from '../lib/announcer'

/*
 * 현장 대기번호.
 * - 입구에서 번호표(1~160)를 드린다.
 * - 자리가 빈 직원이 '다음 분 호출'을 누르면 번호가 1씩 올라가고(서버가 순서대로 처리), 그 번호는 그 직원의 다음 설문에 들어간다.
 * - 대기석 큰 화면(#/queue)과 모든 직원 앱이 같은 번호를 실시간으로 본다.
 */

function queueMessage(e: unknown): string {
  if (e instanceof RemoteError && e.code === 'QUEUE_END') return '준비한 번호표를 모두 불렀습니다. 관리자에게 끝 번호를 늘려 달라고 하세요.'
  if (e instanceof RemoteError && e.code === 'NETWORK') return '인터넷 연결이 필요합니다. 번호는 설문 화면에서 직접 적을 수 있어요.'
  return `호출하지 못했습니다: ${(e as Error).message}`
}

async function callNext(engine: Engine) {
  try { await engine.callNext() } catch (e) { window.alert(queueMessage(e)) }
}

/** 상단 바: 다음 분 호출 + 내가 부른 번호 */
export function QueueControl() {
  const engine = useEngine()
  const [busy, setBusy] = useState(false)
  // 실시간 알림을 놓쳐도 버튼의 번호가 오래 어긋나지 않게 10초마다, 그리고 창으로 돌아올 때 다시 읽는다
  useEffect(() => {
    const pull = () => void engine.pullQueue()
    const t = setInterval(pull, 10_000)
    window.addEventListener('focus', pull)
    return () => { clearInterval(t); window.removeEventListener('focus', pull) }
  }, [engine])
  const q = engine.queue
  if (!q) return null
  const next = q.last_called + 1
  const ended = q.last_called >= q.max_number

  return (
    <div className="flex items-center gap-1.5" data-testid="queue-control">
      {engine.myCall != null && (
        <button type="button" data-testid="my-call" title="한 번 더 부르기 (큰 화면에 다시 떠요)"
          onClick={() => {
            const n = engine.myCall!
            if (!window.confirm(`${n}번을 한 번 더 부를까요? 큰 화면에 ${n}번이 다시 뜹니다.`)) return
            void engine.recall(n).catch((e) => window.alert(queueMessage(e)))
          }}
          className="inline-flex min-h-10 items-center gap-1 whitespace-nowrap rounded-xl bg-blue-50 px-3 text-[15px] font-bold text-blue-600 hover:bg-blue-100">
          {`내 호출 ${engine.myCall}번`} <span aria-hidden className="text-blue-400">↻</span>
        </button>
      )}
      <Button variant="primary" size="sm" className="min-h-10 whitespace-nowrap px-3.5 text-[15px]" disabled={busy || ended}
        data-testid="call-next"
        onClick={async () => { setBusy(true); await callNext(engine); setBusy(false) }}>
        {ended ? '번호 끝' : `다음 분 호출 ${next}번`}
      </Button>
    </div>
  )
}

/** 설문 화면 머리의 대기번호 칸 (호출하면 자동으로 들어오고, 직접 고칠 수도 있다) */
export function QueueNoField({ responseId, value }: { responseId: string; value: number | null | undefined }) {
  const engine = useEngine()
  const [text, setText] = useState(value != null ? String(value) : '')
  useEffect(() => { setText(value != null ? String(value) : '') }, [value])
  if (!engine.queue && value == null) return null // 대기번호 기능이 아직 서버에 없음
  const save = (t: string) => {
    const n = Number(t)
    const queue_no = t.trim() === '' ? null : Number.isInteger(n) && n >= 1 && n <= 999 ? n : undefined
    if (queue_no === undefined || queue_no === (value ?? null)) return
    void engine.updateResponse(responseId, (r) => ({ ...r, queue_no }))
  }
  return (
    <label className="flex items-center gap-1.5 whitespace-nowrap text-[15px] font-semibold text-grey-600">
      대기
      <input aria-label="대기번호" data-testid="queue-no" inputMode="numeric" value={text} placeholder="-"
        onChange={(e) => setText(e.target.value.replace(/\D/g, '').slice(0, 3))}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        className="tabular h-10 w-16 rounded-xl bg-white text-center text-[19px] font-bold text-grey-900 ring-1 ring-inset ring-grey-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      번
    </label>
  )
}

// ── 대기석 큰 화면 ─────────────────────────────────
const MODE_KEY = 'namdongu.announceMode'
function loadMode(): AnnounceMode {
  try { const v = localStorage.getItem(MODE_KEY); if (v && v in ANNOUNCE_LABEL) return v as AnnounceMode } catch { /* 기본값 */ }
  return 'voice2'
}

export function QueueDisplayScreen() {
  const engine = useEngine()
  const q = engine.queue
  const [started, setStarted] = useState(false)
  const [mode, setMode] = useState<AnnounceMode>(loadMode)
  const announcer = useRef<Announcer | null>(null)
  announcer.current ??= new Announcer()
  const latest = q?.calls[0] ?? null
  const callKey = latest ? `${latest.number}@${latest.called_at}` : ''
  const prevKey = useRef(callKey)

  useEffect(() => {
    if (callKey && callKey !== prevKey.current && started && latest) void announcer.current!.announce(latest.number, mode)
    prevKey.current = callKey
  }, [callKey, started])

  const changeMode = (m: AnnounceMode) => {
    setMode(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* 이번 화면에서만 */ }
  }

  // 실시간 연결이 끊겨도 15초마다 다시 읽는다
  useEffect(() => {
    const t = setInterval(() => void engine.pullQueue(), 15_000)
    return () => clearInterval(t)
  }, [engine])

  const start = () => {
    setStarted(true)
    announcer.current!.unlock()
    void announcer.current!.chime()
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const recent = q ? q.calls.slice(1, 6) : []
  const remaining = q ? q.max_number - q.last_called : 0

  return (
    <main className="flex min-h-screen flex-col break-keep bg-white text-grey-900" data-testid="queue-display">
      <header className="flex items-center gap-4 px-[4vw] pt-[3vh]">
        <span aria-hidden className="grid h-[5vh] w-[5vh] place-items-center rounded-xl bg-blue-500 text-[2.5vh] font-extrabold text-white">M</span>
        <span className="text-[3.6vh] font-bold">맬리브레인 설문 대기 안내</span>
        <label className="no-print ml-auto flex items-center gap-2 text-[14px] font-semibold text-grey-400">
          호출 소리
          <select aria-label="호출 소리" value={mode} onChange={(e) => changeMode(e.target.value as AnnounceMode)}
            className="rounded-lg bg-grey-100 px-2 py-1.5 text-[14px] text-grey-600">
            {(Object.keys(ANNOUNCE_LABEL) as AnnounceMode[]).map((m) => <option key={m} value={m}>{ANNOUNCE_LABEL[m]}</option>)}
          </select>
        </label>
        <button type="button" className="no-print rounded-lg px-2 py-1.5 text-[14px] font-semibold text-grey-400 hover:bg-grey-100"
          onClick={() => { announcer.current!.unlock(); void announcer.current!.announce(latest?.number ?? 1, mode) }}>소리 시험</button>
        <Link to="/" className="no-print rounded-xl px-3 py-2 text-[15px] font-semibold text-grey-400 hover:bg-grey-100">앱으로</Link>
      </header>

      {!q ? (
        <p className="m-auto text-[4vh] text-grey-500">연결 중…</p>
      ) : (
        <div className="grid flex-1 grid-cols-[3fr_2fr] gap-[3vw] px-[4vw] py-[4vh]">
          <section className="flex flex-col items-center justify-center rounded-[4vh] bg-blue-50" aria-live="assertive">
            {latest ? (
              <>
                {latest.number !== q.last_called
                  ? <p className="text-[5vh] font-bold text-orange-600" data-testid="display-recall">다시 부르는 번호</p>
                  : <p className="text-[5vh] font-bold text-blue-700">들어오실 번호</p>}
                <p key={callKey} data-testid="display-now" className="tabular animate-[queue-pop_0.6s_ease-out] font-extrabold leading-none text-blue-600" style={{ fontSize: '34vh' }}>
                  {latest.number}
                </p>
                <p className="mt-[1vh] text-[5vh] font-bold text-blue-700">번 어르신, 들어오세요</p>
              </>
            ) : (
              <p className="text-[6vh] font-bold text-blue-700">곧 호출을 시작합니다</p>
            )}
          </section>

          <section className="flex flex-col gap-[3vh]">
            <div className="rounded-[3vh] bg-grey-100 px-[2.5vw] py-[3vh]">
              <p className="text-[3.4vh] font-bold text-grey-600">다음 순서</p>
              <p className="mt-[1vh] text-[6vh] font-extrabold leading-tight" data-testid="display-next">
                {remaining > 0 ? <><span className="tabular text-orange-500">{q.last_called + 1}</span>번 어르신</> : '모두 호출했습니다'}
              </p>
              {remaining > 0 && <p className="mt-[0.5vh] text-[3.2vh] font-semibold text-grey-600">준비해 주세요</p>}
            </div>
            <div className="flex-1 rounded-[3vh] bg-grey-100 px-[2.5vw] py-[3vh]">
              <p className="text-[3.4vh] font-bold text-grey-600">방금 부른 번호</p>
              <ul className="mt-[1.5vh] flex flex-wrap gap-[1.2vw]" data-testid="display-recent">
                {recent.map((c) => (
                  <li key={c.number} className="tabular rounded-[2vh] bg-white px-[1.4vw] py-[0.8vh] text-[6vh] font-extrabold text-grey-700">{c.number}</li>
                ))}
                {recent.length === 0 && <li className="text-[3vh] text-grey-400">아직 없어요</li>}
              </ul>
              <p className="mt-[2vh] text-[2.8vh] text-grey-500">번호를 놓치셨으면 직원에게 번호표를 보여 주세요.</p>
            </div>
          </section>
        </div>
      )}

      {!started && (
        <button type="button" onClick={start} data-testid="display-start"
          className="no-print fixed inset-x-0 bottom-0 bg-grey-900/85 py-5 text-[20px] font-bold text-white">
          화면을 한 번 눌러 주세요 · 호출 소리 켜기 + 전체 화면
        </button>
      )}
    </main>
  )
}

// ── 관리: 다시 부르기 · 번호 바꾸기 ─────────────────
export function QueueSettingsScreen() {
  const engine = useEngine()
  const q = engine.queue
  const [next, setNext] = useState(() => (q ? String(q.last_called + 1) : ''))
  const [max, setMax] = useState(() => (q ? String(q.max_number) : ''))
  // 입력을 시작하면 다른 노트북의 호출로 칸이 바뀌지 않게 한다 (저장하거나 되돌리면 다시 따라간다)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (q && !dirty) { setNext(String(q.last_called + 1)); setMax(String(q.max_number)) }
  }, [q?.last_called, q?.max_number, dirty])

  async function save(e: FormEvent) {
    e.preventDefault()
    // 0 을 넣어도 '처음부터'(1번부터)로 받는다 (예전 칸 '마지막으로 부른 번호'에 0을 넣던 습관)
    const n = Math.max(1, Number(next)), m = Number(max)
    if (next.trim() === '' || !Number.isInteger(n) || !Number.isInteger(m) || m < 1 || m > 999 || n > m + 1) {
      setMsg('다음에 부를 번호는 1 이상, 끝 번호 이하로 적어 주세요.'); return
    }
    await apply(n, m)
  }

  async function apply(n: number, m: number) {
    const cur = q?.last_called ?? 0
    if (n - 1 < cur && !window.confirm(`다음 호출을 ${n}번부터 다시 합니다. ${n}번 이후로 이미 부른 기록은 지워져요. 바꿀까요?`)) return
    try {
      await engine.setQueue(n - 1, m)
      setDirty(false)
      setMsg(`저장했습니다. 다음 호출은 ${n}번입니다.`)
    } catch (err) { setMsg(`저장하지 못했습니다: ${(err as Error).message}`) }
  }

  return (
    <Screen>
      <PageTitle sub="대기석 큰 화면 노트북에서도 직원 계정으로 로그인한 뒤 '대기 화면'을 여세요."
        right={<Button variant="tonal" onClick={() => window.open(`${location.pathname}#/queue`, '_blank')}>대기 화면 열기</Button>}>
        대기번호
      </PageTitle>
      {!q ? <p className="text-[17px] text-grey-500">대기번호를 불러오지 못했습니다. 인터넷 연결을 확인하세요.</p> : (
        <div className="grid grid-cols-2 gap-6">
          <Card className="p-6">
            <p className="text-[17px] text-grey-700">지금까지 <b className="tabular text-grey-900">{q.last_called}</b>번까지 불렀어요 · 끝 번호 <b className="tabular">{q.max_number}</b> · 남은 번호표 <b className="tabular">{q.max_number - q.last_called}</b>장</p>
            <h2 className="mt-6 text-[17px] font-bold text-grey-900">최근 부른 번호</h2>
            <ul className="mt-3 divide-y divide-grey-100" data-testid="queue-calls">
              {q.calls.map((c) => (
                <li key={c.number} className="flex items-center gap-3 py-2.5">
                  <span className="tabular w-14 text-[20px] font-bold">{c.number}번</span>
                  <span className="text-[15px] text-grey-600">{c.called_by ?? '-'}</span>
                  <span className="tabular text-[14px] text-grey-400">{new Date(c.called_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <Button size="sm" className="ml-auto" onClick={() => void engine.recall(c.number).catch((e) => setMsg(queueMessage(e)))}>다시 부르기</Button>
                </li>
              ))}
              {q.calls.length === 0 && <li className="py-3 text-grey-500">아직 부른 번호가 없어요.</li>}
            </ul>
          </Card>
          <Card className="p-6">
            <h2 className="text-[17px] font-bold text-grey-900">번호 바꾸기 <Badge tone="red">관리자</Badge></h2>
            <p className="mt-2 text-[15px] leading-relaxed text-grey-600">행사 시작 전에 다음에 부를 번호를 <b>1</b>로 두면 1번부터 부릅니다. 번호표를 더 만들었으면 끝 번호를 늘리세요.</p>
            <form onSubmit={(e) => void save(e)} className="mt-4 space-y-3">
              <label className="block text-[15px] font-semibold text-grey-700">다음에 부를 번호
                <input className={`${inputCls} mt-1`} inputMode="numeric" value={next} disabled={!engine.isAdmin}
                  onChange={(e) => { setDirty(true); setNext(e.target.value.replace(/\D/g, '')) }} />
              </label>
              <label className="block text-[15px] font-semibold text-grey-700">끝 번호 (번호표 장수)
                <input className={`${inputCls} mt-1`} inputMode="numeric" value={max} disabled={!engine.isAdmin}
                  onChange={(e) => { setDirty(true); setMax(e.target.value.replace(/\D/g, '')) }} />
              </label>
              <div className="flex gap-2">
                <Button type="submit" variant="primary" disabled={!engine.isAdmin}>저장</Button>
                {dirty && <Button onClick={() => { setDirty(false); setMsg(null) }}>되돌리기</Button>}
                <Button variant="dangerWeak" className="ml-auto" disabled={!engine.isAdmin}
                  onClick={() => void apply(1, Number(max) || q.max_number)}>처음부터 다시 (1번부터)</Button>
              </div>
              {msg && <p role="alert" data-testid="queue-settings-msg" className="rounded-xl bg-grey-100 px-4 py-3 text-[15px] font-semibold text-grey-800">{msg}</p>}
              {!engine.isAdmin && <p className="text-[14px] text-grey-500">관리자만 바꿀 수 있어요.</p>}
            </form>
          </Card>
        </div>
      )}
    </Screen>
  )
}

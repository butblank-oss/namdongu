import { useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useEngine, useResponses } from '../app/context'
import { Badge, Button, Modal, Screen } from '../components/ui'
import { RESERVED_KEYS } from '../lib/defaultSchema'
import { RemoteError } from '../lib/remote'
import {
  QUESTION_TYPE_LABEL, SECTION_LABEL, type Question, type QuestionType, type SectionId, type Staff, type SurveyPayload, type Track,
} from '../lib/types'

type Tab = 'questions' | 'staff' | 'guides' | 'lock'
type DraftQ = Question & { _uid: string; _orig: string | null }
type Draft = { sections: Record<SectionId, DraftQ[]>; guides: SurveyPayload['guides'] }

const SECTIONS: SectionId[] = ['intake', 'A', 'B', 'C', 'closing']
let uidSeq = 0
const uid = () => `u${++uidSeq}`

function toDraft(p: SurveyPayload): Draft {
  const sections = {} as Draft['sections']
  for (const s of SECTIONS) sections[s] = (p.sections[s] ?? []).map((q) => ({ ...structuredClone(q), _uid: uid(), _orig: q.key }))
  return { sections, guides: { ...p.guides } }
}

function fromDraft(d: Draft): SurveyPayload {
  const sections = {} as SurveyPayload['sections']
  for (const s of SECTIONS) {
    sections[s] = d.sections[s].map((q) => {
      const { _uid: _u, _orig: _o, ...rest } = q
      const out: Question = { ...rest }
      if (!out.help) delete out.help
      if (!out.required) delete out.required
      if (!out.gameList) delete out.gameList
      if (!['single', 'multi'].includes(out.type)) delete out.options
      if (!out.showIf?.key) delete out.showIf
      return out
    })
  }
  return { sections, guides: d.guides }
}

export function usedAnswerKeys(responses: { answers: Record<string, unknown>; deleted_at: string | null }[]): Set<string> {
  const s = new Set<string>()
  for (const r of responses) if (!r.deleted_at) for (const k of Object.keys(r.answers)) s.add(k)
  return s
}

export function AdminScreen() {
  const engine = useEngine()
  if (!engine.isAdmin) return <Navigate to="/" replace />
  return <AdminInner />
}

function AdminInner() {
  const engine = useEngine()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('questions')
  const locked = engine.schema.locked
  return (
    <Screen className="max-w-6xl">
      <div className="mb-4 flex items-center gap-3">
        <Button onClick={() => navigate('/')}>← 돌아가기</Button>
        <h1 className="text-2xl font-extrabold">설문지 편집</h1>
        <Badge>v{engine.schema.version}</Badge>
        {locked ? <Badge tone="red">행사 잠금 중 · 수정 불가</Badge> : <Badge tone="green">편집 가능</Badge>}
      </div>
      <div className="mb-4 flex gap-2" role="tablist">
        {([['questions', '설문 문항'], ['guides', '트랙별 안내문'], ['staff', '담당자 명단'], ['lock', '행사 잠금']] as const).map(([k, l]) => (
          <Button key={k} role="tab" aria-selected={tab === k} variant={tab === k ? 'primary' : 'secondary'} onClick={() => setTab(k)}>{l}</Button>
        ))}
      </div>
      {tab === 'questions' && <SchemaEditor mode="questions" />}
      {tab === 'guides' && <SchemaEditor mode="guides" />}
      {tab === 'staff' && <StaffEditor />}
      {tab === 'lock' && <LockPanel />}
    </Screen>
  )
}

function SchemaEditor({ mode }: { mode: 'questions' | 'guides' }) {
  const engine = useEngine()
  const responses = useResponses() ?? []
  const used = useMemo(() => usedAnswerKeys(responses), [responses])
  const [draft, setDraft] = useState<Draft>(() => toDraft(engine.schema.payload))
  const [baseVersion, setBaseVersion] = useState(engine.schema.version)
  const [section, setSection] = useState<SectionId>('intake')
  const [msg, setMsg] = useState<{ tone: 'red' | 'green'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const locked = engine.schema.locked
  const stale = engine.schema.version !== baseVersion

  const list = draft.sections[section]
  const setList = (fn: (l: DraftQ[]) => DraftQ[]) => setDraft((d) => ({ ...d, sections: { ...d.sections, [section]: fn(d.sections[section]) } }))
  const patch = (u: string, p: Partial<DraftQ>) => setList((l) => l.map((q) => (q._uid === u ? { ...q, ...p } : q)))

  const isProtected = (q: DraftQ) => q._orig != null && (used.has(q._orig) || (RESERVED_KEYS as readonly string[]).includes(q._orig))

  function changeKey(q: DraftQ, key: string) {
    if (isProtected(q)) {
      setMsg({ tone: 'red', text: `"${q._orig}" 문항은 이미 응답이 있거나 시스템 예약 key 라서 key 를 바꿀 수 없습니다.` })
      return
    }
    patch(q._uid, { key: key.replace(/\s/g, '_') })
  }

  function remove(q: DraftQ) {
    if (isProtected(q)) {
      setMsg({ tone: 'red', text: `"${q._orig}" 문항은 이미 응답이 있거나 시스템 예약 key 라서 삭제할 수 없습니다.` })
      return
    }
    setList((l) => l.filter((x) => x._uid !== q._uid))
  }

  function move(i: number, d: -1 | 1) {
    setList((l) => {
      const j = i + d
      if (j < 0 || j >= l.length) return l
      const c = [...l]; [c[i], c[j]] = [c[j], c[i]]; return c
    })
  }

  function add(type: QuestionType = 'single') {
    const base = type === 'divider' ? 'div' : 'q'
    let n = 1
    const all = new Set(Object.values(draft.sections).flat().map((q) => q.key))
    while (all.has(`${section}_${base}${n}`)) n++
    setList((l) => [...l, {
      _uid: uid(), _orig: null, key: `${section}_${base}${n}`, type, label: type === 'divider' ? '' : '새 문항',
      ...(type === 'single' || type === 'multi' ? { options: ['예', '아니오'] } : {}),
    }])
  }

  function duplicate(q: DraftQ) {
    const all = new Set(Object.values(draft.sections).flat().map((x) => x.key))
    let k = `${q.key}_copy`
    while (all.has(k)) k += '_'
    setList((l) => {
      const i = l.findIndex((x) => x._uid === q._uid)
      const c = [...l]; c.splice(i + 1, 0, { ...structuredClone(q), _uid: uid(), _orig: null, key: k }); return c
    })
  }

  function validate(p: SurveyPayload): string | null {
    const keys = Object.values(p.sections).flat().map((q) => q.key)
    const dupe = keys.find((k, i) => keys.indexOf(k) !== i)
    if (dupe) return `key "${dupe}" 가 중복됩니다`
    if (keys.some((k) => !/^[A-Za-z0-9_]+$/.test(k))) return 'key 는 영문·숫자·밑줄만 쓸 수 있습니다'
    const keySet = new Set(keys)
    const missingUsed = [...used].find((k) => !keySet.has(k))
    if (missingUsed) return `응답이 있는 문항 "${missingUsed}" 가 사라졌습니다. 저장할 수 없습니다`
    const missingReserved = RESERVED_KEYS.find((k) => !keySet.has(k))
    if (missingReserved) return `시스템 문항 "${missingReserved}" 가 없습니다`
    for (const q of Object.values(p.sections).flat()) {
      if ((q.type === 'single' || q.type === 'multi') && !(q.options ?? []).length) return `"${q.label}" 에 보기가 없습니다`
    }
    return null
  }

  async function save() {
    setMsg(null)
    if (locked) { setMsg({ tone: 'red', text: '행사 잠금 중에는 저장할 수 없습니다.' }); return }
    const payload = fromDraft(draft)
    const err = validate(payload)
    if (err) { setMsg({ tone: 'red', text: err }); return }
    setSaving(true)
    try {
      const s = await engine.saveSchema(payload)
      setBaseVersion(s.version)
      setDraft(toDraft(s.payload))
      setMsg({ tone: 'green', text: `저장했습니다 (v${s.version}). 접속 중인 모든 기기에 반영됩니다.` })
    } catch (e) {
      const code = e instanceof RemoteError ? e.code : ''
      const text = code === 'LOCKED' ? '행사 잠금 중이라 서버가 저장을 거부했습니다.'
        : code === 'KEY_IN_USE' ? `응답이 있는 문항 key 가 바뀌어 거부되었습니다 (${(e as Error).message}).`
        : code === 'NETWORK' ? '오프라인입니다. 설문지는 온라인에서만 저장할 수 있습니다.'
        : `저장 실패: ${(e as Error).message}`
      setMsg({ tone: 'red', text })
    } finally {
      setSaving(false)
    }
  }

  const questionKeys = Object.values(draft.sections).flat().filter((q) => q.type !== 'divider')

  return (
    <div>
      {stale && (
        <p className="mb-3 rounded-lg bg-amber-100 p-3 font-semibold">
          다른 기기에서 설문지가 v{engine.schema.version} 으로 바뀌었습니다.{' '}
          <Button onClick={() => { setDraft(toDraft(engine.schema.payload)); setBaseVersion(engine.schema.version) }}>최신본 불러오기</Button>
        </p>
      )}
      {msg && <p role="alert" data-testid="admin-msg" className={`mb-3 rounded-lg p-3 font-semibold ${msg.tone === 'red' ? 'bg-red-100 text-red-900' : 'bg-emerald-100 text-emerald-900'}`}>{msg.text}</p>}

      <fieldset disabled={locked} className="space-y-3">
        {mode === 'guides' && (['A', 'B', 'C'] as Track[]).map((t) => (
          <label key={t} className="block">
            <span className="text-lg font-bold">트랙 {t} 안내문</span>
            <textarea rows={3} value={draft.guides[t]} onChange={(e) => setDraft((d) => ({ ...d, guides: { ...d.guides, [t]: e.target.value } }))}
              className="mt-1 w-full rounded-lg border-2 border-slate-400 p-3 text-lg" />
          </label>
        ))}

        {mode === 'questions' && (
          <>
            <div className="flex gap-2">
              {SECTIONS.map((s) => (
                <Button key={s} variant={section === s ? 'primary' : 'secondary'} onClick={() => setSection(s)}>
                  {SECTION_LABEL[s]} ({draft.sections[s].filter((q) => q.type !== 'divider').length})
                </Button>
              ))}
            </div>
            <p className="text-sm text-slate-600">설문은 두 화면입니다: ① 접수 ② 트랙별 문항 + 마무리. 구분선은 화면에 가로줄로만 보입니다.</p>
            <ol className="space-y-2">
              {list.map((q, i) => (
                <li key={q._uid} className={`rounded-xl border-2 bg-white p-3 ${q.type === 'divider' ? 'border-dashed border-slate-400 bg-slate-50' : 'border-slate-300'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-8 text-center font-bold text-slate-500">{i + 1}</span>
                    <Button aria-label="위로" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
                    <Button aria-label="아래로" onClick={() => move(i, 1)} disabled={i === list.length - 1}>↓</Button>
                    <select aria-label="유형" value={q.type} onChange={(e) => patch(q._uid, { type: e.target.value as QuestionType })}
                      className="min-h-11 rounded-lg border-2 border-slate-400 px-2">
                      {Object.entries(QUESTION_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <input aria-label="key" value={q.key} onChange={(e) => changeKey(q, e.target.value)}
                      className={`min-h-11 w-44 rounded-lg border-2 px-2 font-mono ${isProtected(q) ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-slate-400'}`}
                      title={isProtected(q) ? '응답이 있거나 예약된 key 라서 바꿀 수 없습니다' : ''} />
                    {isProtected(q) && <Badge tone="amber">{used.has(q._orig!) ? '응답 있음' : '예약'}</Badge>}
                    {q.type !== 'divider' && (
                      <label className="flex items-center gap-1"><input type="checkbox" checked={!!q.required} onChange={(e) => patch(q._uid, { required: e.target.checked })} className="h-5 w-5" /> 필수</label>
                    )}
                    {q.type === 'multi' && (
                      <label className="flex items-center gap-1"><input type="checkbox" checked={!!q.gameList} onChange={(e) => patch(q._uid, { gameList: e.target.checked })} className="h-5 w-5" /> 게임 목록(카드 인쇄)</label>
                    )}
                    <span className="ml-auto flex gap-1">
                      <Button onClick={() => duplicate(q)}>복제</Button>
                      <Button variant="danger" onClick={() => remove(q)}>삭제</Button>
                    </span>
                  </div>
                  {q.type !== 'divider' && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input aria-label="문구" value={q.label} onChange={(e) => patch(q._uid, { label: e.target.value })} placeholder="문구"
                        className="min-h-11 rounded-lg border-2 border-slate-400 px-2 text-lg" />
                      <input aria-label="도움말" value={q.help ?? ''} onChange={(e) => patch(q._uid, { help: e.target.value })} placeholder="도움말"
                        className="min-h-11 rounded-lg border-2 border-slate-400 px-2" />
                      {(q.type === 'single' || q.type === 'multi') && (
                        <label className="col-span-1">
                          <span className="text-sm text-slate-600">보기 (한 줄에 하나)</span>
                          <textarea aria-label="보기" rows={Math.min(8, (q.options?.length ?? 1) + 1)} value={(q.options ?? []).join('\n')}
                            onChange={(e) => patch(q._uid, { options: e.target.value.split('\n').map((x) => x.trim()).filter((x, idx, arr) => x || idx === arr.length - 1) })}
                            onBlur={(e) => patch(q._uid, { options: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
                            className="w-full rounded-lg border-2 border-slate-400 p-2" />
                        </label>
                      )}
                      <div className="col-span-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm text-slate-600">표시 조건</span>
                        <select aria-label="표시 조건 문항" value={q.showIf?.key ?? ''} onChange={(e) => patch(q._uid, { showIf: e.target.value ? { key: e.target.value, in: q.showIf?.in ?? [] } : undefined })}
                          className="min-h-11 rounded-lg border-2 border-slate-400 px-2">
                          <option value="">항상 표시</option>
                          {questionKeys.filter((x) => x._uid !== q._uid).map((x) => <option key={x._uid} value={x.key}>{x.key}</option>)}
                        </select>
                        {q.showIf?.key && (
                          <input aria-label="표시 조건 값" value={q.showIf.in.join(', ')} placeholder="값1, 값2"
                            onChange={(e) => patch(q._uid, { showIf: { key: q.showIf!.key, in: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) } })}
                            className="min-h-11 flex-1 rounded-lg border-2 border-slate-400 px-2" />
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            <div className="flex gap-2">
              <Button onClick={() => add('single')}>+ 문항 추가</Button>
              <Button onClick={() => add('divider')}>+ 구분선</Button>
            </div>
          </>
        )}
      </fieldset>

      <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t-2 border-slate-300 bg-slate-100 py-3">
        <Button onClick={() => { setDraft(toDraft(engine.schema.payload)); setMsg(null) }}>되돌리기</Button>
        <Button variant="primary" size="lg" onClick={() => void save()} disabled={saving}>{locked ? '잠금 중 (저장 불가)' : '저장'}</Button>
      </div>
    </div>
  )
}

function StaffEditor() {
  const engine = useEngine()
  const [rows, setRows] = useState<Staff[]>(() => structuredClone(engine.staff))
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function save() {
    try {
      await engine.remote.upsertStaff(rows.map(({ id, name, active, role }) => ({ id, name, active, role })))
      await engine.pullStaff()
      setRows(structuredClone(engine.staff))
      setMsg('저장했습니다')
    } catch (e) {
      setMsg(`저장 실패: ${(e as Error).message}`)
    }
  }

  return (
    <div className="space-y-3">
      {msg && <p role="alert" className="rounded-lg bg-slate-200 p-3 font-semibold">{msg}</p>}
      <table className="w-full rounded-xl bg-white text-lg">
        <thead><tr className="border-b-2 text-left"><th className="p-2">이름</th><th>활성</th><th>권한</th><th>계정 연결</th></tr></thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={s.id} className="border-b">
              <td className="p-2"><input aria-label="담당자 이름" value={s.name} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                className="min-h-11 rounded border-2 border-slate-300 px-2" /></td>
              <td><input type="checkbox" className="h-6 w-6" checked={s.active} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} /></td>
              <td>
                <select value={s.role} onChange={(e) => setRows((r) => r.map((x, j) => (j === i ? { ...x, role: e.target.value as Staff['role'] } : x)))}
                  className="min-h-11 rounded border-2 border-slate-300 px-2">
                  <option value="operator">operator</option><option value="admin">admin</option>
                </select>
              </td>
              <td className="text-sm text-slate-600">{s.auth_user_id ? '연결됨' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-2">
        <input aria-label="새 담당자" value={name} onChange={(e) => setName(e.target.value)} placeholder="새 담당자 이름" className="min-h-11 rounded-lg border-2 border-slate-400 px-2" />
        <Button onClick={() => { if (name.trim()) { setRows((r) => [...r, { id: crypto.randomUUID(), name: name.trim(), active: true, role: 'operator', auth_user_id: null }]); setName('') } }}>추가</Button>
        <Button variant="primary" className="ml-auto" onClick={() => void save()}>담당자 저장</Button>
      </div>
    </div>
  )
}

function LockPanel() {
  const engine = useEngine()
  const locked = engine.schema.locked
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [typed, setTyped] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const PHRASE = '잠금 해제'

  async function apply(next: boolean) {
    try {
      await engine.setLocked(next)
      setMsg(next ? '잠갔습니다. 이제 아무도 설문지를 수정할 수 없습니다.' : '잠금을 해제했습니다.')
    } catch (e) {
      setMsg(`실패: ${(e as Error).message}`)
    } finally {
      setStep(0); setTyped('')
    }
  }

  return (
    <div className="rounded-xl border-2 border-slate-300 bg-white p-6">
      <p className="text-xl">현재 상태: <b data-testid="lock-state">{locked ? '잠금' : '편집 가능'}</b></p>
      <p className="mt-2 text-slate-700">행사 당일 아침에 잠그세요. 잠그면 admin 을 포함해 누구도 설문 구조를 바꿀 수 없습니다.</p>
      {msg && <p role="alert" className="mt-3 rounded bg-slate-200 p-2 font-semibold">{msg}</p>}
      <div className="mt-4">
        {locked
          ? <Button variant="danger" size="lg" onClick={() => setStep(1)}>잠금 해제…</Button>
          : <Button variant="primary" size="lg" onClick={() => setStep(1)}>행사 잠금</Button>}
      </div>

      {step >= 1 && !locked && (
        <Modal title="설문지를 잠글까요?" onClose={() => setStep(0)}>
          <p className="text-lg">잠그면 행사 중 설문 구조가 바뀌지 않습니다.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setStep(0)}>취소</Button>
            <Button variant="primary" onClick={() => void apply(true)}>잠그기</Button>
          </div>
        </Modal>
      )}
      {step === 1 && locked && (
        <Modal title="잠금을 해제할까요? (1/2)" onClose={() => setStep(0)}>
          <p className="text-lg">행사 중 설문 구조가 바뀌면 이미 입력한 데이터와 어긋날 수 있습니다.</p>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setStep(0)}>취소</Button>
            <Button variant="danger" onClick={() => setStep(2)}>계속</Button>
          </div>
        </Modal>
      )}
      {step === 2 && locked && (
        <Modal title="한 번 더 확인합니다 (2/2)" onClose={() => setStep(0)}>
          <label className="block text-lg">확인을 위해 <b>{PHRASE}</b> 라고 입력하세요
            <input aria-label="확인 문구" value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border-2 border-slate-400 px-3" autoFocus />
          </label>
          <div className="mt-6 flex justify-end gap-2">
            <Button onClick={() => setStep(0)}>취소</Button>
            <Button variant="danger" disabled={typed.trim() !== PHRASE} onClick={() => void apply(false)}>잠금 해제</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

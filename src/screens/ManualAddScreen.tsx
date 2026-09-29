import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEngine } from '../app/context'
import { Button, Screen } from '../components/ui'
import { MANUAL_REASONS, type ManualInfo, type ManualReason, type Track } from '../lib/types'

function Choice<T extends string>({ label, value, options, onChange, invalid }: {
  label: string; value: T | ''; options: readonly { v: T; label: string }[]; onChange: (v: T) => void; invalid?: boolean
}) {
  return (
    <fieldset className={`rounded-xl border-2 p-3 ${invalid ? 'border-red-600 bg-red-50' : 'border-transparent'}`}>
      <legend className="mb-1 text-lg font-bold">{label} <span className="text-red-700">*</span></legend>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(o.v)}
            className={`min-h-12 rounded-lg border-2 px-4 text-lg font-semibold ${value === o.v ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white'}`}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

export function ManualAddScreen() {
  const engine = useEngine()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState<string>('')
  const [sex, setSex] = useState<'F' | 'M' | '?' | ''>('')
  const [reason, setReason] = useState<ManualReason | ''>('')
  const [track, setTrack] = useState<Track | ''>('')
  const [tried, setTried] = useState(false)

  const errs = {
    name: !name.trim(),
    phone: !/^\d{4}$/.test(phone),
    age: !age, sex: !sex, reason: !reason, track: !track,
  }
  const valid = !Object.values(errs).some(Boolean)

  async function submit() {
    setTried(true)
    if (!valid) return
    const manual: ManualInfo = { name: name.trim(), phone_last4: phone, age_group: age, sex: sex as 'F' | 'M' | '?', reason: reason as ManualReason }
    const r = await engine.createResponse({ participant: null, manual, track: track as Track, verified: 'skipped', realName: name })
    engine.passedGate.add(r.id)
    navigate(`/r/${r.id}`)
  }

  const inputCls = (bad: boolean) => `mt-1 min-h-12 w-full rounded-lg border-2 px-3 text-xl ${tried && bad ? 'border-red-600 bg-red-50' : 'border-slate-400'}`

  return (
    <Screen>
      <div className="mb-4 flex items-center gap-3">
        <Button onClick={() => navigate('/')}>← 찾기로</Button>
        <h1 className="text-2xl font-extrabold">명단에 없는 분 추가</h1>
      </div>
      <div className="space-y-3 rounded-2xl border-2 border-slate-300 bg-white p-6">
        <div className="grid grid-cols-2 gap-4">
          <label className="block text-lg font-bold">성함 <span className="text-red-700">*</span>
            <input aria-label="성함" value={name} onChange={(e) => setName(e.target.value)} className={inputCls(errs.name)} autoFocus autoComplete="off" />
          </label>
          <label className="block text-lg font-bold">전화 뒷 4자리 <span className="text-red-700">*</span>
            <input aria-label="전화 뒷 4자리" value={phone} inputMode="numeric" maxLength={4}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 4))} className={`${inputCls(errs.phone)} font-mono tracking-widest`} autoComplete="off" />
          </label>
        </div>
        <Choice label="연령대" value={age} onChange={setAge} invalid={tried && errs.age}
          options={[{ v: '60', label: '60대' }, { v: '70', label: '70대' }, { v: '80', label: '80대' }, { v: '90', label: '90대' }, { v: '?', label: '모름' }]} />
        <Choice label="성별" value={sex} onChange={setSex} invalid={tried && errs.sex}
          options={[{ v: 'F', label: '여성' }, { v: 'M', label: '남성' }, { v: '?', label: '모름' }] as const} />
        <Choice label="명단에 없는 이유" value={reason} onChange={setReason} invalid={tried && errs.reason}
          options={MANUAL_REASONS.map((v) => ({ v, label: v }))} />
        <Choice label="맬리브레인을 요즘 쓰세요?" value={track} onChange={setTrack} invalid={tried && errs.track}
          options={[{ v: 'A', label: '최근 한 달 안에 씀' }, { v: 'B', label: '예전엔 했는데 쉬는 중' }, { v: 'C', label: '거의 안 씀' }] as const} />
      </div>
      {tried && !valid && <p className="mt-3 text-lg font-bold text-red-700" role="alert">붉게 표시된 항목을 채워 주세요</p>}
      <div className="mt-4 flex justify-end">
        <Button size="xl" variant="primary" onClick={() => void submit()}>설문 시작</Button>
      </div>
    </Screen>
  )
}

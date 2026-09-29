import { memo } from 'react'
import type { AnswerValue, Question } from '../lib/types'

interface Props {
  q: Question
  value: AnswerValue | undefined
  invalid: boolean
  staffNames: string[]
  onChange: (key: string, value: AnswerValue) => void
}

function OptionButton({ selected, multi, label, onClick }: { selected: boolean; multi: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onClick={onClick}
      className={`flex min-h-12 items-center gap-2 rounded-lg border-2 px-4 text-left text-lg font-semibold ${
        selected ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white hover:border-blue-500'
      }`}
    >
      <span aria-hidden className={`inline-block h-5 w-5 shrink-0 border-2 ${multi ? 'rounded' : 'rounded-full'} ${selected ? 'border-white bg-white/30' : 'border-slate-400'}`} />
      {label}
    </button>
  )
}

export const QuestionField = memo(function QuestionField({ q, value, invalid, staffNames, onChange }: Props) {
  const id = `q-${q.key}`
  const border = invalid ? 'border-red-600 bg-red-50' : 'border-transparent'
  let control
  if (q.type === 'single' || q.type === 'multi' || q.type === 'staff') {
    const multi = q.type !== 'single'
    const options = q.type === 'staff' ? staffNames : q.options ?? []
    const arr = Array.isArray(value) ? value : value ? [value] : []
    control = (
      <div role={multi ? 'group' : 'radiogroup'} aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <OptionButton key={o} label={o} multi={multi} selected={arr.includes(o)}
            onClick={() => {
              if (multi) onChange(q.key, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])
              else onChange(q.key, o)
            }} />
        ))}
      </div>
    )
  } else if (q.type === 'textarea') {
    control = (
      <textarea id={id} aria-labelledby={`${id}-label`} rows={3} value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(q.key, e.target.value)}
        className="w-full rounded-lg border-2 border-slate-400 p-3 text-lg" />
    )
  } else {
    control = (
      <input id={id} aria-labelledby={`${id}-label`} value={typeof value === 'string' ? value : ''} autoComplete="off"
        onChange={(e) => onChange(q.key, e.target.value)}
        className="min-h-12 w-full rounded-lg border-2 border-slate-400 px-3 text-lg" />
    )
  }

  return (
    <section data-testid={`question-${q.key}`} data-invalid={invalid || undefined} aria-invalid={invalid || undefined}
      className={`rounded-xl border-2 p-4 ${border}`}>
      <h3 id={`${id}-label`} className="mb-1 text-xl font-bold">
        {q.label}
        {q.required && <span className="ml-1 text-red-700" aria-label="필수">*</span>}
      </h3>
      {q.help && <p className="mb-3 text-base text-slate-600">{q.help}</p>}
      {control}
      {invalid && <p className="mt-2 text-base font-bold text-red-700" role="alert">필수 문항입니다</p>}
    </section>
  )
})

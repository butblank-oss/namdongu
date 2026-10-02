import { memo } from 'react'
import { ETC, etcKey } from '../lib/defaultSchema'
import { inputCls } from './ui'
import type { AnswerValue, Question } from '../lib/types'

interface Props {
  q: Question
  value: AnswerValue | undefined
  /** '기타' 직접 입력값 */
  etcValue?: string
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
      className={`flex min-h-12 items-center gap-2.5 rounded-2xl px-4 text-left text-[17px] transition-colors duration-100 ${
        selected
          ? 'bg-blue-50 font-semibold text-blue-600 ring-2 ring-inset ring-blue-500'
          : 'bg-white font-medium text-grey-800 ring-1 ring-inset ring-grey-200 hover:bg-grey-50'
      }`}
    >
      <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center ${multi ? 'rounded-md' : 'rounded-full'} ${
        selected ? 'bg-blue-500' : 'bg-white ring-2 ring-inset ring-grey-300'}`}>
        {selected && (
          <svg viewBox="0 0 16 16" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        )}
      </span>
      {label}
    </button>
  )
}

export const QuestionField = memo(function QuestionField({ q, value, etcValue, invalid, staffNames, onChange }: Props) {
  const id = `q-${q.key}`
  const border = invalid ? 'ring-2 ring-red-500' : ''
  let control
  if (q.type === 'single' || q.type === 'multi' || q.type === 'staff') {
    const multi = q.type !== 'single'
    const options = q.type === 'staff' ? staffNames : q.options ?? []
    const arr = Array.isArray(value) ? value : value ? [value] : []
    control = (
      <>
        <div role={multi ? 'group' : 'radiogroup'} aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2.5">
          {options.map((o) => (
            <OptionButton key={o} label={o} multi={multi} selected={arr.includes(o)}
              onClick={() => {
                if (multi) onChange(q.key, arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o])
                else onChange(q.key, o)
              }} />
          ))}
        </div>
        {arr.includes(ETC) && (
          <input aria-label={`${q.label} 기타 내용`} value={etcValue ?? ''} autoComplete="off" placeholder="기타 내용을 적어 주세요"
            onChange={(e) => onChange(etcKey(q.key), e.target.value)}
            className={`mt-3 ${inputCls}`} />
        )}
      </>
    )
  } else if (q.type === 'textarea') {
    control = (
      <textarea id={id} aria-labelledby={`${id}-label`} rows={3} value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(q.key, e.target.value)}
        className={`${inputCls} py-3`} />
    )
  } else {
    control = (
      <input id={id} aria-labelledby={`${id}-label`} value={typeof value === 'string' ? value : ''} autoComplete="off"
        onChange={(e) => onChange(q.key, e.target.value)}
        className={inputCls} />
    )
  }

  return (
    <section data-testid={`question-${q.key}`} data-invalid={invalid || undefined} aria-invalid={invalid || undefined}
      className={`rounded-[20px] bg-white p-6 shadow-[var(--shadow-card)] ${border}`}>
      <h3 id={`${id}-label`} className="flex flex-wrap items-center gap-2 text-[19px] font-bold leading-snug text-grey-900">
        <span>
          {q.label}
          {q.required && <span className="ml-0.5 text-blue-500" aria-label="필수">*</span>}
        </span>
        {q.type === 'multi' && <span className="rounded-md bg-grey-100 px-2 py-0.5 text-[13px] font-semibold text-grey-600">여러 개 선택</span>}
      </h3>
      {q.help && <p className="mt-1 text-[15px] leading-relaxed text-grey-500">{q.help}</p>}
      {q.notice && (
        <p data-testid={`notice-${q.key}`} className="mt-3 whitespace-pre-line rounded-2xl bg-grey-50 px-4 py-3 text-[15px] leading-relaxed text-grey-700">{q.notice}</p>
      )}
      <div className="mt-4">{control}</div>
      {invalid && <p className="mt-3 text-[15px] font-semibold text-red-500" role="alert">필수 문항입니다</p>}
    </section>
  )
})

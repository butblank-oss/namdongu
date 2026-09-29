import type { ComponentProps, ReactNode } from 'react'

/*
 * 공통 컴포넌트 — 토스 스타일
 *  primary : 파란 면 (주요 행동 1개)
 *  secondary/weak : 회색 면 (보조)
 *  tonal : 옅은 파랑 면 + 파란 글자
 *  danger : 빨강 면 / dangerWeak : 옅은 빨강
 */
type Variant = 'primary' | 'secondary' | 'white' | 'tonal' | 'danger' | 'dangerWeak' | 'ghost' | 'success'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 disabled:bg-blue-200 disabled:text-white',
  success: 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700 disabled:bg-blue-200 disabled:text-white',
  secondary: 'bg-grey-100 text-grey-700 hover:bg-grey-200 active:bg-grey-300 disabled:text-grey-400',
  /** 회색 배경 위에 놓는 보조 버튼 */
  white: 'bg-white text-grey-700 shadow-[var(--shadow-card)] ring-1 ring-inset ring-grey-200 hover:bg-grey-50 disabled:text-grey-400',
  tonal: 'bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:text-blue-200',
  danger: 'bg-red-500 text-white hover:bg-red-600 disabled:bg-red-100',
  dangerWeak: 'bg-red-50 text-red-600 hover:bg-red-100',
  ghost: 'bg-transparent text-grey-700 hover:bg-grey-100',
}

export function Button({
  variant = 'secondary', size = 'md', className = '', type = 'button', ...rest
}: ComponentProps<'button'> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sz = {
    sm: 'min-h-9 rounded-lg px-3 text-sm',
    md: 'min-h-11 rounded-xl px-4 text-base',
    lg: 'min-h-13 rounded-[14px] px-5 text-lg',
    xl: 'min-h-15 rounded-2xl px-7 text-xl',
  }[size]
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-150 disabled:cursor-not-allowed ${sz} ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  )
}

type Tone = 'slate' | 'grey' | 'blue' | 'amber' | 'orange' | 'green' | 'red' | 'violet' | 'purple'
const TONE: Record<Tone, string> = {
  slate: 'bg-grey-100 text-grey-700',
  grey: 'bg-grey-100 text-grey-700',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-orange-50 text-orange-600',
  orange: 'bg-orange-50 text-orange-600',
  green: 'bg-green-50 text-green-600',
  red: 'bg-red-50 text-red-600',
  violet: 'bg-purple-50 text-purple-600',
  purple: 'bg-purple-50 text-purple-600',
}

export function Badge({ tone = 'grey', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[13px] font-semibold ${TONE[tone]}`}>{children}</span>
}

export const TRACK_TONE = { A: 'blue', B: 'orange', C: 'purple' } as const

/** 흰 카드 (토스식: 테두리 없이 면과 라운드로 구분) */
export function Card({ children, className = '', ...rest }: ComponentProps<'div'>) {
  return <div className={`rounded-[20px] bg-white p-6 shadow-[var(--shadow-card)] ${className}`} {...rest}>{children}</div>
}

/** 칩 (필터·토글). 선택되면 옅은 파랑 면 */
export function Chip({ selected, className = '', ...rest }: ComponentProps<'button'> & { selected: boolean }) {
  return (
    <button type="button" aria-pressed={selected}
      className={`inline-flex min-h-10 items-center rounded-full px-4 text-[15px] font-semibold transition-colors ${
        selected ? 'bg-grey-900 text-white' : 'bg-white text-grey-700 hover:bg-grey-50 ring-1 ring-inset ring-grey-200'} ${className}`}
      {...rest} />
  )
}

/** 세그먼트 컨트롤 (토스 탭 스위치) */
export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: readonly { v: T; label: string }[]; onChange: (v: T) => void; label: string
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl bg-grey-200/70 p-1">
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}
          className={`min-h-9 rounded-[10px] px-4 text-[15px] font-semibold transition-all ${
            value === o.v ? 'bg-white text-grey-900 shadow-[0_1px_3px_rgba(0,29,58,0.12)]' : 'text-grey-500 hover:text-grey-700'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-grey-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose?.() }}>
      <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-[var(--shadow-pop)]">
        <h2 className="mb-3 text-xl font-bold text-grey-900">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto w-full max-w-5xl px-6 py-8 ${className}`}>{children}</main>
}

/** 화면 제목 */
export function PageTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end gap-3">
      <div>
        <h1 className="text-[26px] font-bold leading-tight text-grey-900">{children}</h1>
        {sub && <p className="mt-1 text-[15px] text-grey-500">{sub}</p>}
      </div>
      {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
    </div>
  )
}

/** 입력칸 공통 클래스 */
export const inputCls = 'min-h-12 w-full rounded-xl bg-white px-4 text-[17px] text-grey-900 ring-1 ring-inset ring-grey-200 transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-500'

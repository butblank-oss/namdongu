import type { ComponentProps, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success'
const VARIANT: Record<Variant, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 disabled:bg-slate-400',
  secondary: 'bg-white text-slate-900 border-2 border-slate-400 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-slate-400',
  success: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-slate-400',
  ghost: 'bg-transparent text-slate-800 hover:bg-slate-200',
}

export function Button({
  variant = 'secondary', size = 'md', className = '', type = 'button', ...rest
}: ComponentProps<'button'> & { variant?: Variant; size?: 'md' | 'lg' | 'xl' }) {
  const sz = size === 'xl' ? 'min-h-16 px-8 text-2xl' : size === 'lg' ? 'min-h-14 px-6 text-xl' : 'min-h-11 px-4 text-base'
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${sz} ${VARIANT[variant]} ${className}`}
      {...rest}
    />
  )
}

export function Badge({ tone = 'slate', children }: { tone?: 'slate' | 'blue' | 'amber' | 'green' | 'red' | 'violet'; children: ReactNode }) {
  const t = {
    slate: 'bg-slate-200 text-slate-800',
    blue: 'bg-blue-100 text-blue-900',
    amber: 'bg-amber-100 text-amber-900',
    green: 'bg-emerald-100 text-emerald-900',
    red: 'bg-red-100 text-red-900',
    violet: 'bg-violet-100 text-violet-900',
  }[tone]
  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-sm font-semibold ${t}`}>{children}</span>
}

export const TRACK_TONE = { A: 'blue', B: 'amber', C: 'violet' } as const

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose?.() }}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <h2 className="mb-4 text-xl font-bold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`mx-auto w-full max-w-5xl px-6 py-6 ${className}`}>{children}</main>
}

import type { ReactNode } from 'react'
import { GamepadIcon } from './Icons'

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-600 px-6 py-16 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-ink-800 text-slate-500"><GamepadIcon size={28} /></span>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children && <div className="mt-1 max-w-md text-sm text-slate-400">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

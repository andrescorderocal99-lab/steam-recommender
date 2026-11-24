import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')
export { cx }

export function Chip({ active, onClick, children, title, count }: {
  active: boolean
  onClick: () => void
  children: ReactNode
  title?: string
  count?: number
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:px-4',
        active
          ? 'border-value/60 bg-value/15 text-value'
          : 'border-ink-600 bg-ink-800 text-slate-300 hover:border-ink-500 hover:text-white',
      )}
    >
      {children}
      {count != null && <span className={cx('text-xs tabular-nums', active ? 'text-value/80' : 'text-slate-500')}>{count}</span>}
    </button>
  )
}

export function Switch({ checked, onChange, label, hint }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 py-1">
      <span className="min-w-0">
        <span className="block text-sm text-slate-200">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-ink-600 transition-colors peer-checked:bg-value-strong peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-value" />
        <span className="pointer-events-none absolute top-1 left-1 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

export function Segmented<T extends string>({ options, value, onChange, label, size = 'md' }: {
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-ink-600 bg-ink-850 p-1">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={cx(
              'rounded-lg px-2 font-semibold whitespace-nowrap transition-colors',
              size === 'sm' ? 'min-h-9 text-xs pointer-coarse:min-h-11' : 'min-h-10 text-sm pointer-coarse:min-h-11',
              active ? 'bg-value-strong text-ink-950 shadow' : 'text-slate-400 hover:bg-ink-700 hover:text-white',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function FilterSection({ title, value, children, onClear }: {
  title: string
  value?: ReactNode
  children: ReactNode
  onClear?: () => void
}) {
  const { t } = useI18n()
  return (
    <section className="border-b border-ink-700 py-4 last:border-b-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">{title}</h3>
        <div className="flex items-baseline gap-2">
          {value != null && <span className="text-sm font-semibold text-white tabular-nums">{value}</span>}
          {onClear && (
            <button type="button" onClick={onClear} className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">
              {t.common.remove}
            </button>
          )}
        </div>
      </div>
      {children}
    </section>
  )
}

const pct = (v: number, min: number, max: number) => ((v - min) / (max - min)) * 100

/** Slider de rango doble, táctil (pulgares de 26px dentro de un área de 44px). */
export function RangeSlider({ min, max, step, value, onChange, labels }: {
  min: number
  max: number
  step: number
  value: [number, number]
  onChange: (v: [number, number]) => void
  labels: [string, string]
}) {
  const [lo, hi] = value
  // Si ambos pulgares quedan en el extremo derecho, el inferior debe quedar encima para poder moverlo.
  const loOnTop = lo > max - (max - min) * 0.1
  return (
    <div className="relative h-11">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-600" />
      <div
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-value-strong"
        style={{ left: `${pct(lo, min, max)}%`, right: `${100 - pct(hi, min, max)}%` }}
      />
      <input
        type="range" className="range-input" aria-label={labels[0]}
        min={min} max={max} step={step} value={lo}
        style={{ zIndex: loOnTop ? 4 : 3 }}
        onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
      />
      <input
        type="range" className="range-input" aria-label={labels[1]}
        min={min} max={max} step={step} value={hi}
        style={{ zIndex: 3 }}
        onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
      />
    </div>
  )
}

export function Slider({ min, max, step, value, onChange, label }: {
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
  label: string
}) {
  return (
    <div className="relative h-11">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink-600" />
      <div className="absolute top-1/2 left-0 h-1.5 -translate-y-1/2 rounded-full bg-value-strong" style={{ width: `${pct(value, min, max)}%` }} />
      <input
        type="range" className="range-input" aria-label={label}
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

import type { DurationMode, Game } from '../types/game'
import { DURATION_MODES } from '../types/game'
import { formatEph, formatHours } from '../utils/format'
import { useI18n } from '../i18n'
import { cx } from './ui'

/** Comparativa de los 3 tiempos de HowLongToBeat con su coste por hora. Pulsar una fila cambia el modo. */
export function HltbBreakdown({ game, mode, onModeChange }: {
  game: Game
  mode: DurationMode
  onModeChange: (m: DurationMode) => void
}) {
  const { t } = useI18n()
  const max = Math.max(...DURATION_MODES.map((m) => game.hltb[m.id] ?? 0), 1)
  const hasAny = DURATION_MODES.some((m) => game.hltb[m.id] != null)

  if (!hasAny) {
    return <p className="rounded-xl bg-ink-800 p-4 text-sm text-slate-400">{t.detail.noHltb}</p>
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {DURATION_MODES.map((m) => {
        const hours = game.hltb[m.id]
        const active = m.id === mode
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onModeChange(m.id)}
              aria-pressed={active}
              className={cx(
                'w-full rounded-xl border p-3 text-left transition-colors',
                active ? 'border-value/50 bg-value/10' : 'border-ink-700 bg-ink-800 hover:border-ink-500',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className={cx('text-sm font-semibold', active ? 'text-value' : 'text-slate-300')}>{t.modes[m.id].label}</span>
                <span className="text-sm text-slate-400 tabular-nums">{formatHours(hours)}</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-600">
                  <div
                    className={cx('h-full rounded-full transition-all duration-500', active ? 'bg-value-strong' : 'bg-slate-500')}
                    style={{ width: `${((hours ?? 0) / max) * 100}%` }}
                  />
                </div>
                <span className={cx('w-24 text-right text-sm font-bold tabular-nums', active ? 'text-white' : 'text-slate-300')}>
                  {formatEph(game.eurPerHour[m.id])}
                </span>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

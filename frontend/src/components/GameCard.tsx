import { memo, useState } from 'react'
import type { DurationMode, Game } from '../types/game'
import { DURATION_MODES } from '../types/game'
import { ephTone, formatCount, formatEph, formatHours, formatPrice, ratingTone, releaseYear } from '../utils/format'
import { prefetchGameDetail } from '../services/gamesService'
import { ClockIcon, GamepadIcon, HeartIcon, PlayIcon, ThumbIcon } from './Icons'
import { cx } from './ui'

const TONE_CLASSES: Record<ReturnType<typeof ephTone>, string> = {
  great: 'bg-value/15 text-value ring-value/40',
  good: 'bg-emerald-400/10 text-emerald-200 ring-emerald-300/25',
  ok: 'bg-amber-400/10 text-amber-200 ring-amber-300/25',
  poor: 'bg-rose-400/10 text-rose-200 ring-rose-300/25',
  none: 'bg-ink-700 text-slate-400 ring-ink-600',
}

export function EphBadge({ eph, hours, size = 'md' }: { eph: number | null; hours: number | null; size?: 'md' | 'lg' }) {
  return (
    <div className={cx('inline-flex items-center gap-2 rounded-lg ring-1 ring-inset', TONE_CLASSES[ephTone(eph)],
      size === 'lg' ? 'px-3 py-2' : 'px-2.5 py-1.5')}>
      <span className={cx('font-extrabold tabular-nums leading-none', size === 'lg' ? 'text-xl' : 'text-base')}>{formatEph(eph)}</span>
      <span className="flex items-center gap-1 text-xs font-medium opacity-80 tabular-nums">
        <ClockIcon size={13} />{formatHours(hours)}
      </span>
    </div>
  )
}

export function PriceTag({ game, size = 'md' }: { game: Game; size?: 'md' | 'lg' }) {
  const onSale = game.discount > 0 && game.priceInitial != null
  return (
    <div className="flex flex-col items-end leading-tight">
      {onSale && (
        <span className="text-xs text-slate-500 line-through tabular-nums">{formatPrice(game.priceInitial)}</span>
      )}
      <span className={cx('font-bold tabular-nums', size === 'lg' ? 'text-2xl' : 'text-lg', onSale ? 'text-white' : 'text-slate-100')}>
        {formatPrice(game.price, game.isFree)}
      </span>
    </div>
  )
}

interface GameCardProps {
  game: Game
  mode: DurationMode
  favorite: boolean
  onOpen: (id: number) => void
  onToggleFavorite: (id: number) => void
}

export const GameCard = memo(function GameCard({ game, mode, favorite, onOpen, onToggleFavorite }: GameCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const year = releaseYear(game.releaseDate)

  return (
    <article
      className="group relative flex w-full flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-850 transition duration-200 hover:-translate-y-0.5 hover:border-ink-500 hover:shadow-xl hover:shadow-black/40"
      onPointerEnter={() => prefetchGameDetail(game.id)}
    >
      <div className="relative aspect-[460/215] overflow-hidden bg-ink-800">
        {game.header && !imgFailed ? (
          <img
            src={game.header}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-ink-500"><GamepadIcon size={40} /></div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-ink-850/90 to-transparent" />
        {game.discount > 0 && (
          <span className="absolute top-2 left-2 rounded-md bg-rose-500 px-2 py-0.5 text-sm font-extrabold text-white shadow tabular-nums">
            −{game.discount}%
          </span>
        )}
        {game.hasVideo && (
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">
            <PlayIcon size={11} /> Tráiler
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <div className="min-w-0">
          {/* Una sola línea: todas las tarjetas miden igual y la fila de precios queda alineada.
              El nombre completo aparece en el tooltip nativo (title). */}
          <h3 className="text-[15px] leading-snug font-semibold text-white" title={game.name}>
            {/* El botón cubre toda la tarjeta; el de favorito queda por encima. */}
            <button type="button" onClick={() => onOpen(game.id)} className="block w-full truncate text-left after:absolute after:inset-0 after:z-[1] after:content-[''] focus-visible:outline-none after:focus-visible:rounded-2xl after:focus-visible:ring-2 after:focus-visible:ring-value">
              {game.name}
            </button>
          </h3>
          <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-slate-500">
            {game.rating != null && (
              <span className={cx('flex items-center gap-0.5 font-semibold', ratingTone(game.rating))} title={`${game.ratingText ?? ''} · ${game.ratingCount ?? 0} reseñas`}>
                <ThumbIcon size={12} />{game.rating}%
                {game.ratingCount ? <span className="font-normal text-slate-500">({formatCount(game.ratingCount)})</span> : null}
              </span>
            )}
            {year && <span>· {year}</span>}
            {game.genres[0] && <span className="truncate">· {game.genres.slice(0, 2).join(', ')}</span>}
          </p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2">
          <EphBadge eph={game.eurPerHour[mode]} hours={game.hltb[mode]} />
          <PriceTag game={game} />
        </div>

        <dl className="grid grid-cols-3 gap-1 rounded-lg bg-ink-800/80 p-1 text-center">
          {DURATION_MODES.map((m) => (
            <div key={m.id} className={cx('rounded-md px-1 py-1', m.id === mode && 'bg-ink-700')}>
              <dt className={cx('text-[10px] font-semibold tracking-wide uppercase', m.id === mode ? 'text-value' : 'text-slate-500')}>{m.short}</dt>
              <dd className={cx('text-xs font-semibold tabular-nums', m.id === mode ? 'text-white' : 'text-slate-400')}>{formatHours(game.hltb[m.id])}</dd>
            </div>
          ))}
        </dl>
      </div>

      <button
        type="button"
        onClick={() => onToggleFavorite(game.id)}
        aria-pressed={favorite}
        aria-label={favorite ? `Quitar ${game.name} de favoritos` : `Añadir ${game.name} a favoritos`}
        className={cx(
          'absolute top-1 right-1 z-[2] flex size-11 items-center justify-center rounded-full transition',
          favorite ? 'text-rose-400' : 'text-white/80 opacity-100 hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100',
        )}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-black/50 backdrop-blur">
          <HeartIcon size={17} filled={favorite} />
        </span>
      </button>
    </article>
  )
})

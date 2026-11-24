import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useEscape, useScrollLock } from '../hooks/useScrollLock'
import { fetchGameDetail } from '../services/gamesService'
import type { DurationMode, Game, GameDetail } from '../types/game'
import { DURATION_MODES } from '../types/game'
import { formatCount, ratingTone } from '../utils/format'
import { hltbUrl, openExternalUrl, steamStoreUrl } from '../utils/platform'
import { EphBadge, PriceTag } from './GameCard'
import { HltbBreakdown } from './HltbBreakdown'
import { ExternalIcon, HeartIcon, RefreshIcon, ThumbIcon, XIcon } from './Icons'
import { MediaGallery } from './MediaGallery'
import { cx } from './ui'

/* ------------------------------------------------------------------------------------------ */
/* Carcasa común: overlay, cabecera fija, scroll interno, foco, Escape y bloqueo de scroll.    */
/* ------------------------------------------------------------------------------------------ */

function DetailShell({ title, onClose, headerAction, scrollKey, children }: {
  title: ReactNode
  onClose: () => void
  headerAction?: ReactNode
  /** Cambia al abrir otro juego: devuelve el scroll interno arriba. */
  scrollKey?: number
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  useScrollLock(true)
  useEscape(true, onClose)

  // Foco al abrir y devolución del foco al cerrar (accesibilidad de diálogos).
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus({ preventScroll: true })
    return () => previous?.focus?.({ preventScroll: true })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [scrollKey])

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-stretch justify-center bg-black/75 backdrop-blur-sm sm:items-start sm:p-6 lg:p-10" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-detail-title"
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-6xl animate-pop-in flex-col overflow-hidden bg-ink-900 shadow-2xl shadow-black outline-none sm:max-h-full sm:rounded-2xl sm:border sm:border-ink-700"
      >
        <header className="z-10 flex items-center gap-2 border-b border-ink-700 bg-ink-900/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur sm:px-3">
          <button type="button" onClick={onClose} aria-label="Cerrar" className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-ink-700 hover:text-white">
            <XIcon />
          </button>
          <h2 id="game-detail-title" className="min-w-0 flex-1 truncate text-base font-bold text-white sm:text-lg">{title}</h2>
          {headerAction}
        </header>
        <div ref={scrollRef} className="thin-scrollbar relative flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </div>
  )
}

const Bone = ({ className }: { className: string }) => <div className={cx('shimmer rounded', className)} aria-hidden />

/** Skeleton del bloque de media (escenario 16:9 + tira de miniaturas). */
function MediaSkeleton({ backdrop }: { backdrop?: string | null }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-ink-800">
        {backdrop && <img src={backdrop} alt="" className="size-full scale-105 object-cover opacity-30 blur-md" />}
        <div className="shimmer absolute inset-0 opacity-60" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => <Bone key={i} className="aspect-video h-14 shrink-0 rounded-lg sm:h-16" />)}
      </div>
    </div>
  )
}

function DescriptionSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      <Bone className="h-4 w-full" />
      <Bone className="h-4 w-11/12" />
      <Bone className="h-4 w-2/3" />
    </div>
  )
}

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="text-xs font-bold tracking-wider text-slate-400 uppercase">{children}</h3>
)

/** Detalle completo en esqueleto: enlace directo a #/app/{id} mientras llega el catálogo. */
export function GameDetailLoading({ onClose }: { onClose: () => void }) {
  return (
    <DetailShell title={<Bone className="h-5 w-48" />} onClose={onClose}>
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true" aria-label="Cargando juego">
        <div className="flex min-w-0 flex-col gap-5">
          <MediaSkeleton />
          <div className="space-y-2"><SectionTitle>Descripción</SectionTitle><DescriptionSkeleton /></div>
        </div>
        <aside className="flex flex-col gap-5">
          <div className="space-y-4 rounded-2xl border border-ink-700 bg-ink-850 p-4">
            <div className="flex justify-between"><Bone className="h-11 w-36 rounded-lg" /><Bone className="h-9 w-20" /></div>
            <Bone className="h-12 w-full rounded-xl" />
          </div>
          <div className="space-y-1.5">
            {[0, 1, 2].map((i) => <Bone key={i} className="h-[74px] w-full rounded-xl" />)}
          </div>
          <Bone className="h-36 w-full rounded-2xl" />
        </aside>
      </div>
    </DetailShell>
  )
}

/* ------------------------------------------------------------------------------------------ */

interface Props {
  game: Game
  mode: DurationMode
  favorite: boolean
  onClose: () => void
  onToggleFavorite: (id: number) => void
  onModeChange: (m: DurationMode) => void
}

/**
 * Los datos del índice (precio, €/h, tiempos, valoración) se pintan al instante; solo la parte
 * pesada (media, descripción, editor) espera a details/{id}.json, con su propio skeleton.
 */
export function GameDetailModal({ game, mode, favorite, onClose, onToggleFavorite, onModeChange }: Props) {
  const [detail, setDetail] = useState<GameDetail | null>(null)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    setDetail(null)
    setError(false)
    fetchGameDetail(game.id)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setError(true))
    return () => { alive = false }
  }, [game.id, attempt])

  const openSteam = useCallback(() => void openExternalUrl(steamStoreUrl(game.id)), [game.id])
  const modeLabel = DURATION_MODES.find((m) => m.id === mode)!.label

  const favoriteButton = (
    <button
      type="button"
      onClick={() => onToggleFavorite(game.id)}
      aria-pressed={favorite}
      aria-label={favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
      className={cx('flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-ink-700', favorite ? 'text-rose-400' : 'text-slate-300 hover:text-white')}
    >
      <HeartIcon filled={favorite} />
    </button>
  )

  return (
    <DetailShell title={game.name} onClose={onClose} headerAction={favoriteButton} scrollKey={game.id}>
      {detail?.background && (
        <img src={detail.background} alt="" aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-96 w-full animate-fade-in object-cover opacity-15 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      )}

      <div className="relative grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Columna principal: media + descripción */}
        <div className="flex min-w-0 flex-col gap-5">
          {detail ? (
            <MediaGallery movies={detail.movies} screenshots={detail.screenshots} fallbackImage={game.header} title={game.name} />
          ) : error ? (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-xl bg-ink-800 p-6 text-center">
              <p className="text-sm text-slate-400">No se pudieron cargar los vídeos y capturas.</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="flex min-h-11 items-center gap-2 rounded-xl bg-ink-700 px-4 text-sm font-semibold text-white hover:bg-ink-600">
                <RefreshIcon size={16} /> Reintentar
              </button>
            </div>
          ) : (
            <MediaSkeleton backdrop={game.header} />
          )}

          <section className="space-y-2">
            <SectionTitle>Descripción</SectionTitle>
            {detail ? (
              <p className="leading-relaxed text-slate-300">{detail.shortDescription || 'Sin descripción disponible.'}</p>
            ) : !error && <DescriptionSkeleton />}
          </section>

          {game.genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {game.genres.map((g) => <span key={g} className="rounded-full border border-ink-600 bg-ink-800 px-3 py-1 text-xs font-medium text-slate-300">{g}</span>)}
            </div>
          )}
        </div>

        {/* Columna lateral: precio, valor y datos */}
        <aside className="flex flex-col gap-5">
          <div className="rounded-2xl border border-ink-700 bg-ink-850 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">{modeLabel}</p>
                <div className="mt-1"><EphBadge eph={game.eurPerHour[mode]} hours={game.hltb[mode]} size="lg" /></div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {game.discount > 0 && <span className="rounded-md bg-rose-500 px-2 py-0.5 text-sm font-extrabold text-white tabular-nums">−{game.discount}%</span>}
                <PriceTag game={game} size="lg" />
              </div>
            </div>
            <button
              type="button"
              onClick={openSteam}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-value-strong px-4 font-bold text-ink-950 transition hover:bg-value active:scale-[0.99]"
            >
              Ver en Steam <ExternalIcon size={18} />
            </button>
            {game.priceUpdatedAt && (
              <p className="mt-2 text-center text-[11px] text-slate-500">
                Precio actualizado el {new Date(game.priceUpdatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <SectionTitle>Duración y coste por hora</SectionTitle>
              {detail?.hltbId && (
                <button type="button" onClick={() => void openExternalUrl(hltbUrl(detail.hltbId!))} className="text-xs text-slate-500 hover:text-slate-300 hover:underline">
                  HowLongToBeat ↗
                </button>
              )}
            </div>
            <HltbBreakdown game={game} mode={mode} onModeChange={onModeChange} />
          </section>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-ink-700 bg-ink-850 p-4 text-sm">
            {game.rating != null && (
              <Row label="Valoración">
                <span className={cx('inline-flex items-center gap-1 font-semibold', ratingTone(game.rating))}>
                  <ThumbIcon size={14} /> {game.rating}%
                </span>
                <span className="text-slate-500"> · {game.ratingText}{game.ratingCount ? ` (${formatCount(game.ratingCount)})` : ''}</span>
              </Row>
            )}
            {game.metacritic != null && <Row label="Metacritic">{game.metacritic}</Row>}
            <Row label="Desarrollador">{detail?.developers.join(', ') || game.developer || '—'}</Row>
            <Row label="Editor">
              {detail ? (detail.publishers.join(', ') || '—') : error ? '—' : <Bone className="mt-0.5 h-4 w-28" />}
            </Row>
            <Row label="Lanzamiento">
              {game.releaseDate && game.releaseDate.length === 10
                ? new Date(game.releaseDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
                : detail?.releaseDateRaw || game.releaseDate || '—'}
            </Row>
          </dl>
        </aside>
      </div>
    </DetailShell>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 text-slate-200">{children}</dd>
    </>
  )
}

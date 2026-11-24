import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { activeAffiliates, affiliateSearchUrl } from '../config/monetization'
import { useEscape, useScrollLock } from '../hooks/useScrollLock'
import { useI18n } from '../i18n'
import { fetchGameDetail } from '../services/gamesService'
import type { DurationMode, Game, GameDetail } from '../types/game'
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
  const { t } = useI18n()
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
          <button type="button" onClick={onClose} aria-label={t.common.close} className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-300 hover:bg-ink-700 hover:text-white">
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
  const { t } = useI18n()
  return (
    <DetailShell title={<Bone className="h-5 w-48" />} onClose={onClose}>
      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_340px]" aria-busy="true" aria-label={t.detail.loadingGame}>
        <div className="flex min-w-0 flex-col gap-5">
          <MediaSkeleton />
          <div className="space-y-2"><SectionTitle>{t.detail.description}</SectionTitle><DescriptionSkeleton /></div>
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
  const { t, lang, locale } = useI18n()
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
  const modeLabel = t.modes[mode].label

  const favoriteButton = (
    <button
      type="button"
      onClick={() => onToggleFavorite(game.id)}
      aria-pressed={favorite}
      aria-label={favorite ? t.detail.removeFavorite : t.detail.addFavorite}
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
              <p className="text-sm text-slate-400">{t.detail.mediaError}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="flex min-h-11 items-center gap-2 rounded-xl bg-ink-700 px-4 text-sm font-semibold text-white hover:bg-ink-600">
                <RefreshIcon size={16} /> {t.common.retry}
              </button>
            </div>
          ) : (
            <MediaSkeleton backdrop={game.header} />
          )}

          <section className="space-y-2">
            <SectionTitle>{t.detail.description}</SectionTitle>
            {detail ? (
              <p className="leading-relaxed text-slate-300">{detail.shortDescription || t.detail.noDescription}</p>
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
              data-umami-event="click-steam"
              data-umami-event-game={game.name}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-value-strong px-4 font-bold text-ink-950 transition hover:bg-value active:scale-[0.99]"
            >
              {t.detail.viewOnSteam} <ExternalIcon size={18} />
            </button>
            {activeAffiliates.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-slate-500">{t.detail.cheaperKey}</p>
                <div className="flex flex-wrap gap-2">
                  {activeAffiliates.map((store) => (
                    <button
                      key={store.key}
                      type="button"
                      onClick={() => void openExternalUrl(affiliateSearchUrl(store, game.name, lang))}
                      data-umami-event={`click-${store.key}`}
                      data-umami-event-game={game.name}
                      className="flex min-h-11 min-w-0 flex-1 basis-32 items-center justify-center gap-1.5 rounded-xl border border-ink-600 bg-ink-800 px-3 text-sm font-semibold text-slate-200 transition hover:border-ink-500 hover:bg-ink-700 hover:text-white active:scale-[0.99]"
                    >
                      <span className="truncate">{store.name}</span> <ExternalIcon size={14} className="shrink-0 text-slate-400" />
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-center text-[11px] text-slate-600">{t.detail.affiliateNote}</p>
              </div>
            )}
            {game.priceUpdatedAt && (
              <p className="mt-2 text-center text-[11px] text-slate-500">
                {t.detail.priceUpdated(new Date(game.priceUpdatedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}
              </p>
            )}
          </div>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <SectionTitle>{t.detail.durationTitle}</SectionTitle>
              {detail?.hltbId && (
                <button type="button" onClick={() => void openExternalUrl(hltbUrl(detail.hltbId!))} data-umami-event="click-hltb" className="text-xs text-slate-500 hover:text-slate-300 hover:underline">
                  HowLongToBeat ↗
                </button>
              )}
            </div>
            <HltbBreakdown game={game} mode={mode} onModeChange={onModeChange} />
          </section>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-2xl border border-ink-700 bg-ink-850 p-4 text-sm">
            {game.rating != null && (
              <Row label={t.detail.rating}>
                <span className={cx('inline-flex items-center gap-1 font-semibold', ratingTone(game.rating))}>
                  <ThumbIcon size={14} /> {game.rating}%
                </span>
                <span className="text-slate-500"> · {game.ratingText}{game.ratingCount ? ` (${formatCount(game.ratingCount)})` : ''}</span>
              </Row>
            )}
            {game.metacritic != null && <Row label="Metacritic">{game.metacritic}</Row>}
            <Row label={t.detail.developer}>{detail?.developers.join(', ') || game.developer || '—'}</Row>
            <Row label={t.detail.publisher}>
              {detail ? (detail.publishers.join(', ') || '—') : error ? '—' : <Bone className="mt-0.5 h-4 w-28" />}
            </Row>
            <Row label={t.detail.release}>
              {game.releaseDate && game.releaseDate.length === 10
                ? new Date(game.releaseDate).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
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

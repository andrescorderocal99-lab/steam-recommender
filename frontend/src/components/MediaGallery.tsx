import { useEffect, useRef, useState } from 'react'
import type { Movie, Screenshot } from '../types/game'
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon, PlayIcon } from './Icons'
import { TrailerPlayer } from './TrailerPlayer'
import { cx } from './ui'

type Item = { kind: 'movie'; movie: Movie } | { kind: 'shot'; shot: Screenshot }

/**
 * Escenario principal + tira de miniaturas. Los tráileres van primero; si no hay ninguno
 * (o falla la reproducción), se muestra directamente la galería de capturas.
 */
export function MediaGallery({ movies, screenshots, fallbackImage, title }: {
  movies: Movie[]
  screenshots: Screenshot[]
  fallbackImage: string | null
  title: string
}) {
  const items: Item[] = [
    ...movies.map((movie) => ({ kind: 'movie' as const, movie })),
    ...screenshots.map((shot) => ({ kind: 'shot' as const, shot })),
  ]
  const [index, setIndex] = useState(0)
  const [userStarted, setUserStarted] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)
  const touchX = useRef<number | null>(null)

  const count = items.length
  const current = items[Math.min(index, count - 1)]
  const go = (delta: number) => {
    setUserStarted(true)
    setIndex((i) => (i + delta + count) % count)
  }

  // Mantén visible la miniatura activa.
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>(`[data-idx="${index}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [index])

  // Flechas del teclado (sin interferir con el seek del vídeo ni con campos de texto).
  useEffect(() => {
    if (count < 2) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('video, input, textarea, select')) return
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (count === 0) {
    return (
      <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-ink-800">
        {fallbackImage ? <img src={fallbackImage} alt="" className="size-full object-cover" /> : <ImageIcon size={40} className="text-ink-500" />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative aspect-video overflow-hidden rounded-xl bg-black"
        onTouchStart={(e) => { if (current.kind === 'shot') touchX.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
        }}
      >
        {current.kind === 'movie' ? (
          <TrailerPlayer
            movie={current.movie}
            autoPlay={userStarted}
            onUnavailable={() => {
              // Si el tráiler no se puede reproducir y no hubo interacción, salta a las capturas.
              if (!userStarted && screenshots.length) setIndex(movies.length)
            }}
          />
        ) : (
          <img
            key={current.shot.full}
            src={current.shot.full}
            alt={`Captura de ${title}`}
            className="size-full animate-fade-in object-contain"
            decoding="async"
          />
        )}
        {count > 1 && current.kind === 'shot' && (
          <>
            <NavButton side="left" onClick={() => go(-1)} />
            <NavButton side="right" onClick={() => go(1)} />
          </>
        )}
        <span className="pointer-events-none absolute top-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-xs font-semibold text-slate-200 tabular-nums backdrop-blur">
          {index + 1} / {count}
        </span>
      </div>

      {count > 1 && (
        <div ref={stripRef} className="no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 py-1" role="tablist" aria-label="Tráileres y capturas">
          {items.map((it, i) => {
            const thumb = it.kind === 'movie' ? it.movie.thumbnail : it.shot.thumb
            const label = it.kind === 'movie' ? (it.movie.name ?? `Tráiler ${i + 1}`) : `Captura ${i - movies.length + 1}`
            return (
              <button
                key={i}
                type="button"
                role="tab"
                data-idx={i}
                aria-selected={i === index}
                aria-label={label}
                title={label}
                onClick={() => { setUserStarted(true); setIndex(i) }}
                className={cx(
                  'relative aspect-video h-14 shrink-0 snap-start overflow-hidden rounded-lg bg-ink-800 ring-2 transition sm:h-16',
                  i === index ? 'ring-value' : 'opacity-60 ring-transparent hover:opacity-100',
                )}
              >
                {thumb && <img src={thumb} alt="" loading="lazy" className="size-full object-cover" />}
                {it.kind === 'movie' && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <span className="flex size-7 items-center justify-center rounded-full bg-black/70 text-white"><PlayIcon size={13} /></span>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Anterior' : 'Siguiente'}
      className={cx(
        'absolute top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/80',
        side === 'left' ? 'left-2' : 'right-2',
      )}
    >
      {side === 'left' ? <ChevronLeftIcon /> : <ChevronRightIcon />}
    </button>
  )
}

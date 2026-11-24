import { useWindowVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DurationMode, Game } from '../types/game'
import { GameCard } from './GameCard'

/** Separación entre tarjetas (px). Debe coincidir con el gap del grid de filas. */
const GAP = 16
/** Ancho mínimo de tarjeta: decide cuántas columnas caben en el contenedor. */
const MIN_CARD_WIDTH = 280
const MAX_COLUMNS = 4
/** Alto aproximado del cuerpo de la tarjeta (bajo la portada), para la estimación inicial. */
const CARD_BODY_HEIGHT = 184

export function columnsFor(width: number): number {
  if (width <= 0) return 1
  return Math.max(1, Math.min(MAX_COLUMNS, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP))))
}

/** Observa el ancho del contenedor y su desplazamiento respecto al inicio del documento. */
function useContainerGeometry(ref: RefObject<HTMLDivElement | null>) {
  const [geo, setGeo] = useState({ width: 0, offsetTop: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const next = { width: rect.width, offsetTop: rect.top + window.scrollY }
      setGeo((prev) => (prev.width === next.width && prev.offsetTop === next.offsetTop ? prev : next))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Lo que hay encima del grid (banner sin conexión, barra de resultados) puede cambiar de alto.
    if (el.parentElement) ro.observe(el.parentElement)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref])
  return geo
}

/**
 * Grid virtualizado por filas sobre el scroll de la ventana: solo existen en el DOM las filas
 * visibles (+ overscan), así que 5.000 juegos cuestan lo mismo que 50. Al usar el scroll nativo
 * de la página, abrir y cerrar el detalle conserva la posición exacta.
 */
export function GameGrid({ games, mode, favorites, onOpen, onToggleFavorite }: {
  games: Game[]
  mode: DurationMode
  favorites: ReadonlySet<number>
  onOpen: (id: number) => void
  onToggleFavorite: (id: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { width, offsetTop } = useContainerGeometry(containerRef)
  const columns = columnsFor(width)
  const cardWidth = width > 0 ? (width - GAP * (columns - 1)) / columns : 320
  const estimate = Math.round(cardWidth * (215 / 460) + CARD_BODY_HEIGHT)
  const rowCount = Math.ceil(games.length / columns)

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => estimate,
    overscan: 3,
    gap: GAP,
    scrollMargin: offsetTop,
  })

  // Al cambiar el nº de columnas o el ancho, las alturas medidas dejan de valer.
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [virtualizer, columns, estimate])

  const items = virtualizer.getVirtualItems()

  return (
    <div ref={containerRef} role="list" aria-label="Juegos" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {width > 0 && items.map((row) => {
        const start = row.index * columns
        const rowGames = games.slice(start, start + columns)
        return (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 grid w-full"
            style={{
              gap: GAP,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              transform: `translateY(${row.start - virtualizer.options.scrollMargin}px)`,
            }}
          >
            {rowGames.map((g) => (
              <div key={g.id} role="listitem" className="flex min-w-0">
                <GameCard game={g} mode={mode} favorite={favorites.has(g.id)} onOpen={onOpen} onToggleFavorite={onToggleFavorite} />
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

/** Skeleton con la misma geometría que las tarjetas reales (sin saltos al llegar los datos). */
export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]"
      aria-busy="true"
      aria-label="Cargando catálogo"
    >
      {Array.from({ length: count }, (_, i) => <CardSkeleton key={i} />)}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-850" aria-hidden>
      <div className="shimmer aspect-[460/215]" />
      <div className="flex flex-col gap-3 p-3.5">
        <div className="shimmer h-5 w-3/4 rounded" />
        <div className="shimmer h-3.5 w-1/2 rounded" />
        <div className="mt-1 flex items-end justify-between">
          <div className="shimmer h-9 w-32 rounded-lg" />
          <div className="shimmer h-7 w-16 rounded" />
        </div>
        <div className="shimmer h-11 rounded-lg" />
      </div>
    </div>
  )
}

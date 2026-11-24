import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from './components/EmptyState'
import { FilterDrawer } from './components/FilterDrawer'
import { FilterPanel } from './components/FilterPanel'
import { GameDetailLoading, GameDetailModal } from './components/GameDetailModal'
import { GameGrid, GridSkeleton } from './components/GameGrid'
import { ChevronDownIcon, RefreshIcon, SearchIcon, SlidersIcon, XIcon } from './components/Icons'
import { Segmented } from './components/ui'
import { useCatalog } from './hooks/useCatalog'
import { useGameRoute } from './hooks/useGameRoute'
import { usePersistentState } from './hooks/usePersistentState'
import {
  applyFilters, computeStats, countActiveFilters, DEFAULT_FILTERS, SORT_OPTIONS, warmSearchIndex,
  type FilterState, type SortId,
} from './lib/filters'
import { DURATION_MODES, type DurationMode } from './types/game'

const hydrateFilters = (saved: unknown): FilterState => ({
  ...DEFAULT_FILTERS,
  ...(saved && typeof saved === 'object' ? (saved as Partial<FilterState>) : {}),
  query: '', // la búsqueda no se recuerda entre sesiones
})

export default function App() {
  const { catalog, status, error, stale, refreshing, retry } = useCatalog()
  const [filters, setFilters] = usePersistentState<FilterState>('filters-v1', DEFAULT_FILTERS, hydrateFilters)
  const [favoriteIds, setFavoriteIds] = usePersistentState<number[]>('favorites-v1', [],
    (s) => (Array.isArray(s) ? s.filter((x): x is number => typeof x === 'number') : []))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { gameId, open, close } = useGameRoute()

  const favorites = useMemo(() => new Set(favoriteIds), [favoriteIds])
  const games = useMemo(() => catalog?.games ?? [], [catalog])
  const stats = useMemo(() => computeStats(games), [games])
  useEffect(() => warmSearchIndex(games), [games])

  // Filtrar miles de juegos con prioridad baja: la UI (sliders, tecleo) nunca se bloquea.
  const deferredFilters = useDeferredValue(filters)
  const results = useMemo(
    () => applyFilters(games, deferredFilters, favorites),
    [games, deferredFilters, favorites],
  )
  const activeCount = countActiveFilters(filters)

  const patch = useCallback((p: Partial<FilterState>) => setFilters((f) => ({ ...f, ...p })), [setFilters])
  const reset = useCallback(() => setFilters((f) => ({ ...DEFAULT_FILTERS, query: f.query, sort: f.sort })), [setFilters])
  const setMode = useCallback((mode: DurationMode) => patch({ mode }), [patch])
  const toggleFavorite = useCallback((id: number) => {
    setFavoriteIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }, [setFavoriteIds])

  const gamesById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games])
  const selected = gameId != null ? gamesById.get(gameId) : undefined
  // Enlace a un juego que ya no existe en el catálogo: cierra el detalle.
  useEffect(() => {
    if (gameId != null && status === 'ready' && !selected) close()
  }, [gameId, status, selected, close])

  // Al cambiar filtros u orden, vuelve al inicio de la lista si se había bajado.
  // Nunca con el detalle abierto: cambiar el modo desde el modal no debe perder la posición.
  const listTopRef = useRef<HTMLDivElement>(null)
  const gameIdRef = useRef(gameId)
  gameIdRef.current = gameId
  const isFirstFilterRun = useRef(true)
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false
      return
    }
    const el = listTopRef.current
    if (gameIdRef.current != null || !el) return
    if (el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' })
  }, [deferredFilters])

  const resetAll = useCallback(
    () => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort, mode: f.mode })),
    [setFilters],
  )
  const hasAnyFilter = activeCount > 0 || filters.query.trim() !== ''

  const updatedAt = catalog?.generatedAt
    ? new Date(catalog.generatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : null
  const isFiltering = deferredFilters !== filters

  const panel = <FilterPanel filters={filters} stats={stats} onChange={patch} onReset={reset} activeCount={activeCount} />

  return (
    <div className="min-h-dvh pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/* Cabecera */}
      <header className="sticky top-0 z-30 border-b border-ink-700/80 bg-ink-900/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6">
          <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="flex shrink-0 items-center gap-2.5" aria-label="Euro por Hora, inicio">
            <span className="flex h-9 items-center rounded-lg bg-value-strong px-2 text-sm font-black tracking-tight text-ink-950">€/h</span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="font-bold text-white">Euro por Hora</span>
              <span className="mt-0.5 text-[11px] text-slate-500">Juegos de Steam que rinden</span>
            </span>
          </a>

          <div className="relative min-w-0 flex-1 lg:max-w-xl">
            <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              placeholder="Buscar juego o estudio…"
              value={filters.query}
              onChange={(e) => patch({ query: e.target.value })}
              className="h-11 w-full rounded-xl border border-ink-600 bg-ink-850 pr-10 pl-10 text-[16px] text-white placeholder:text-slate-500 focus:border-value/60 focus:outline-none sm:text-sm [&::-webkit-search-cancel-button]:hidden"
              aria-label="Buscar juegos"
            />
            {filters.query && (
              <button type="button" onClick={() => patch({ query: '' })} aria-label="Borrar búsqueda"
                className="absolute top-1/2 right-0 flex size-11 -translate-y-1/2 items-center justify-center text-slate-500 hover:text-white">
                <XIcon size={16} />
              </button>
            )}
          </div>

          {catalog && (
            <div className="hidden shrink-0 items-center gap-2 text-xs text-slate-500 md:flex">
              {refreshing && <RefreshIcon size={13} className="animate-spin" />}
              <span>{catalog.count.toLocaleString('es-ES')} juegos{updatedAt && ` · act. ${updatedAt}`}</span>
            </div>
          )}
        </div>
      </header>

      {stale && (
        <div className="border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
          Sin conexión con el catálogo: mostrando la última copia guardada.{' '}
          <button type="button" onClick={retry} className="font-semibold underline">Reintentar</button>
        </div>
      )}

      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 sm:px-6">
        {/* Filtros en escritorio */}
        <aside className="thin-scrollbar sticky top-[calc(4.25rem+env(safe-area-inset-top))] hidden h-[calc(100dvh-4.25rem-env(safe-area-inset-top))] w-80 shrink-0 overflow-y-auto pt-2 pb-8 lg:block" aria-label="Filtros">
          {panel}
        </aside>

        <main className="min-w-0 flex-1 pt-4 pb-28 lg:pb-12">
          {/* Barra de resultados */}
          <div ref={listTopRef} className="mb-4 flex scroll-mt-[calc(4.25rem+env(safe-area-inset-top))] flex-col gap-3">
            <div className="lg:hidden">
              <Segmented label="Modo de duración" options={DURATION_MODES.map((m) => ({ id: m.id, label: m.short }))} value={filters.mode} onChange={setMode} size="sm" />
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-400" aria-live="polite">
                {status === 'ready' || catalog ? (
                  <><span className="font-semibold text-white tabular-nums">{results.length.toLocaleString('es-ES')}</span> {results.length === 1 ? 'juego' : 'juegos'}
                    {activeCount > 0 && (
                      <button type="button" onClick={reset} className="ml-2 text-value hover:underline">Limpiar filtros</button>
                    )}</>
                ) : 'Cargando…'}
              </p>
              <label className="relative flex items-center">
                <span className="sr-only">Ordenar por</span>
                <select
                  value={filters.sort}
                  onChange={(e) => patch({ sort: e.target.value as SortId })}
                  className="h-11 cursor-pointer appearance-none rounded-xl border border-ink-600 bg-ink-850 pr-9 pl-3 text-sm font-medium text-white focus:border-value/60 focus:outline-none"
                >
                  {SORT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <ChevronDownIcon size={16} className="pointer-events-none absolute right-3 text-slate-400" />
              </label>
            </div>
          </div>

          <div className={isFiltering ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
            {status === 'loading' && !catalog ? (
              <GridSkeleton />
            ) : status === 'error' && !catalog ? (
              <EmptyState
                title="No se pudo cargar el catálogo"
                action={<button type="button" onClick={retry} className="flex min-h-11 items-center gap-2 rounded-xl bg-value-strong px-5 font-bold text-ink-950"><RefreshIcon size={16} /> Reintentar</button>}
              >
                Comprueba tu conexión e inténtalo de nuevo.
                {error && <span className="mt-2 block font-mono text-xs text-slate-600">{error}</span>}
              </EmptyState>
            ) : results.length === 0 ? (
              <EmptyState
                title={filters.favoritesOnly && favorites.size === 0 ? 'Aún no tienes favoritos' : 'Ningún juego coincide con tus filtros'}
                action={hasAnyFilter ? (
                  <button type="button" onClick={resetAll} className="flex min-h-11 items-center gap-2 rounded-xl bg-value-strong px-5 font-bold text-ink-950 transition hover:bg-value active:scale-[0.98]">
                    <RefreshIcon size={16} /> Restablecer filtros
                  </button>
                ) : undefined}
              >
                {filters.favoritesOnly && favorites.size === 0
                  ? 'Pulsa el corazón de cualquier juego para guardarlo aquí.'
                  : filters.query.trim()
                    ? <>No hay resultados para «{filters.query.trim()}» con los filtros actuales.</>
                    : 'Prueba a ampliar el rango de precio u horas, o a subir el máximo de €/hora.'}
              </EmptyState>
            ) : (
              <GameGrid games={results} mode={deferredFilters.mode} favorites={favorites} onOpen={open} onToggleFavorite={toggleFavorite} />
            )}
          </div>
        </main>
      </div>

      {/* Botón flotante de filtros (móvil) */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed right-4 bottom-[max(1rem,calc(env(safe-area-inset-bottom)+0.5rem))] z-30 flex min-h-14 items-center gap-2 rounded-full bg-value-strong pr-5 pl-4 font-bold text-ink-950 shadow-xl shadow-black/50 active:scale-95 lg:hidden"
        aria-label={`Abrir filtros${activeCount ? `, ${activeCount} activos` : ''}`}
      >
        <SlidersIcon size={20} /> Filtros
        {activeCount > 0 && <span className="flex size-6 items-center justify-center rounded-full bg-ink-950 text-xs text-value tabular-nums">{activeCount}</span>}
      </button>

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} resultCount={results.length}>
        {panel}
      </FilterDrawer>

      {gameId != null && !selected && !catalog && status === 'loading' && <GameDetailLoading onClose={close} />}
      {selected && (
        <GameDetailModal
          game={selected}
          mode={filters.mode}
          favorite={favorites.has(selected.id)}
          onClose={close}
          onToggleFavorite={toggleFavorite}
          onModeChange={setMode}
        />
      )}
    </div>
  )
}

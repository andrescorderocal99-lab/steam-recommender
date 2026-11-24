import type { DurationMode, Game } from '../types/game'

export type SortId = 'eph' | 'hours' | 'price' | 'discount' | 'rating'

/** Orden en el desplegable; los textos están en los diccionarios (`t.sort[id]`). */
export const SORT_OPTIONS: SortId[] = ['eph', 'hours', 'price', 'discount', 'rating']

/** Tope visual del slider de horas: el extremo derecho significa "sin límite". */
export const HOURS_CEIL = 200

export interface FilterState {
  query: string
  mode: DurationMode
  priceMin: number
  /** null = sin tope */
  priceMax: number | null
  onSaleOnly: boolean
  includeFree: boolean
  hoursMin: number
  /** null = sin tope */
  hoursMax: number | null
  /** null = cualquier ratio */
  maxEph: number | null
  genres: string[]
  minRating: number
  hideWithoutHours: boolean
  favoritesOnly: boolean
  sort: SortId
}

export const DEFAULT_FILTERS: FilterState = {
  query: '',
  mode: 'main',
  priceMin: 0,
  priceMax: null,
  onSaleOnly: false,
  includeFree: true,
  hoursMin: 0,
  hoursMax: null,
  maxEph: null,
  genres: [],
  minRating: 0,
  hideWithoutHours: true,
  favoritesOnly: false,
  sort: 'eph',
}

/** Número de filtros activos (sin contar búsqueda, modo ni orden), para el badge del botón. */
export function countActiveFilters(f: FilterState): number {
  let n = 0
  if (f.priceMin > 0 || f.priceMax != null) n++
  if (f.onSaleOnly) n++
  if (!f.includeFree) n++
  if (f.hoursMin > 0 || f.hoursMax != null) n++
  if (f.maxEph != null) n++
  if (f.genres.length) n++
  if (f.minRating > 0) n++
  if (!f.hideWithoutHours) n++
  if (f.favoritesOnly) n++
  return n
}

export function normalizeText(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[™®©]/g, '')
}

const searchKeys = new WeakMap<Game, string>()
function searchKey(g: Game): string {
  let key = searchKeys.get(g)
  if (key === undefined) {
    key = normalizeText(`${g.name} ${g.developer ?? ''}`)
    searchKeys.set(g, key)
  }
  return key
}

/**
 * Precalcula las claves de búsqueda (normalizar acentos de miles de nombres cuesta ~150 ms) en
 * los ratos libres del navegador, en lotes pequeños, para que la primera búsqueda sea instantánea.
 */
export function warmSearchIndex(games: Game[]): () => void {
  let i = 0
  let handle = 0
  // Safari antiguo no tiene requestIdleCallback.
  const hasIdle = typeof window.requestIdleCallback === 'function'
  const idle = (cb: () => void): number =>
    hasIdle ? window.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 50)
  const cancel = (h: number) => (hasIdle ? window.cancelIdleCallback(h) : window.clearTimeout(h))
  const work = () => {
    const end = Math.min(i + 500, games.length)
    for (; i < end; i++) searchKey(games[i])
    if (i < games.length) handle = idle(work)
  }
  handle = idle(work)
  return () => cancel(handle)
}

/** Compara con los null siempre al final, sea cual sea la dirección. */
function cmpNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return (a - b) * dir
}

function sortGames(games: Game[], sort: SortId, mode: DurationMode): Game[] {
  const byName = (a: Game, b: Game) => a.name.localeCompare(b.name, 'es')
  const cmp: Record<SortId, (a: Game, b: Game) => number> = {
    eph: (a, b) => cmpNullable(a.eurPerHour[mode], b.eurPerHour[mode], 1)
      || cmpNullable(a.hltb[mode], b.hltb[mode], -1),
    hours: (a, b) => cmpNullable(a.hltb[mode], b.hltb[mode], -1),
    price: (a, b) => cmpNullable(a.price, b.price, 1) || cmpNullable(a.hltb[mode], b.hltb[mode], -1),
    discount: (a, b) => b.discount - a.discount || cmpNullable(a.price, b.price, 1),
    rating: (a, b) => cmpNullable(a.rating, b.rating, -1) || cmpNullable(a.ratingCount, b.ratingCount, -1),
  }
  const c = cmp[sort]
  return games.sort((a, b) => c(a, b) || byName(a, b))
}

export function applyFilters(games: Game[], f: FilterState, favorites: ReadonlySet<number>): Game[] {
  const terms = normalizeText(f.query.trim()).split(/\s+/).filter(Boolean)
  const genreSet = f.genres.length ? new Set(f.genres) : null
  const hoursActive = f.hoursMin > 0 || f.hoursMax != null
  const m = f.mode

  const out = games.filter((g) => {
    if (f.favoritesOnly && !favorites.has(g.id)) return false
    if (terms.length) {
      const key = searchKey(g)
      if (!terms.every((t) => key.includes(t))) return false
    }

    const price = g.isFree ? 0 : g.price
    if (price == null) return false // de pago sin precio en ES: no se puede comparar
    if (!f.includeFree && price === 0) return false
    if (price < f.priceMin) return false
    if (f.priceMax != null && price > f.priceMax) return false
    if (f.onSaleOnly && g.discount <= 0) return false

    const hours = g.hltb[m]
    if (hours == null && (f.hideWithoutHours || hoursActive || f.maxEph != null)) return false
    if (hours != null) {
      if (hours < f.hoursMin) return false
      if (f.hoursMax != null && hours > f.hoursMax) return false
    }
    if (f.maxEph != null) {
      const eph = g.eurPerHour[m]
      if (eph == null || eph > f.maxEph) return false
    }

    if (genreSet && !g.genres.some((x) => genreSet.has(x))) return false
    if (f.minRating > 0 && (g.rating == null || g.rating < f.minRating)) return false
    return true
  })
  return sortGames(out, f.sort, m)
}

export interface CatalogStats {
  priceCeil: number
  genres: { name: string; count: number }[]
}

export function computeStats(games: Game[]): CatalogStats {
  let maxPrice = 0
  const genreCount = new Map<string, number>()
  for (const g of games) {
    if (g.price != null && g.price > maxPrice) maxPrice = g.price
    for (const genre of g.genres) genreCount.set(genre, (genreCount.get(genre) ?? 0) + 1)
  }
  return {
    priceCeil: Math.max(10, Math.ceil(maxPrice / 5) * 5),
    genres: [...genreCount.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es')),
  }
}

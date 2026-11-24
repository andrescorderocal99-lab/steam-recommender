import type { Catalog, GameDetail } from '../types/game'
import { storage } from '../utils/storage'

/**
 * Base única para el índice y las fichas de detalle. En la app Capacitor apunta a la web/CDN
 * (VITE_DATA_URL=https://.../data) para recibir precios nuevos sin republicar la app.
 */
const DATA_BASE_URL = (import.meta.env.VITE_DATA_URL || './data').replace(/\/+$/, '')

export const catalogUrl = () => `${DATA_BASE_URL}/games.json`
export const detailUrl = (appId: number) => `${DATA_BASE_URL}/details/${appId}.json`

// La clave incluye la base de datos: distintas fuentes (producción, staging, datos de prueba)
// nunca comparten caché.
const CATALOG_CACHE_KEY = `catalog-cache-v1:${DATA_BASE_URL}`
/** Pasado este tiempo la caché se sigue mostrando, pero se revalida en segundo plano. */
export const CATALOG_MAX_AGE_MS = 6 * 60 * 60 * 1000

interface CachedCatalog {
  savedAt: number
  catalog: Catalog
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: 'no-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status} al cargar ${url}`)
  return (await res.json()) as T
}

/** Catálogo guardado en el dispositivo (si existe), para arrancar al instante. */
export function getCachedCatalog(): CachedCatalog | null {
  const cached = storage.getSync<CachedCatalog>(CATALOG_CACHE_KEY)
  return cached?.catalog?.games ? cached : null
}

export function isCacheFresh(cached: CachedCatalog | null): boolean {
  return Boolean(cached && Date.now() - cached.savedAt < CATALOG_MAX_AGE_MS)
}

/** Descarga el catálogo y actualiza la caché local. */
export async function fetchCatalog(signal?: AbortSignal): Promise<Catalog> {
  const catalog = await fetchJson<Catalog>(catalogUrl(), signal)
  if (!Array.isArray(catalog.games)) throw new Error('Formato de catálogo no válido')
  // Serializar varios MB es síncrono: se hace cuando el navegador está libre, no antes del
  // primer pintado.
  const save = () => void storage.set<CachedCatalog>(CATALOG_CACHE_KEY, { savedAt: Date.now(), catalog })
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(save, { timeout: 5000 })
  else window.setTimeout(save, 1000)
  return catalog
}

/**
 * Caché en memoria de fichas de detalle: se guarda la promesa, así que abrir varias veces el
 * mismo juego (o abrirlo mientras aún carga) solo dispara una petición. Si falla, se olvida
 * para poder reintentar.
 */
const detailCache = new Map<number, Promise<GameDetail>>()

export function fetchGameDetail(appId: number): Promise<GameDetail> {
  let pending = detailCache.get(appId)
  if (!pending) {
    pending = fetchJson<GameDetail>(detailUrl(appId)).catch((err) => {
      detailCache.delete(appId)
      throw err
    })
    detailCache.set(appId, pending)
  }
  return pending
}

/** Precarga silenciosa (al pasar el ratón por una tarjeta, por ejemplo). */
export function prefetchGameDetail(appId: number): void {
  fetchGameDetail(appId).catch(() => {})
}

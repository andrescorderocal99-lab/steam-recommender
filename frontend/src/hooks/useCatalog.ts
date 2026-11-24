import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchCatalog, getCachedCatalog } from '../services/gamesService'
import type { Catalog } from '../types/game'

export interface CatalogState {
  catalog: Catalog | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
  /** true si lo que se muestra viene de la caché local y la red falló */
  stale: boolean
  refreshing: boolean
  retry: () => void
}

/**
 * Stale-while-revalidate: pinta al instante el catálogo cacheado en el dispositivo y lo
 * revalida siempre en segundo plano. Si la red falla y hay caché, se sigue usando la caché.
 */
export function useCatalog(): CatalogState {
  const [catalog, setCatalog] = useState<Catalog | null>(() => getCachedCatalog()?.catalog ?? null)
  const [status, setStatus] = useState<CatalogState['status']>(() => (catalog ? 'ready' : 'loading'))
  const [error, setError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [refreshing, setRefreshing] = useState(true)
  const [attempt, setAttempt] = useState(0)
  const hasData = useRef(catalog != null)

  useEffect(() => {
    const ctrl = new AbortController()
    setRefreshing(true)
    fetchCatalog(ctrl.signal)
      .then((fresh) => {
        hasData.current = true
        setCatalog(fresh)
        setStatus('ready')
        setError(null)
        setStale(false)
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        if (hasData.current) setStale(true)
        else setStatus('error')
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setRefreshing(false)
      })
    return () => ctrl.abort()
  }, [attempt])

  const retry = useCallback(() => {
    if (!hasData.current) setStatus('loading')
    setAttempt((n) => n + 1)
  }, [])

  return { catalog, status, error, stale, refreshing, retry }
}

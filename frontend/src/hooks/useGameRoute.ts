import { useCallback, useEffect, useRef, useState } from 'react'

const ROUTE_RE = /^#\/app\/(\d+)/

function readId(): number | null {
  const m = ROUTE_RE.exec(window.location.hash)
  return m ? Number(m[1]) : null
}

/**
 * Navegación del detalle mediante hash (#/app/{id}): funciona con base './', en file:// y en
 * Capacitor, permite enlaces directos y que el botón "atrás" (navegador o Android) cierre el modal.
 */
export function useGameRoute() {
  const [gameId, setGameId] = useState<number | null>(readId)
  const pushedRef = useRef(false)

  useEffect(() => {
    const onHash = () => {
      const id = readId()
      if (id == null) pushedRef.current = false
      setGameId(id)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const open = useCallback((id: number) => {
    if (readId() === id) return
    if (readId() != null) {
      // Ya hay un detalle abierto: reemplaza para no apilar entradas de historial.
      history.replaceState(null, '', `#/app/${id}`)
      setGameId(id)
      return
    }
    pushedRef.current = true
    window.location.hash = `/app/${id}`
  }, [])

  const close = useCallback(() => {
    if (pushedRef.current) {
      history.back() // dispara hashchange -> gameId = null
    } else {
      // Se llegó por enlace directo: no hay entrada previa a la que volver.
      history.replaceState(null, '', window.location.pathname + window.location.search)
      setGameId(null)
    }
    pushedRef.current = false
  }, [])

  return { gameId, open, close }
}

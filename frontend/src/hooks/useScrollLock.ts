import { useEffect } from 'react'

let locks = 0

/** Bloquea el scroll del body mientras haya un modal/drawer abierto (con contador para anidados). */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    locks++
    const { documentElement: html } = document
    const scrollbar = window.innerWidth - html.clientWidth
    html.style.overflow = 'hidden'
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`
    return () => {
      locks--
      if (locks === 0) {
        html.style.overflow = ''
        html.style.paddingRight = ''
      }
    }
  }, [active])
}

/** Cierra con Escape. */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, onEscape])
}

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { storage } from '../utils/storage'

/**
 * useState sincronizado con `storage` (localStorage hoy, @capacitor/preferences mañana).
 * `hydrate` permite fusionar/validar el valor guardado (p. ej. tras añadir campos nuevos).
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  hydrate: (saved: unknown) => T = (saved) => saved as T,
  debounceMs = 250,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const saved = storage.getSync<unknown>(key)
    if (saved == null) return initial
    try {
      return hydrate(saved)
    } catch {
      return initial
    }
  })

  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = window.setTimeout(() => void storage.set(key, value), debounceMs)
    return () => window.clearTimeout(t)
  }, [key, value, debounceMs])

  return [value, setValue]
}

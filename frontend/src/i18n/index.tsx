import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { configureFormat } from '../utils/format'
import { storage } from '../utils/storage'
import { en } from './en'
import { es, type Dictionary } from './es'

export type Lang = 'en' | 'es'
export type { Dictionary }

export const LANGS: Lang[] = ['en', 'es']
const DICTIONARIES: Record<Lang, Dictionary> = { en, es }
/** Locale de Intl (números, fechas, precios) para cada idioma. */
const LOCALES: Record<Lang, string> = { en: 'en-GB', es: 'es-ES' }
const STORAGE_KEY = 'lang-v1'

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'es'

/** Elección guardada; si no hay, español si el navegador está en español y si no inglés. */
function detectLang(): Lang {
  const saved = storage.getSync<unknown>(STORAGE_KEY)
  if (isLang(saved)) return saved
  const nav = typeof navigator !== 'undefined' ? navigator.language : ''
  return nav?.toLowerCase().startsWith('es') ? 'es' : 'en'
}

/** Aplica el idioma a todo lo que vive fuera de React: formateadores, <html lang>, título y meta. */
function applyLang(lang: Lang) {
  const t = DICTIONARIES[lang]
  configureFormat(LOCALES[lang], t.common.free, t.common.noPrice)
  if (typeof document === 'undefined') return
  document.documentElement.lang = lang
  document.title = t.meta.title
  document.querySelector('meta[name="description"]')?.setAttribute('content', t.meta.description)
}

interface I18nValue {
  lang: Lang
  setLang: (lang: Lang) => void
  t: Dictionary
  /** Locale de Intl para toLocaleString / toLocaleDateString. */
  locale: string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const initial = detectLang()
    applyLang(initial) // antes del primer render: los formateadores ya salen en el idioma correcto
    return initial
  })

  const setLang = useCallback((next: Lang) => {
    applyLang(next) // síncrono, para que el render que provoca use ya el nuevo locale
    setLangState(next)
    void storage.set(STORAGE_KEY, next)
  }, [])

  const value = useMemo<I18nValue>(
    () => ({ lang, setLang, t: DICTIONARIES[lang], locale: LOCALES[lang] }),
    [lang, setLang],
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n debe usarse dentro de <I18nProvider>')
  return ctx
}

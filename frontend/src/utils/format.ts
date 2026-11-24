/**
 * Formateadores dependientes del idioma. `configureFormat` lo llama el I18nProvider al arrancar
 * y al cambiar de idioma; los componentes que pintan estos textos se re-renderizan por el contexto.
 */
let locale = 'es-ES'
let freeLabel = 'Gratis'
let noPriceLabel = 'Sin precio'
let priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })
let ephFmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
let numFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
let countFmt = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })

export function configureFormat(nextLocale: string, free: string, noPrice: string) {
  freeLabel = free
  noPriceLabel = noPrice
  if (nextLocale === locale) return
  locale = nextLocale
  priceFmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })
  ephFmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  numFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  countFmt = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
}

export function formatPrice(price: number | null, isFree = false): string {
  if (isFree || price === 0) return freeLabel
  if (price == null) return noPriceLabel
  return priceFmt.format(price)
}

/** Euros por hora con 2 decimales: "0,05 €/h"; por debajo de un céntimo, "< 0,01 €/h". */
export function formatEph(eph: number | null): string {
  if (eph == null) return '—'
  if (eph === 0) return `${ephFmt.format(0)} €/h`
  if (eph < 0.01) return `< ${ephFmt.format(0.01)} €/h`
  return `${ephFmt.format(eph)} €/h`
}

export function formatHours(hours: number | null): string {
  if (hours == null) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  return `${numFmt.format(hours < 10 ? hours : Math.round(hours))} h`
}

export function formatCount(n: number | null): string {
  if (n == null) return ''
  return countFmt.format(n)
}

export function releaseYear(date: string | null): string | null {
  return date ? date.slice(0, 4) : null
}

/** Color semántico del €/h: verde = chollo, ámbar = correcto, rojo = caro. */
export function ephTone(eph: number | null): 'great' | 'good' | 'ok' | 'poor' | 'none' {
  if (eph == null) return 'none'
  if (eph <= 0.1) return 'great'
  if (eph <= 0.5) return 'good'
  if (eph <= 1.5) return 'ok'
  return 'poor'
}

export function ratingTone(rating: number | null): string {
  if (rating == null) return 'text-slate-400'
  if (rating >= 80) return 'text-sky-300'
  if (rating >= 60) return 'text-amber-300'
  return 'text-rose-300'
}

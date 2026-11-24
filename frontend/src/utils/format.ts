const priceFmt = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
const ephFmt = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const numFmt = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })

export function formatPrice(price: number | null, isFree = false): string {
  if (isFree || price === 0) return 'Gratis'
  if (price == null) return 'Sin precio'
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
  return new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
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

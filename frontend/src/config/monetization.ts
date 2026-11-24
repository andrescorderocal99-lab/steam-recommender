/**
 * Monetización centralizada: enlaces de afiliado y "Invítame a un café".
 *
 * Para activar/desactivar una tienda basta con editar este archivo (o definir las variables
 * VITE_* en .env, que tienen prioridad). Una tienda solo se muestra si `enabled` es true
 * Y tiene `id` configurado.
 */

const env = import.meta.env

/** Lee un booleano de entorno ('true'/'1'); si no está definido, usa el valor por defecto. */
function envFlag(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback
  return value === 'true' || value === '1'
}

export interface AffiliateStore {
  /** Clave estable (React key, analítica). */
  key: string
  /** Nombre visible en el botón. */
  name: string
  /** ID de afiliado; vacío = tienda oculta. */
  id: string
  enabled: boolean
  /** Plantilla de búsqueda con los marcadores {query} y {id}. */
  searchUrl: string
}

export const monetization = {
  coffeeUrl: env.VITE_COFFEE_URL || 'https://ko-fi.com/europorhora',
  affiliates: [
    {
      key: 'instant-gaming',
      name: 'Instant Gaming',
      id: env.VITE_INSTANT_GAMING_ID ?? 'gamer-9a5566f',
      enabled: envFlag(env.VITE_INSTANT_GAMING_ENABLED, true),
      searchUrl: 'https://www.instant-gaming.com/es/busquedas/?query={query}&igr={id}',
    },
    {
      // Pendiente de aprobación: pegar el af_id y poner enabled a true.
      key: 'eneba',
      name: 'Eneba',
      id: env.VITE_ENEBA_ID ?? '',
      enabled: envFlag(env.VITE_ENEBA_ENABLED, false),
      searchUrl: 'https://www.eneba.com/es/store/all?text={query}&af_id={id}',
    },
  ] satisfies AffiliateStore[] as AffiliateStore[],
}

/** Tiendas que deben mostrarse (activas y con ID). */
export const activeAffiliates: AffiliateStore[] = monetization.affiliates.filter((s) => s.enabled && s.id.trim() !== '')

/**
 * Limpia el nombre del juego para que la búsqueda en las tiendas acierte:
 * quita ™ ® © ℠, normaliza comillas/guiones raros y colapsa espacios.
 */
export function cleanGameName(name: string): string {
  return name
    // Antes de NFKC: NFKC convierte ™ en "TM" y ℠ en "SM".
    .replace(/[™®©℠]/g, ' ')
    .normalize('NFKC')
    .replace(/[‘’´`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

/** URL de búsqueda de afiliado para un juego concreto. */
export function affiliateSearchUrl(store: AffiliateStore, gameName: string): string {
  return store.searchUrl
    .replace('{query}', encodeURIComponent(cleanGameName(gameName)))
    .replace('{id}', encodeURIComponent(store.id.trim()))
}

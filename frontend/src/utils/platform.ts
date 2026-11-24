/**
 * Capa de abstracción de plataforma.
 * Hoy todo usa APIs web; al empaquetar con Capacitor basta con sustituir el cuerpo de estas
 * funciones (p. ej. por @capacitor/browser) sin tocar los componentes.
 */

/** true cuando corre dentro de un contenedor nativo de Capacitor. */
export function isNativePlatform(): boolean {
  const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return Boolean(cap?.isNativePlatform?.())
}

/**
 * Abre una URL externa (ficha de Steam, HowLongToBeat...).
 * Capacitor: `await Browser.open({ url })` de '@capacitor/browser'.
 */
export async function openExternalUrl(url: string): Promise<void> {
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) window.location.href = url // bloqueador de pop-ups
}

export const steamStoreUrl = (appId: number) => `https://store.steampowered.com/app/${appId}`
export const hltbUrl = (hltbId: number) => `https://howlongtobeat.com/game/${hltbId}`

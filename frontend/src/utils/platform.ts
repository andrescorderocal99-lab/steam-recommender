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
  // Ojo: window.open(url, '_blank', 'noopener') devuelve SIEMPRE null según la especificación,
  // así que no sirve para detectar bloqueadores (provocaba que la pestaña actual navegase también).
  // Un <a target="_blank"> sintético abre solo la pestaña nueva, conserva noopener/noreferrer
  // y nunca saca al usuario de la web.
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export const steamStoreUrl = (appId: number) => `https://store.steampowered.com/app/${appId}`
export const hltbUrl = (hltbId: number) => `https://howlongtobeat.com/game/${hltbId}`

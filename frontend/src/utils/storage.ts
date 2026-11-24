/**
 * Almacenamiento clave-valor con API asíncrona, igual que @capacitor/preferences
 * (Preferences.get/set/remove). En web usa localStorage; para migrar solo cambia este archivo.
 * Todas las operaciones toleran que el almacenamiento no esté disponible (modo privado, cuota).
 */
const PREFIX = 'evh:'

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    return storage.getSync<T>(key)
  },

  async set<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      /* cuota llena o storage bloqueado: se ignora */
    }
  },

  async remove(key: string): Promise<void> {
    try {
      localStorage.removeItem(PREFIX + key)
    } catch {
      /* ignorado */
    }
  },

  /**
   * Lectura síncrona solo para el primer render en web (evita parpadeos).
   * En Capacitor devolverá null y se usará el valor de get() cuando llegue.
   */
  getSync<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw == null ? null : (JSON.parse(raw) as T)
    } catch {
      return null
    }
  },
}

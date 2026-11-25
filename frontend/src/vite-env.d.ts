/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base del catálogo (contiene games.json y details/). Por defecto ./data */
  readonly VITE_DATA_URL?: string
  /** Monetización (ver src/config/monetization.ts). */
  readonly VITE_COFFEE_URL?: string
  readonly VITE_INSTANT_GAMING_ID?: string
  readonly VITE_INSTANT_GAMING_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

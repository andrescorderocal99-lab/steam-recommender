/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base del catálogo (contiene games.json y details/). Por defecto ./data */
  readonly VITE_DATA_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

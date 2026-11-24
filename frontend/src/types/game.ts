export type DurationMode = 'main' | 'extra' | 'completionist'

export type HltbTimes = Record<DurationMode, number | null>

/** Entrada ligera del índice games.json (suficiente para filtrar, ordenar y pintar tarjetas). */
export interface Game {
  id: number
  name: string
  header: string | null
  price: number | null
  priceInitial: number | null
  discount: number
  isFree: boolean
  currency: string
  genres: string[]
  developer: string | null
  releaseDate: string | null
  rating: number | null
  ratingCount: number | null
  ratingText: string | null
  metacritic: number | null
  hltb: HltbTimes
  eurPerHour: HltbTimes
  hasVideo: boolean
  priceUpdatedAt: string | null
}

export interface Catalog {
  version: number
  generatedAt: string
  currency: string
  count: number
  games: Game[]
}

export interface Screenshot {
  thumb: string
  full: string
}

export interface Movie {
  id: number
  name?: string
  thumbnail?: string
  highlight?: boolean
  hls?: string
  dash?: string
  mp4?: string
  webm?: string
}

/** Ficha pesada details/{id}.json, cargada bajo demanda. */
export interface GameDetail {
  id: number
  shortDescription: string | null
  developers: string[]
  publishers: string[]
  categories: string[]
  releaseDateRaw: string | null
  background: string | null
  screenshots: Screenshot[]
  movies: Movie[]
  hltbId: number | null
  hltbName: string | null
}

/** Los textos de cada modo viven en los diccionarios (`t.modes[id]`). */
export const DURATION_MODES: { id: DurationMode }[] = [
  { id: 'main' },
  { id: 'extra' },
  { id: 'completionist' },
]

#!/usr/bin/env node
/**
 * Genera un catálogo sintético para pruebas de rendimiento, basado en el catálogo real
 * (reutiliza portadas y fichas de detalle reales para que la UI se vea y funcione completa).
 *
 *   node scripts/generate-stress-data.mjs [nº de juegos=5000]
 *   $env:VITE_DATA_URL = './stress-data'; npm run dev      # PowerShell
 *   VITE_DATA_URL=./stress-data npm run dev                 # bash
 *
 * Salida: public/stress-data/ (ignorada por git). Es determinista (semilla fija).
 * IMPORTANTE: Vite copia todo public/ al build. Bórralo antes de desplegar:
 *   node scripts/generate-stress-data.mjs --clean
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'public', 'data')
const outDir = join(root, 'public', 'stress-data')

if (process.argv.includes('--clean')) {
  rmSync(outDir, { recursive: true, force: true })
  console.log(`Eliminado ${outDir}`)
  process.exit(0)
}

const total = Number(process.argv[2] ?? 5000)

if (!existsSync(join(srcDir, 'games.json'))) {
  console.error('Falta public/data/games.json: ejecuta antes el scraper.')
  process.exit(1)
}

// PRNG determinista (mulberry32)
let seed = 0x5eed
const rand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d

const ADJ = ['Dark', 'Lost', 'Iron', 'Crimson', 'Silent', 'Eternal', 'Hollow', 'Neon', 'Ancient', 'Frozen', 'Wild', 'Broken', 'Golden', 'Shadow', 'Star', 'Last', 'Deep', 'Burning', 'Hidden', 'Savage']
const NOUN = ['Kingdom', 'Legends', 'Frontier', 'Dungeon', 'Odyssey', 'Tactics', 'Chronicles', 'Horizon', 'Empire', 'Survivors', 'Raiders', 'Requiem', 'Colony', 'Outpost', 'Saga', 'Protocol', 'Descent', 'Crusade', 'Harbor', 'Realms']
const SUFFIX = ['', '', '', '', ' II', ' III', ': Remastered', ' Deluxe', ': Origins', ' 2']
const GENRES = ['Acción', 'Aventura', 'Indie', 'Rol', 'Estrategia', 'Simuladores', 'Casual', 'Deportes', 'Carreras', 'Multijugador masivo', 'Acceso anticipado']

const base = JSON.parse(readFileSync(join(srcDir, 'games.json'), 'utf8'))
const bases = base.games

rmSync(outDir, { recursive: true, force: true })
mkdirSync(join(outDir, 'details'), { recursive: true })

const games = []
for (let i = 0; i < total; i++) {
  const tpl = bases[i % bases.length]
  const id = 900_000_000 + i

  const tier = rand()
  const isFree = tier < 0.04
  const priceInitial = isFree ? 0 : round(tier < 0.7 ? 2 + rand() * 18 : tier < 0.93 ? 20 + rand() * 25 : 45 + rand() * 25, 2)
  const discount = isFree || rand() < 0.45 ? 0 : pick([10, 15, 20, 25, 33, 40, 50, 60, 66, 75, 80, 85, 90])
  const price = isFree ? 0 : round(priceInitial * (1 - discount / 100), 2)

  const hasHltb = rand() > 0.15
  const main = hasHltb ? round(Math.exp(1 + rand() * 3.4), 2) : null // ~3h a ~80h, cola larga
  const extra = main != null && rand() > 0.05 ? round(main * (1.2 + rand() * 1.3), 2) : null
  const comp = extra != null && rand() > 0.1 ? round(extra * (1.3 + rand() * 2), 2) : null
  const hltb = { main, extra, completionist: comp }
  const eph = (h) => (h ? round(price / h, 3) : null)

  const g = new Set([pick(GENRES), pick(GENRES)])
  if (rand() > 0.6) g.add(pick(GENRES))

  games.push({
    ...tpl,
    id,
    name: `${pick(ADJ)} ${pick(NOUN)}${pick(SUFFIX)}`,
    price,
    priceInitial,
    discount,
    isFree,
    genres: [...g],
    rating: rand() < 0.05 ? null : Math.round(40 + rand() * 59),
    ratingCount: Math.round(Math.exp(3 + rand() * 9)),
    hltb,
    eurPerHour: { main: eph(main), extra: eph(extra), completionist: eph(comp) },
  })

  const detailSrc = join(srcDir, 'details', `${tpl.id}.json`)
  if (existsSync(detailSrc)) {
    const detail = JSON.parse(readFileSync(detailSrc, 'utf8'))
    writeFileSync(join(outDir, 'details', `${id}.json`), JSON.stringify({ ...detail, id }))
  }
}

const catalog = { ...base, generatedAt: new Date().toISOString(), count: games.length, games }
writeFileSync(join(outDir, 'games.json'), JSON.stringify(catalog))
const kb = Math.round(Buffer.byteLength(JSON.stringify(catalog)) / 1024)
console.log(`Generados ${games.length} juegos en ${outDir} (games.json: ${kb} KB)`)

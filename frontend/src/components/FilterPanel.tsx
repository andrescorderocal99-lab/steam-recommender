import { useState } from 'react'
import { DEFAULT_FILTERS, HOURS_CEIL, type CatalogStats, type FilterState } from '../lib/filters'
import { DURATION_MODES } from '../types/game'
import { formatPrice } from '../utils/format'
import { Chip, FilterSection, RangeSlider, Segmented, Slider, Switch } from './ui'

const EPH_STEPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2, 3, 5]
const EPH_ANY = EPH_STEPS.length // posición del slider que significa "cualquiera"
const EPH_PRESETS = [0.1, 0.25, 0.5, 1]
const HOURS_PRESETS = [20, 50, 100]
const RATING_PRESETS = [0, 70, 80, 90]
const GENRES_COLLAPSED = 10

const eurFmt = (v: number) => `${v.toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`
const ephLabel = (v: number) => `< ${v.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €/h`

export interface FilterPanelProps {
  filters: FilterState
  stats: CatalogStats
  onChange: (patch: Partial<FilterState>) => void
  onReset: () => void
  activeCount: number
}

export function FilterPanel({ filters: f, stats, onChange, onReset, activeCount }: FilterPanelProps) {
  const [showAllGenres, setShowAllGenres] = useState(false)
  const ceil = stats.priceCeil
  const priceHi = f.priceMax ?? ceil
  const hoursHi = f.hoursMax ?? HOURS_CEIL
  const ephIndex = f.maxEph == null ? EPH_ANY : Math.max(0, EPH_STEPS.findIndex((s) => s >= f.maxEph!))
  const modeLabel = DURATION_MODES.find((m) => m.id === f.mode)!.label.toLowerCase()

  const priceText = f.priceMin === 0 && f.priceMax == null
    ? 'Cualquiera'
    : `${f.priceMin === 0 ? formatPrice(0) : eurFmt(f.priceMin)} – ${f.priceMax == null ? `${ceil} €+` : eurFmt(f.priceMax)}`
  const hoursText = f.hoursMin === 0 && f.hoursMax == null
    ? 'Cualquiera'
    : f.hoursMax == null ? `${f.hoursMin} h o más` : `${f.hoursMin} – ${f.hoursMax} h`

  const genres = showAllGenres ? stats.genres : stats.genres.slice(0, GENRES_COLLAPSED)
  // Mantén visibles los géneros seleccionados aunque estén plegados.
  const hiddenSelected = showAllGenres ? [] : stats.genres.slice(GENRES_COLLAPSED).filter((g) => f.genres.includes(g.name))

  const toggleGenre = (name: string) =>
    onChange({ genres: f.genres.includes(name) ? f.genres.filter((g) => g !== name) : [...f.genres, name] })

  return (
    <div className="flex flex-col">
      <FilterSection title="Duración">
        <Segmented
          label="Modo de duración"
          size="sm"
          options={DURATION_MODES.map((m) => ({ id: m.id, label: m.short }))}
          value={f.mode}
          onChange={(mode) => onChange({ mode })}
        />
        <p className="mt-2 text-xs text-slate-500">
          Las horas y el €/h se calculan con la {modeLabel} según HowLongToBeat.
        </p>
      </FilterSection>

      <FilterSection
        title="Precio"
        value={priceText}
        onClear={f.priceMin > 0 || f.priceMax != null ? () => onChange({ priceMin: 0, priceMax: null }) : undefined}
      >
        <RangeSlider
          min={0} max={ceil} step={0.5}
          value={[f.priceMin, priceHi]}
          labels={['Precio mínimo', 'Precio máximo']}
          onChange={([lo, hi]) => onChange({ priceMin: lo, priceMax: hi >= ceil ? null : hi })}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Chip active={f.onSaleOnly} onClick={() => onChange({ onSaleOnly: !f.onSaleOnly })}>Solo en oferta</Chip>
          {[10, 5].map((cap) => (
            <Chip key={cap} active={f.priceMax === cap && f.priceMin === 0}
              onClick={() => onChange(f.priceMax === cap ? { priceMax: null } : { priceMin: 0, priceMax: cap })}>
              Menos de {cap} €
            </Chip>
          ))}
        </div>
        <Switch checked={f.includeFree} onChange={(includeFree) => onChange({ includeFree })} label="Incluir gratuitos" />
      </FilterSection>

      <FilterSection
        title="Horas de juego"
        value={hoursText}
        onClear={f.hoursMin > 0 || f.hoursMax != null ? () => onChange({ hoursMin: 0, hoursMax: null }) : undefined}
      >
        <RangeSlider
          min={0} max={HOURS_CEIL} step={1}
          value={[f.hoursMin, hoursHi]}
          labels={['Horas mínimas', 'Horas máximas']}
          onChange={([lo, hi]) => onChange({ hoursMin: lo, hoursMax: hi >= HOURS_CEIL ? null : hi })}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {HOURS_PRESETS.map((h) => (
            <Chip key={h} active={f.hoursMin === h && f.hoursMax == null}
              onClick={() => onChange(f.hoursMin === h && f.hoursMax == null ? { hoursMin: 0 } : { hoursMin: h, hoursMax: null })}>
              {h === 100 ? '+100 h' : `Mín. ${h} h`}
            </Chip>
          ))}
        </div>
      </FilterSection>

      <FilterSection
        title="Máximo €/hora"
        value={f.maxEph == null ? 'Cualquiera' : ephLabel(f.maxEph)}
        onClear={f.maxEph != null ? () => onChange({ maxEph: null }) : undefined}
      >
        <Slider
          min={0} max={EPH_ANY} step={1}
          value={ephIndex}
          label="Ratio máximo euros por hora"
          onChange={(i) => onChange({ maxEph: i >= EPH_ANY ? null : EPH_STEPS[i] })}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {EPH_PRESETS.map((v) => (
            <Chip key={v} active={f.maxEph === v} onClick={() => onChange({ maxEph: f.maxEph === v ? null : v })}>
              {ephLabel(v)}
            </Chip>
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Valoración en Steam" value={f.minRating ? `≥ ${f.minRating}%` : 'Cualquiera'}>
        <div className="flex flex-wrap gap-2">
          {RATING_PRESETS.map((r) => (
            <Chip key={r} active={f.minRating === r} onClick={() => onChange({ minRating: r })}>
              {r === 0 ? 'Cualquiera' : `≥ ${r}%`}
            </Chip>
          ))}
        </div>
      </FilterSection>

      {stats.genres.length > 0 && (
        <FilterSection
          title="Géneros"
          value={f.genres.length ? `${f.genres.length} seleccionados` : undefined}
          onClear={f.genres.length ? () => onChange({ genres: [] }) : undefined}
        >
          <div className="flex flex-wrap gap-2">
            {[...genres, ...hiddenSelected].map((g) => (
              <Chip key={g.name} active={f.genres.includes(g.name)} count={g.count} onClick={() => toggleGenre(g.name)}>
                {g.name}
              </Chip>
            ))}
          </div>
          {stats.genres.length > GENRES_COLLAPSED && (
            <button type="button" onClick={() => setShowAllGenres((v) => !v)}
              className="mt-2 min-h-9 text-sm font-medium text-value hover:underline pointer-coarse:min-h-11">
              {showAllGenres ? 'Ver menos' : `Ver los ${stats.genres.length} géneros`}
            </button>
          )}
          {f.genres.length > 1 && <p className="mt-1 text-xs text-slate-500">Se muestran juegos con cualquiera de los géneros elegidos.</p>}
        </FilterSection>
      )}

      <FilterSection title="Otros">
        <Switch
          checked={f.hideWithoutHours}
          onChange={(hideWithoutHours) => onChange({ hideWithoutHours })}
          label="Ocultar juegos sin duración"
          hint="Juegos sin datos de HowLongToBeat"
        />
        <Switch checked={f.favoritesOnly} onChange={(favoritesOnly) => onChange({ favoritesOnly })} label="Solo mis favoritos" />
      </FilterSection>

      <button
        type="button"
        onClick={onReset}
        disabled={activeCount === 0 && f.mode === DEFAULT_FILTERS.mode}
        className="mt-2 min-h-11 rounded-xl border border-ink-600 text-sm font-semibold text-slate-300 transition-colors hover:bg-ink-700 hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Restablecer filtros
      </button>
    </div>
  )
}

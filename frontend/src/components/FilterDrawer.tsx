import { useRef, useState, type ReactNode } from 'react'
import { useEscape, useScrollLock } from '../hooks/useScrollLock'
import { useI18n } from '../i18n'
import { XIcon } from './Icons'

/**
 * Bottom sheet para móvil: se arrastra hacia abajo para cerrar, respeta el safe area inferior
 * y mantiene fijo el botón de "Ver resultados".
 */
export function FilterDrawer({ open, onClose, resultCount, children }: {
  open: boolean
  onClose: () => void
  resultCount: number
  children: ReactNode
}) {
  const { t, locale } = useI18n()
  const [dragY, setDragY] = useState(0)
  const startY = useRef<number | null>(null)
  useScrollLock(open)
  useEscape(open, onClose)

  if (!open) return null

  const endDrag = () => {
    if (dragY > 110) onClose()
    setDragY(0)
    startY.current = null
  }

  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label={t.results.filters}>
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] animate-sheet-up flex-col rounded-t-3xl border-t border-ink-600 bg-ink-850 shadow-2xl"
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: startY.current == null ? 'transform 200ms ease-out' : 'none' }}
      >
        {/* Zona de arrastre */}
        <div
          className="flex shrink-0 touch-none flex-col items-center px-4 pt-2"
          onPointerDown={(e) => { startY.current = e.clientY; (e.target as HTMLElement).setPointerCapture(e.pointerId) }}
          onPointerMove={(e) => { if (startY.current != null) setDragY(Math.max(0, e.clientY - startY.current)) }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="mb-1 h-1.5 w-10 rounded-full bg-ink-500" />
          <div className="flex w-full items-center justify-between">
            <h2 className="text-lg font-bold text-white">{t.results.filters}</h2>
            <button type="button" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} aria-label={t.results.closeFilters} className="-mr-2 flex size-11 items-center justify-center rounded-full text-slate-400 hover:bg-ink-700 hover:text-white">
              <XIcon />
            </button>
          </div>
        </div>

        <div className="thin-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>

        <div className="shrink-0 border-t border-ink-700 bg-ink-850 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onClose} className="min-h-12 w-full rounded-xl bg-value-strong font-bold text-ink-950 active:scale-[0.99]">
            {t.results.showResults(resultCount.toLocaleString(locale), resultCount)}
          </button>
        </div>
      </div>
    </div>
  )
}

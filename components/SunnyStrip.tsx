'use client'

/**
 * SunnyStrip — bande horizontale de terrasses ensoleillées recommandées.
 * Réutilisée à deux endroits :
 *   • au-dessus de la barre de recherche : « ☀ Au soleil maintenant »
 *   • au-dessus d'une fiche : « Plus ensoleillées dans le quartier »
 * Chaque chip = parasol + nom + note /10 colorée.
 */

import type { Place } from '@/types'
import { sunNote10, noteColor } from '@/lib/sunNote'

interface Props {
  title: string
  items: Place[]
  onSelect: (p: Place) => void
  compact?: boolean
}

function arrLabel(p: Place): string {
  const cp = p.address?.match(/\b75(\d{3})\b/)
  const arr = p.arrondissement ?? (cp ? parseInt(cp[1]) : null)
  if (arr) return `${arr}${arr === 1 ? 'er' : 'e'}`
  return (p.address?.split(',')[0] ?? '').trim()
}

export default function SunnyStrip({ title, items, onSelect, compact }: Props) {
  if (items.length === 0) return null
  // Tailles : compact (au-dessus de la recherche) plus petit que la version fiche
  const D = compact
    ? { chipW: 132, pad: '6px 8px', gap: 7, badge: 30, num: 12, slash: 6.5, name: 11, meta: 9.5, title: 11, titleEmoji: 11 }
    : { chipW: 168, pad: '9px 11px', gap: 9, badge: 38, num: 14, slash: 7.5, name: 12.5, meta: 10.5, title: 11.5, titleEmoji: 12.5 }
  return (
    <div>
      <div
        className="flex items-center gap-1.5 px-1"
        style={{ marginBottom: compact ? 4 : 6, fontFamily: 'var(--font-outfit)' }}
      >
        <span style={{ fontSize: D.titleEmoji }}>☀️</span>
        <span style={{ fontSize: D.title, fontWeight: 800, letterSpacing: '-0.01em', color: '#1F3A5F' }}>
          {title}
        </span>
      </div>
      <div
        className="flex overflow-x-auto scrollbar-none"
        style={{ gap: compact ? 7 : 8, paddingBottom: 2, scrollSnapType: 'x proximity' }}
      >
        {items.map(p => {
          const note = sunNote10(p.currentScore)
          const col = noteColor(note)
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="shrink-0 text-left active:scale-[0.96] transition-transform"
              style={{
                scrollSnapAlign: 'start',
                width: D.chipW,
                background: '#ffffff',
                border: '1px solid rgba(31,58,95,0.10)',
                borderRadius: 13,
                padding: D.pad,
                boxShadow: '0 2px 8px rgba(31,58,95,0.06)',
                display: 'flex', alignItems: 'center', gap: D.gap,
              }}
            >
              {/* Pastille note /10 */}
              <span
                className="shrink-0 flex flex-col items-center justify-center"
                style={{
                  width: D.badge, height: D.badge, borderRadius: 10,
                  background: `${col}22`, border: `1.5px solid ${col}`,
                  lineHeight: 1,
                }}
              >
                <span style={{ fontSize: D.num, fontWeight: 800, color: col, fontFamily: 'var(--font-outfit)' }}>{note}</span>
                <span style={{ fontSize: D.slash, fontWeight: 700, color: col, opacity: 0.8 }}>/10</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate" style={{ fontSize: D.name, fontWeight: 700, color: '#1F3A5F', fontFamily: 'var(--font-outfit)' }}>
                  {p.name}
                </span>
                <span className="block truncate" style={{ fontSize: D.meta, color: 'rgba(31,58,95,0.55)', fontFamily: 'var(--font-outfit)' }}>
                  {arrLabel(p)}{p.google_rating ? ` · ★ ${p.google_rating.toFixed(1)}` : ''}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

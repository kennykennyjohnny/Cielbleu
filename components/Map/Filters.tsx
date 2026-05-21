'use client'

import type { FilterType } from '@/types'

const FILTERS: { id: FilterType; label: string; icon: string }[] = [
  { id: 'sun',        label: 'Au soleil', icon: '☀️' },
  { id: 'bar',        label: 'Bars',      icon: '🍺' },
  { id: 'restaurant', label: 'Restos',    icon: '🍽️' },
  { id: 'park',       label: 'Parcs',     icon: '🌳' },
  { id: 'fontaine',   label: 'Eau',       icon: '💧' },
  { id: 'sanisette',  label: 'WC',        icon: '🚻' },
]

// DA v2 — 2 états actifs seulement
// "Au soleil" → on-gold (gold-15 bg + gold border + navy text)
// Tous les autres → on-navy (navy bg + white text)
function activeStyle(id: FilterType) {
  if (id === 'sun') return {
    background: 'rgba(237,193,69,0.15)',
    color: '#1F3A5F',
    border: '1.5px solid rgba(237,193,69,0.55)',
    boxShadow: '0 3px 10px rgba(237,193,69,0.22)',
  }
  return {
    background: '#1F3A5F',
    color: '#ffffff',
    border: '1.5px solid #1F3A5F',
    boxShadow: '0 3px 10px rgba(31,58,95,0.22)',
  }
}

interface FiltersProps {
  activeFilters: FilterType[]
  onToggle: (filter: FilterType) => void
  compact?: boolean
}

export default function Filters({ activeFilters, onToggle, compact = false }: FiltersProps) {
  return (
    <div
      role="group" aria-label="Filtres rapides"
      className="overflow-x-auto scrollbar-none"
      style={{ paddingLeft: compact ? 10 : 12, paddingRight: compact ? 10 : 12 }}
    >
      <div className="flex items-center min-w-max" style={{ gap: compact ? 6 : 8 }}>
        {FILTERS.map(({ id, label, icon }) => {
          const isActive = activeFilters.includes(id)
          const s = isActive ? activeStyle(id) : null
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              aria-pressed={isActive}
              aria-label={`Filtre ${label}${isActive ? ' actif' : ''}`}
              className="inline-flex items-center whitespace-nowrap select-none transition-all duration-150 active:scale-[0.94]"
              style={{
                gap: 5,
                height: compact ? 28 : 34,
                paddingLeft: compact ? 8 : 12,
                paddingRight: compact ? 10 : 14,
                borderRadius: 999,
                fontSize: compact ? 11.5 : 12.5,
                fontWeight: 700,
                color: isActive ? s!.color : 'rgba(31,58,95,0.60)',
                background: isActive ? s!.background : 'rgba(255,255,255,0.90)',
                border: isActive ? s!.border : '1.5px solid rgba(31,58,95,0.12)',
                boxShadow: isActive ? s!.boxShadow : '0 1px 3px rgba(31,58,95,0.07)',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: compact ? 12 : 14, lineHeight: 1 }}>{icon}</span>
              <span style={{ letterSpacing: '-0.01em' }}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

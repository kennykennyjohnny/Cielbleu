'use client'

import type { FilterType } from '@/types'

// Café et Ouvert retirés (trop instables)
const FILTERS: { id: FilterType; label: string; icon: string }[] = [
  { id: 'sun',        label: 'Au soleil', icon: '☀️' },
  { id: 'bar',        label: 'Bars',      icon: '🍺' },
  { id: 'restaurant', label: 'Restos',    icon: '🍽️' },
  { id: 'park',       label: 'Parcs',     icon: '🌳' },
  { id: 'fontaine',   label: 'Eau',       icon: '💧' },
  { id: 'sanisette',  label: 'WC',        icon: '🚻' },
]

function activeStyle(id: FilterType): React.CSSProperties {
  if (id === 'sun') return {
    background: 'rgba(237,193,69,0.22)',
    color: '#1F3A5F',
    border: '1.5px solid rgba(237,193,69,0.65)',
    boxShadow: '0 3px 12px rgba(237,193,69,0.28)',
  }
  if (id === 'fontaine') return {
    background: 'rgba(58,134,255,0.16)',
    color: '#1F3A5F',
    border: '1.5px solid rgba(58,134,255,0.50)',
    boxShadow: '0 3px 12px rgba(58,134,255,0.18)',
  }
  if (id === 'sanisette') return {
    background: 'rgba(123,97,255,0.16)',
    color: '#1F3A5F',
    border: '1.5px solid rgba(123,97,255,0.50)',
    boxShadow: '0 3px 12px rgba(123,97,255,0.18)',
  }
  // bar, restaurant, park → navy plein
  return {
    background: '#1F3A5F',
    color: '#ffffff',
    border: '1.5px solid #1F3A5F',
    boxShadow: '0 3px 12px rgba(31,58,95,0.24)',
  }
}

interface FiltersProps {
  activeFilters: FilterType[]
  onToggle: (filter: FilterType) => void
  compact?: boolean
}

export default function Filters({ activeFilters, onToggle }: FiltersProps) {
  return (
    <div
      role="group"
      aria-label="Filtres rapides"
      className="overflow-x-auto scrollbar-none"
      style={{ paddingLeft: 12, paddingRight: 12, paddingBottom: 2 }}
    >
      <div className="flex items-center min-w-max" style={{ gap: 6 }}>
        {FILTERS.map(({ id, label, icon }) => {
          const isActive = activeFilters.includes(id)
          const s = isActive ? activeStyle(id) : null

          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              aria-pressed={isActive}
              aria-label={`${label}${isActive ? ' (actif)' : ''}`}
              className="inline-flex items-center whitespace-nowrap select-none transition-all duration-150 active:scale-[0.93]"
              style={{
                gap: 5,
                height: 34,
                paddingLeft: 11,
                paddingRight: 13,
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 700,
                fontFamily: 'var(--font-outfit)',
                letterSpacing: '-0.01em',
                cursor: 'pointer',
                color:      isActive ? s!.color      : 'rgba(31,58,95,0.55)',
                background: isActive ? s!.background : 'rgba(31,58,95,0.05)',
                border:     isActive ? s!.border     : '1.5px solid rgba(31,58,95,0.10)',
                boxShadow:  isActive ? s!.boxShadow  : 'none',
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

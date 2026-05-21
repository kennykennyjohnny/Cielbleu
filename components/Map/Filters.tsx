'use client'

import type { FilterType } from '@/types'

type Tone = 'sun' | 'green' | 'navy' | 'amber' | 'emerald' | 'violet'

const FILTERS: { id: FilterType; label: string; icon: string; tone: Tone }[] = [
  { id: 'sun',        label: 'Au soleil', icon: '☀️', tone: 'sun'     },
  { id: 'open',       label: 'Ouvert',    icon: '🟢', tone: 'green'   },
  { id: 'bar',        label: 'Bars',      icon: '🍺', tone: 'navy'    },
  { id: 'restaurant', label: 'Restos',    icon: '🍽️', tone: 'amber'   },
  { id: 'cafe',       label: 'Cafés',     icon: '☕', tone: 'amber'   },
  { id: 'park',       label: 'Parcs',     icon: '🌳', tone: 'emerald' },
]

const ACTIVE_STYLES: Record<Tone, { bg: string; color: string; border: string; shadow: string }> = {
  sun:     { bg: 'linear-gradient(145deg,#ffe566 0%,#ffb703 100%)', color: '#6b3d00', border: 'rgba(255,183,3,0.50)', shadow: '0 3px 10px rgba(255,183,3,0.30)' },
  green:   { bg: 'linear-gradient(145deg,#b7f5c2 0%,#3ec95d 100%)', color: '#0d4a1e', border: 'rgba(62,201,93,0.45)',  shadow: '0 3px 10px rgba(62,201,93,0.22)' },
  navy:    { bg: 'linear-gradient(145deg,#3d6be4 0%,#1a3fa7 100%)', color: '#ffffff', border: 'rgba(58,107,228,0.35)', shadow: '0 3px 10px rgba(26,63,167,0.24)' },
  amber:   { bg: 'linear-gradient(145deg,#ffe8b2 0%,#f59e0b 100%)', color: '#5c3500', border: 'rgba(245,158,11,0.45)', shadow: '0 3px 10px rgba(245,158,11,0.22)' },
  emerald: { bg: 'linear-gradient(145deg,#a7f3d0 0%,#059669 100%)', color: '#022c22', border: 'rgba(5,150,105,0.40)',  shadow: '0 3px 10px rgba(5,150,105,0.22)' },
  violet:  { bg: 'linear-gradient(145deg,#ddd6fe 0%,#7c3aed 100%)', color: '#ffffff', border: 'rgba(124,58,237,0.35)', shadow: '0 3px 10px rgba(124,58,237,0.22)' },
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
        {FILTERS.map(({ id, label, icon, tone }) => {
          const isActive = activeFilters.includes(id)
          const s = ACTIVE_STYLES[tone]
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
                color: isActive ? s.color : '#4a5568',
                background: isActive ? s.bg : 'rgba(255,255,255,0.90)',
                border: `1.5px solid ${isActive ? s.border : 'rgba(20,32,51,0.11)'}`,
                boxShadow: isActive ? s.shadow : '0 1px 3px rgba(11,31,58,0.07)',
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

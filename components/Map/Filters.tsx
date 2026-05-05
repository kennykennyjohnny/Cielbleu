'use client'

import type { FilterType } from '@/types'

const FILTERS: { id: FilterType; label: string; icon: string; tone: 'sun' | 'sky' | 'neutral' }[] = [
  { id: 'sun',        label: 'Au soleil',  icon: '☀', tone: 'sun'     },
  { id: 'open',       label: 'Ouvert',     icon: '●', tone: 'sky'     },
  { id: 'bar',        label: 'Bars',       icon: '🍺', tone: 'neutral' },
  { id: 'restaurant', label: 'Restos',     icon: '🍽', tone: 'neutral' },
  { id: 'cafe',       label: 'Cafés',      icon: '☕', tone: 'neutral' },
  { id: 'park',       label: 'Parcs',      icon: '🌳', tone: 'neutral' },
]

interface FiltersProps {
  activeFilters: FilterType[]
  onToggle: (filter: FilterType) => void
}

export default function Filters({ activeFilters, onToggle }: FiltersProps) {
  return (
    <div role="group" aria-label="Filtres rapides" className="px-3 overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-2 min-w-max">
        {FILTERS.map(({ id, label, icon, tone }) => {
          const isActive = activeFilters.includes(id)
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              aria-pressed={isActive}
              aria-label={`Filtre ${label}${isActive ? ' actif' : ''}`}
              className="inline-flex items-center gap-1.5 rounded-full font-outfit font-bold whitespace-nowrap transition-all duration-150 active:scale-[0.96] select-none"
              style={{
                height: 36,
                paddingLeft: 12,
                paddingRight: 14,
                fontSize: 12.5,
                color: isActive
                  ? tone === 'sun' ? '#0b1f3a'
                  : tone === 'sky' ? '#1769c2'
                  : '#0b1f3a'
                  : 'var(--color-text-secondary)',
                background: isActive
                  ? tone === 'sun' ? 'linear-gradient(180deg, #ffd76a 0%, #ffb703 100%)'
                  : tone === 'sky' ? 'var(--color-sky-100)'
                  : '#ffffff'
                  : '#ffffff',
                border: isActive && tone === 'sun'
                  ? '1px solid rgba(255,183,3,0.62)'
                  : isActive && tone === 'sky'
                  ? '1px solid rgba(78,163,255,0.32)'
                  : '1px solid rgba(20,32,51,0.10)',
                boxShadow: isActive && tone === 'sun'
                  ? '0 8px 18px rgba(255,183,3,0.28)'
                  : '0 1px 0 rgba(255,255,255,0.6) inset',
              }}
            >
              <span aria-hidden="true" className="text-[14px] leading-none">{icon}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

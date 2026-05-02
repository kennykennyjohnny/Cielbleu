'use client'

import type { FilterType } from '@/types'

const FILTERS: { id: FilterType; label: string; icon: string }[] = [
  { id: 'sun', label: 'Au soleil', icon: '☀' },
  { id: 'bar', label: 'Bars', icon: '🍺' },
  { id: 'restaurant', label: 'Restos', icon: '🍽' },
  { id: 'cafe', label: 'Cafés', icon: '☕' },
  { id: 'park', label: 'Parcs', icon: '🌳' },
]

interface FiltersProps {
  activeFilters: FilterType[]
  onToggle: (filter: FilterType) => void
}

export default function Filters({ activeFilters, onToggle }: FiltersProps) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none px-4 py-1">
      {FILTERS.map(({ id, label, icon }) => {
        const isActive = activeFilters.includes(id)
        return (
          <button
            key={id}
            onClick={() => onToggle(id)}
            className={[
              'shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2',
              'text-sm font-medium shadow-sm transition-all duration-150',
              'font-outfit active:scale-95',
              isActive
                ? id === 'sun'
                  ? 'bg-soleil text-nuit border-2 border-soleil'
                  : 'bg-ciel text-white border-2 border-ciel'
                : 'bg-white text-nuit border-2 border-transparent',
            ].join(' ')}
          >
            <span aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

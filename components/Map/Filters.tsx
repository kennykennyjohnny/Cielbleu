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
    <div role="group" aria-label="Filtres" className="flex justify-center px-3 overflow-x-auto scrollbar-none">
      <div className="inline-flex items-center gap-1 bg-surface-2 rounded-2xl p-1">
        {FILTERS.map(({ id, label, icon }) => {
          const isActive = activeFilters.includes(id)
          const isSun = id === 'sun'
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              aria-pressed={isActive}
              className={[
                'flex items-center gap-1 rounded-xl px-3 py-1.5',
                'text-[12.5px] font-semibold font-outfit transition-all duration-150 active:scale-95 select-none whitespace-nowrap',
                isActive
                  ? isSun
                    ? 'bg-sun-500 text-text-primary shadow-sm'
                    : 'bg-sky-500 text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/80',
              ].join(' ')}
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

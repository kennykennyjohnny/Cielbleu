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
    <div className="flex justify-center px-3">
      <div className="inline-flex items-center gap-1 bg-nuit/[0.03] rounded-2xl p-1">
        {FILTERS.map(({ id, label, icon }) => {
          const isActive = activeFilters.includes(id)
          return (
            <button
              key={id}
              onClick={() => onToggle(id)}
              className={[
                'flex items-center gap-1 rounded-xl px-3 py-1.5',
                'text-[12.5px] font-semibold font-outfit transition-all duration-150 active:scale-95 select-none whitespace-nowrap',
                isActive
                  ? id === 'sun'
                    ? 'bg-soleil text-nuit shadow-sm'
                    : 'bg-ciel text-white shadow-sm'
                  : 'text-nuit/70 hover:text-nuit hover:bg-white/70',
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

'use client'

import { useState, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import Filters from '@/components/Map/Filters'
import PlacePreview from '@/components/Map/PlacePreview'
import type { Place, FilterType } from '@/types'

// Mapbox ne fonctionne pas côté serveur
const MapView = dynamic(() => import('@/components/Map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-creme">
      <div className="flex flex-col items-center gap-3">
        <span className="text-4xl animate-spin" style={{ animationDuration: '2s' }}>☀</span>
        <span className="text-sm text-gris font-outfit">Chargement de la carte...</span>
      </div>
    </div>
  ),
})

export default function HomePage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [displayedPlaces, setDisplayedPlaces] = useState<Place[]>([])
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [activeFilters, setActiveFilters] = useState<FilterType[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  // Chargement des lieux depuis Supabase
  useEffect(() => {
    async function loadPlaces() {
      const now = new Date()
      const month = now.getMonth() + 1
      const h = now.getHours()
      const m = now.getMinutes() < 30 ? '00' : '30'
      const timeSlot = `${String(h).padStart(2, '0')}:${m}`

      const { data, error } = await supabase
        .from('places')
        .select(`
          *,
          sun_scores!inner(score, time_slot, month)
        `)
        .not('lat', 'is', null)
        .not('lng', 'is', null)

      if (error) {
        console.error('Erreur chargement lieux:', error.message)
        return
      }

      if (!data) return

      const enriched: Place[] = data.map((place) => {
        const scores = place.sun_scores ?? []
        const currentScore =
          scores.find(
            (s: { month: number; time_slot: string; score: number }) =>
              s.month === month && s.time_slot === timeSlot
          )?.score ?? null

        return {
          ...place,
          sun_scores: undefined,
          currentScore: currentScore ?? 3,
        }
      })

      setPlaces(enriched)
    }

    loadPlaces()
  }, [])

  // Filtrage réactif
  useEffect(() => {
    let result = places

    const typeFilters = activeFilters.filter((f): f is 'bar' | 'restaurant' | 'cafe' | 'park' =>
      ['bar', 'restaurant', 'cafe', 'park'].includes(f)
    )

    if (typeFilters.length > 0) {
      result = result.filter((p) => typeFilters.includes(p.type))
    }

    if (activeFilters.includes('sun')) {
      result = result.filter((p) => (p.currentScore ?? 0) >= 4)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.address.toLowerCase().includes(q)
      )
    }

    setDisplayedPlaces(result)
  }, [places, activeFilters, searchQuery])

  const toggleFilter = useCallback((filter: FilterType) => {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    )
  }, [])

  const handlePlaceSelect = useCallback((place: Place | null) => {
    setSelectedPlace(place)
  }, [])

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* Carte plein écran */}
      <div className="absolute inset-0">
        <MapView
          places={displayedPlaces}
          selectedPlace={selectedPlace}
          onPlaceSelect={handlePlaceSelect}
        />
      </div>

      {/* Header flottant */}
      <header className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="pointer-events-auto px-4 pt-safe pt-4">
          {/* Logo */}
          <div className="mb-3 flex items-center gap-1.5">
            <span className="font-playfair text-2xl font-bold text-nuit tracking-tight">
              CielBleu
            </span>
            <span className="text-soleil text-xl leading-none">☀</span>
          </div>

          {/* Barre de recherche */}
          <input
            type="text"
            placeholder="Quartier, adresse, bar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-2xl border-0 bg-white px-4 py-3 text-sm text-nuit shadow-lg outline-none placeholder:text-gris focus:ring-2 focus:ring-ciel font-outfit"
          />
        </div>

        {/* Filtres */}
        <div className="pointer-events-auto mt-3 pb-2">
          <Filters activeFilters={activeFilters} onToggle={toggleFilter} />
        </div>
      </header>

      {/* Preview du lieu sélectionné */}
      {selectedPlace && (
        <PlacePreview
          place={selectedPlace}
          onClose={() => setSelectedPlace(null)}
        />
      )}

      {/* Compteur de lieux (debug / communauté) */}
      {displayedPlaces.length > 0 && !selectedPlace && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-outfit font-medium text-gris shadow-md">
            {displayedPlaces.length} terrasse{displayedPlaces.length > 1 ? 's' : ''}
          </span>
        </div>
      )}
    </main>
  )
}

'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Filters from '@/components/Map/Filters'
import PlacePreview from '@/components/Map/PlacePreview'
import type { Place, FilterType } from '@/types'

const MapView = dynamic(() => import('@/components/Map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-creme">
      <div className="flex flex-col items-center gap-3">
        <span className="text-5xl animate-spin" style={{ animationDuration: '2.4s' }}>☀</span>
        <span className="text-sm text-gris font-outfit tracking-wide">Le ciel se découvre…</span>
      </div>
    </div>
  ),
})

const TODAY_LABEL = (() => {
  const d = new Date()
  const formatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return formatter.format(d)
})()

export default function HomePage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [activeFilters, setActiveFilters] = useState<FilterType[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadPlaces() {
      const now = new Date()
      const month = now.getMonth() + 1
      const h = now.getHours()
      const m = now.getMinutes() < 30 ? '00' : '30'
      const timeSlot = `${String(h).padStart(2, '0')}:${m}`

      const { data, error } = await supabase
        .from('places')
        .select(`*, sun_scores(score, time_slot, month)`)
        .not('lat', 'is', null)
        .not('lng', 'is', null)

      if (error) {
        console.error('Erreur chargement lieux:', error.message)
        setLoading(false)
        return
      }
      if (!data) {
        setLoading(false)
        return
      }

      const enriched: Place[] = data.map((place) => {
        const scores = place.sun_scores ?? []
        const currentScore =
          scores.find(
            (s: { month: number; time_slot: string; score: number }) =>
              s.month === month && s.time_slot === timeSlot
          )?.score ?? null

        return { ...place, sun_scores: undefined, currentScore: currentScore ?? 3 }
      })

      setPlaces(enriched)
      setLoading(false)
    }

    loadPlaces()
  }, [])

  // Filtrage réactif
  const displayedPlaces = useMemo(() => {
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
        (p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
      )
    }

    return result
  }, [places, activeFilters, searchQuery])

  const sunnyCount = useMemo(
    () => displayedPlaces.filter((p) => (p.currentScore ?? 0) >= 4).length,
    [displayedPlaces]
  )

  const toggleFilter = useCallback((filter: FilterType) => {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    )
  }, [])

  const handlePlaceSelect = useCallback((place: Place | null) => {
    setSelectedPlace(place)
  }, [])

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-creme">
      {/* Carte plein écran */}
      <div className="absolute inset-0">
        <MapView
          places={displayedPlaces}
          selectedPlace={selectedPlace}
          onPlaceSelect={handlePlaceSelect}
        />
      </div>

      {/* Voile dégradé en haut pour lisibilité */}
      <div className="absolute top-0 left-0 right-0 h-44 bg-gradient-to-b from-creme/95 via-creme/60 to-creme/0 pointer-events-none z-10" />

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="pointer-events-auto px-4 pt-5 sm:pt-6">
          {/* Top row : logo + date */}
          <div className="flex items-baseline justify-between mb-4">
            <div className="flex items-baseline gap-1">
              <span className="font-playfair italic text-3xl font-bold text-nuit tracking-tight leading-none">
                Ciel
              </span>
              <span className="font-playfair italic text-3xl font-bold text-ciel tracking-tight leading-none">
                Bleu
              </span>
              <span className="ml-1 text-soleil text-xl leading-none translate-y-[-2px] inline-block">☀</span>
            </div>
            <span className="text-[11px] font-outfit text-gris uppercase tracking-widest first-letter:capitalize">
              {TODAY_LABEL}
            </span>
          </div>

          {/* Stats */}
          {!loading && (
            <p className="font-outfit text-sm text-nuit/80 mb-3 leading-snug">
              <span className="font-semibold text-nuit">{displayedPlaces.length}</span>{' '}
              {displayedPlaces.length > 1 ? 'terrasses' : 'terrasse'}
              {sunnyCount > 0 && (
                <>
                  {' '}·{' '}
                  <span className="text-soleil font-semibold">{sunnyCount} au plein soleil</span>
                </>
              )}
            </p>
          )}

          {/* Search */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gris pointer-events-none"
              strokeWidth={2.2}
            />
            <input
              type="text"
              placeholder="Quartier, adresse, bar…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border-0 bg-white pl-11 pr-10 py-3.5 text-sm text-nuit shadow-[0_4px_16px_rgba(27,40,56,0.10)] outline-none placeholder:text-gris focus:ring-2 focus:ring-ciel/60 font-outfit"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label="Effacer"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-gris hover:bg-creme transition"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
            )}
          </div>
        </div>

        {/* Filtres */}
        <div className="pointer-events-auto mt-3 pb-2">
          <Filters activeFilters={activeFilters} onToggle={toggleFilter} />
        </div>
      </header>

      {/* État vide */}
      {!loading && displayedPlaces.length === 0 && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none flex justify-center">
          <div className="rounded-2xl bg-white/95 px-6 py-4 shadow-lg max-w-xs text-center">
            <span className="text-3xl">🌥</span>
            <p className="mt-2 text-sm text-nuit font-outfit font-medium">
              Aucune terrasse trouvée
            </p>
            <p className="text-xs text-gris font-outfit mt-1">
              Essaie de désactiver un filtre ou de modifier ta recherche.
            </p>
          </div>
        </div>
      )}

      {/* Preview */}
      {selectedPlace && (
        <PlacePreview place={selectedPlace} onClose={() => setSelectedPlace(null)} />
      )}
    </main>
  )
}

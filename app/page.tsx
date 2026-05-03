'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Filters from '@/components/Map/Filters'
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
  const router = useRouter()
  const [places, setPlaces] = useState<Place[]>([])
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

      // 1. Places (sans les scores) — payload léger
      const { data: rawPlaces, error: errPlaces } = await supabase
        .from('places')
        .select('*')
        .not('lat', 'is', null)
        .not('lng', 'is', null)
        .limit(10000)   // PostgREST default = 1000 ; on force 10k pour voir tous les lieux

      if (errPlaces) {
        console.error('Erreur chargement lieux:', errPlaces.message)
        setLoading(false)
        return
      }
      if (!rawPlaces) {
        setLoading(false)
        return
      }

      // 2. Scores du créneau actuel uniquement (1 ligne par place)
      const { data: nowScores } = await supabase
        .from('sun_scores')
        .select('place_id, score')
        .eq('month', month)
        .eq('time_slot', timeSlot)

      const scoreByPlace = new Map<string, number>()
      for (const r of nowScores ?? []) scoreByPlace.set(r.place_id, r.score)

      const enriched: Place[] = rawPlaces.map((p) => ({
        ...p,
        currentScore: scoreByPlace.get(p.id) ?? 3,
      }))

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
    if (place) router.push(`/place/${place.id}`)
  }, [router])

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-creme">
      {/* Carte plein écran */}
      <div className="absolute inset-0">
        <MapView
          places={displayedPlaces}
          onPlaceSelect={handlePlaceSelect}
        />
      </div>

      {/* Voile dégradé top */}
      <div className="absolute top-0 left-0 right-0 h-36 bg-gradient-to-b from-white/80 via-white/30 to-transparent pointer-events-none z-10" />

      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
        <div className="pt-5 pb-2 flex flex-col items-center gap-1">
          <div className="flex items-baseline gap-0.5 pointer-events-auto">
            <span className="font-playfair italic text-[30px] font-bold text-nuit tracking-tight leading-none">Ciel</span>
            <span className="font-playfair italic text-[30px] font-bold text-ciel tracking-tight leading-none">Bleu</span>
            <span className="ml-1.5 text-soleil text-xl leading-none -translate-y-0.5 inline-block">☀</span>
          </div>
          <span className="text-[10px] font-outfit text-gris/80 uppercase tracking-[0.2em] first-letter:capitalize">
            {TODAY_LABEL}
          </span>
        </div>
      </header>

      {/* Stats pilule */}
      {!loading && (
        <div className="absolute top-[90px] left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="rounded-full bg-white/90 backdrop-blur-md shadow-md border border-nuit/6 px-4 py-1.5 flex items-center gap-2.5">
            <span className="font-outfit text-[12.5px] text-nuit">
              <span className="font-bold">{displayedPlaces.length}</span>
              {' '}{displayedPlaces.length > 1 ? 'terrasses' : 'terrasse'}
            </span>
            {sunnyCount > 0 && (
              <>
                <span className="w-px h-3 bg-nuit/15" />
                <span className="font-outfit text-[12.5px] font-bold flex items-center gap-1" style={{ color: '#FF8C00' }}>
                  ☀ {sunnyCount} au soleil
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* État vide */}
      {!loading && displayedPlaces.length === 0 && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none flex justify-center px-6">
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

      {/* Voile dégradé bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-white/90 via-white/40 to-transparent pointer-events-none z-10" />

      {/* Bottom bar : filtres + search */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Filtres horizontaux */}
        <div className="pointer-events-auto pb-2.5">
          <Filters activeFilters={activeFilters} onToggle={toggleFilter} />
        </div>

        {/* Search bar collée en bas */}
        <div className="pointer-events-auto px-4 pb-4">
          <div className="relative max-w-md mx-auto">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gris pointer-events-none"
              strokeWidth={2.4}
            />
            <input
              type="text"
              placeholder="Bar, quartier, adresse…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-full border-0 bg-white/95 backdrop-blur-md pl-10 pr-10 py-3.5 text-[14px] text-nuit shadow-[0_8px_32px_rgba(27,40,56,0.16)] outline-none placeholder:text-gris/70 focus:ring-2 focus:ring-ciel/50 font-outfit"
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
      </div>

    </main>
  )
}

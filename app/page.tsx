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

      {/* ── Header app bleu CielBleu ── */}
      <header className="absolute top-0 left-0 right-0 z-20">
        <div
          className="bg-ciel shadow-[0_2px_24px_rgba(58,134,255,0.55)]"
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 14px)', paddingBottom: 11 }}
        >
          <div className="flex items-center justify-between px-5">
            {/* Logo */}
            <div className="flex items-baseline gap-0">
              <span className="font-playfair italic text-[27px] font-bold text-white tracking-tight leading-none">Ciel</span>
              <span className="font-playfair italic text-[27px] font-bold text-soleil tracking-tight leading-none">Bleu</span>
              <span className="ml-1 text-white/90 text-[18px] leading-none -translate-y-0.5 inline-block">☀</span>
            </div>

            {/* Stats inline */}
            {!loading && (
              <div className="flex items-center gap-2">
                <span className="font-outfit text-[12px] text-white/75">
                  <span className="font-bold text-white">{displayedPlaces.length}</span>
                  {' '}{displayedPlaces.length > 1 ? 'terrasses' : 'terrasse'}
                </span>
                {sunnyCount > 0 && (
                  <>
                    <span className="w-px h-3 bg-white/30" />
                    <span className="font-outfit text-[12px] font-bold flex items-center gap-1 text-soleil">
                      ☀ {sunnyCount}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <p className="text-[9.5px] text-center font-outfit text-white/50 uppercase tracking-[0.22em] mt-0.5 first-letter:capitalize">
            {TODAY_LABEL}
          </p>
        </div>
        {/* Sweep dégradé bleu → transparent */}
        <div className="h-8 bg-gradient-to-b from-ciel/30 to-transparent pointer-events-none" />
      </header>

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

      {/* ─── Floating bottom card ─── */}
      <div
        className="absolute bottom-0 inset-x-0 z-20 pointer-events-none"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
      >
        <div className="pointer-events-auto mx-4 mb-2 rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(255,253,247,0.96)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(27,40,56,0.18), 0 1px 4px rgba(27,40,56,0.06)',
          }}
        >
          {/* Bandeau bleu en haut de la card */}
          <div className="h-1 bg-ciel rounded-t-3xl" />

          {/* Filtres centrés */}
          <div className="pt-3 pb-2.5">
            <Filters activeFilters={activeFilters} onToggle={toggleFilter} />
          </div>

          {/* Séparateur */}
          <div className="mx-4 h-px bg-nuit/5" />

          {/* Search */}
          <div className="px-4 py-3">
            <div className="relative">
              <Search
                size={15}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gris pointer-events-none"
                strokeWidth={2.5}
              />
              <input
                type="text"
                placeholder="Bar, quartier, adresse…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl bg-nuit/[0.04] pl-9 pr-9 py-2.5 text-[13.5px] text-nuit outline-none placeholder:text-gris/60 focus:ring-2 focus:ring-ciel/40 font-outfit transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Effacer"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-gris hover:bg-nuit/[0.08] transition"
                >
                  <X size={14} strokeWidth={2.2} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

    </main>
  )
}

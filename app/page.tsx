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
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <span className="text-5xl animate-spin text-sun-500" style={{ animationDuration: '2.4s' }}>☀</span>
        <span className="text-sm text-text-soft font-outfit tracking-wide">Le ciel se découvre…</span>
      </div>
    </div>
  ),
})

const TODAY_LABEL = (() => {
  const d = new Date()
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
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

      const { data: rawPlaces, error: errPlaces } = await supabase
        .from('places').select('*')
        .not('lat', 'is', null).not('lng', 'is', null).limit(10000)

      if (errPlaces) { console.error('Erreur chargement lieux:', errPlaces.message); setLoading(false); return }
      if (!rawPlaces) { setLoading(false); return }

      const { data: nowScores } = await supabase
        .from('sun_scores').select('place_id, score')
        .eq('month', month).eq('time_slot', timeSlot)

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

  const displayedPlaces = useMemo(() => {
    let result = places
    const typeFilters = activeFilters.filter((f): f is 'bar' | 'restaurant' | 'cafe' | 'park' =>
      ['bar', 'restaurant', 'cafe', 'park'].includes(f)
    )
    if (typeFilters.length > 0) result = result.filter((p) => typeFilters.includes(p.type))
    if (activeFilters.includes('sun')) result = result.filter((p) => (p.currentScore ?? 0) >= 4)

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((p) => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q))
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
    <main className="relative h-dvh w-full overflow-hidden">
      {/* Carte plein écran */}
      <div className="absolute inset-0">
        <MapView places={displayedPlaces} onPlaceSelect={handlePlaceSelect} />
      </div>

      {/* ─── Top bar : brand-pill (gauche) + radar count (droite) ─── */}
      <header
        className="absolute top-0 inset-x-0 z-20 pointer-events-none"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
      >
        <div className="px-3 flex items-start justify-between gap-2 pointer-events-none">
          {/* Brand pill */}
          <div
            className="pointer-events-auto inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full"
            aria-label="CielBleu"
            style={{
              background: 'rgba(255,255,255,0.86)',
              border: '1px solid rgba(20,32,51,0.10)',
              boxShadow: '0 6px 22px rgba(11,31,58,0.10)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <span
              className="grid place-items-center w-7 h-7 rounded-full text-[14px]"
              style={{
                background: 'radial-gradient(circle at 36% 30%, #fff5a0 0%, #ffb703 60%, #f77f00 100%)',
                boxShadow: '0 6px 14px rgba(255,183,3,0.35)',
                color: '#0b1f3a',
              }}
              aria-hidden="true"
            >☀</span>
            <span className="font-fraunces font-extrabold text-[19px] tracking-[-0.04em] leading-none text-navy-900">
              CielBleu
            </span>
          </div>

          {/* Radar pill : nombre */}
          {!loading && displayedPlaces.length > 0 && (
            <div
              className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
              style={{
                background: 'rgba(255,255,255,0.86)',
                border: '1px solid rgba(20,32,51,0.10)',
                boxShadow: '0 6px 22px rgba(11,31,58,0.10)',
                backdropFilter: 'blur(16px)',
              }}
            >
              <span className="font-fraunces font-bold text-[14px] text-navy-900 leading-none">
                {displayedPlaces.length}
              </span>
              {sunnyCount > 0 && (
                <>
                  <span aria-hidden="true" className="w-1 h-1 rounded-full bg-text-soft/40" />
                  <span className="font-outfit font-bold text-[11.5px] text-sun-700 leading-none flex items-center gap-1">
                    <span aria-hidden="true">☀</span>
                    {sunnyCount}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Date subtile sous le brand pill */}
        <p className="mt-1.5 px-4 font-outfit text-[10px] uppercase tracking-[0.22em] text-text-soft pointer-events-none">
          {TODAY_LABEL}
        </p>
      </header>

      {/* État vide */}
      {!loading && displayedPlaces.length === 0 && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-10 pointer-events-none flex justify-center px-6">
          <div className="rounded-2xl bg-surface-0/95 px-6 py-4 shadow-lg max-w-xs text-center"
            style={{ border: '1px solid rgba(20,32,51,0.10)' }}>
            <span aria-hidden="true" className="text-3xl">🌥</span>
            <p className="mt-2 text-sm text-text-primary font-outfit font-bold">
              Aucune terrasse trouvée
            </p>
            <p className="text-xs text-text-soft font-outfit mt-1">
              Désactive un filtre ou modifie ta recherche.
            </p>
          </div>
        </div>
      )}

      {/* ─── Floating bottom card : filtres + search ─── */}
      <div
        className="absolute bottom-0 inset-x-0 z-20 pointer-events-none"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)' }}
      >
        <div
          className="pointer-events-auto mx-3 mb-2 rounded-3xl overflow-hidden"
          style={{
            background: 'rgba(255,252,243,0.94)',
            border: '1px solid rgba(20,32,51,0.10)',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 18px 50px rgba(11,31,58,0.16), 0 1px 4px rgba(11,31,58,0.06)',
          }}
        >
          {/* Filtres */}
          <div className="pt-2.5 pb-2">
            <Filters activeFilters={activeFilters} onToggle={toggleFilter} />
          </div>

          {/* Search */}
          <div className="px-3 pb-3">
            <div
              className="relative flex items-center gap-2 px-2 rounded-2xl"
              style={{
                background: '#ffffff',
                border: '1px solid rgba(20,32,51,0.10)',
                minHeight: 48,
              }}
            >
              <span
                className="w-9 h-9 grid place-items-center rounded-xl shrink-0"
                style={{ background: 'var(--color-sky-100)', color: 'var(--color-sky-700)' }}
                aria-hidden="true"
              >
                <Search size={15} strokeWidth={2.4} />
              </span>
              <input
                type="text"
                placeholder="Chercher un café, un quartier…"
                aria-label="Rechercher un lieu"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none font-outfit font-semibold text-[14px] text-text-primary placeholder:text-text-soft/85 placeholder:font-medium pr-2"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label="Effacer la recherche"
                  className="p-1.5 rounded-full text-text-soft hover:bg-surface-2 transition shrink-0"
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

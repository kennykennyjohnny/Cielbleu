'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Filters from '@/components/Map/Filters'
import PlacePageClient from '@/components/Map/PlacePageClient'
import type { Place, FilterType } from '@/types'

type SheetMode = 'peek' | 'half' | 'full'
const SHEET_HEIGHTS: Record<SheetMode, string> = { peek: '20vh', half: '58vh', full: '92dvh' }

function nowHalfHour(): number {
  const now = new Date()
  return Math.max(6, Math.min(23.5, now.getHours() + (now.getMinutes() >= 30 ? 0.5 : 0)))
}

const MapView = dynamic(() => import('@/components/Map/MapView'), {
  ssr: false,
  loading: () => (
    // Fond neutre crème pendant le chargement JS du bundle — disparaît vite
    <div className="absolute inset-0" style={{ background: '#fffcf3' }} />
  ),
})

const TODAY_LABEL = (() => {
  const d = new Date()
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
})()

export default function HomePage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [activeFilters, setActiveFilters] = useState<FilterType[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  // ── Lieu sélectionné (inline, sans navigation) ─────────────────────────
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [selectedScores, setSelectedScores] = useState<{ time_slot: string; score: number }[]>([])
  const [hour, setHour] = useState<number>(nowHalfHour)
  const [sheetMode, setSheetMode] = useState<SheetMode>('half')
  const [isDesktop, setIsDesktop] = useState(false)
  const dragRef = useRef<{ y: number; mode: SheetMode } | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

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
    if (activeFilters.includes('open')) {
      result = result.filter((p) => {
        if (!p.opening_hours) return true
        return (p.opening_hours as Record<string, unknown>).open_now !== false
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      const typeSyns: Record<string, string[]> = {
        bar:        ['bar', 'bars', 'bistrot', 'bistro', 'brasserie', 'pub'],
        restaurant: ['restaurant', 'resto', 'restos', 'restau', 'manger'],
        cafe:       ['café', 'cafe', 'cafés', 'coffee', 'brunch', 'salon de thé'],
        park:       ['parc', 'parcs', 'jardin', 'jardins', 'square'],
      }
      const sunSyns     = ['soleil', 'ensoleillé', 'ensoleillée', 'sunny']
      const terrassSyns = ['terrasse', 'terrasses', 'extérieur', 'exterieur', 'dehors']

      const matchedType = Object.entries(typeSyns).find(([, syns]) =>
        syns.some(s => q.includes(s))
      )?.[0]
      const wantsTerrasse = terrassSyns.some(s => q.includes(s))
      const wantsSun      = sunSyns.some(s => q.includes(s))

      // Retire les mots-clés "structure" pour ne garder que la partie nom/quartier
      let textQ = q
      for (const syns of [...Object.values(typeSyns), sunSyns, terrassSyns]) {
        for (const s of syns) textQ = textQ.replace(s, ' ')
      }
      textQ = textQ.replace(/\s+/g, ' ').trim()

      if (matchedType)   result = result.filter(p => p.type === matchedType)
      if (wantsTerrasse) result = result.filter(p => p.has_terrace !== false)
      if (wantsSun)      result = result.filter(p => (p.currentScore ?? 0) >= 4)

      if (textQ) {
        // Détecte un numéro d'arrondissement écrit "11", "11e", "11ème"…
        const arrMatch = textQ.match(/^(\d{1,2})(?:e|er|ème|ère)?$/)
        const arrNum   = arrMatch ? parseInt(arrMatch[1]) : null
        result = result.filter((p) => {
          if (p.name.toLowerCase().includes(textQ)) return true
          if (p.address.toLowerCase().includes(textQ)) return true
          if (arrNum !== null) {
            if (p.arrondissement === arrNum) return true
            // Fallback : extraire l'arrondissement du code postal 750XX
            const cp = p.address.match(/\b75(\d{3})\b/)
            if (cp) {
              const arr = parseInt(cp[1])
              if (arr === arrNum) return true
            }
          }
          return false
        })
      }
    }
    return result
  }, [places, activeFilters, searchQuery])

  // Suggestions : top 6 lieux pour le dropdown sous la search
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.trim().toLowerCase()
    // Trie : matches sur le nom > matches sur l'adresse, puis par note Google
    return [...displayedPlaces]
      .map((p) => {
        const nameMatch = p.name.toLowerCase().includes(q) ? 100 : 0
        const rating    = (p.google_rating ?? 0) * 5
        return { p, score: nameMatch + rating }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.p)
  }, [displayedPlaces, searchQuery])

  const sunnyCount = useMemo(
    () => displayedPlaces.filter((p) => (p.currentScore ?? 0) >= 4).length,
    [displayedPlaces]
  )

  const toggleFilter = useCallback((filter: FilterType) => {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter]
    )
  }, [])

  const handlePlaceSelect = useCallback(async (place: Place | null) => {
    if (!place) { setSelectedPlace(null); return }
    setSelectedPlace(place)
    setSheetMode('half')
    const now = new Date()
    const month = now.getMonth() + 1
    const { data } = await supabase
      .from('sun_scores').select('time_slot, score')
      .eq('place_id', place.id).eq('month', month)
      .order('time_slot')
    setSelectedScores(data ?? [])
  }, [])

  const handleClose = useCallback(() => {
    setSelectedPlace(null)
  }, [])

  // Drag handle (bottom sheet mobile)
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { y: e.clientY, mode: sheetMode }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dy = e.clientY - dragRef.current.y
    if (dy > 40)       setSheetMode(dragRef.current.mode === 'full' ? 'half' : 'peek')
    else if (dy < -40) setSheetMode(dragRef.current.mode === 'peek' ? 'half' : 'full')
  }
  const onPointerUp = () => { dragRef.current = null }

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* Carte plein écran */}
      <div className="absolute inset-0" role="application" aria-label="Carte des terrasses ensoleillées à Paris">
        <MapView
          places={displayedPlaces}
          onPlaceSelect={handlePlaceSelect}
          highlightPlaceId={selectedPlace?.id}
          focusPlace={selectedPlace ? { lng: selectedPlace.lng, lat: selectedPlace.lat } : null}
          sunHour={hour}
        />
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
            aria-label="HopSoleil"
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
              HopSoleil
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

      {/* ─── Floating bottom card : filtres + search (masqué si lieu sélectionné) ─── */}
      {!selectedPlace && (
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
                id="search-places"
                name="search"
                type="text"
                placeholder="Bar terrasse, café au soleil, 11e…"
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

            {/* Dropdown suggestions */}
            {searchQuery.trim() && suggestions.length > 0 && (
              <ul
                role="listbox"
                aria-label="Lieux suggérés"
                className="mt-2 max-h-[260px] overflow-y-auto rounded-2xl bg-white"
                style={{ border: '1px solid rgba(20,32,51,0.10)', boxShadow: '0 8px 24px rgba(11,31,58,0.10)' }}
              >
                {suggestions.map((p) => {
                  const cp = p.address.match(/\b75(\d{3})\b/)
                  const arr = p.arrondissement ?? (cp ? parseInt(cp[1]) : null)
                  const icon = p.type === 'bar' ? '🍺' : p.type === 'restaurant' ? '🍽' : p.type === 'cafe' ? '☕' : '🌳'
                  const sunny = (p.currentScore ?? 0) >= 4
                  return (
                    <li key={p.id} role="option">
                      <button
                        onClick={() => handlePlaceSelect(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2 transition"
                      >
                        <span aria-hidden="true" className="text-[18px] shrink-0">{icon}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-outfit font-bold text-[13.5px] text-text-primary truncate">
                            {p.name}
                          </span>
                          <span className="block font-outfit text-[11.5px] text-text-soft truncate">
                            {arr ? `${arr}${arr === 1 ? 'er' : 'e'} · ` : ''}{p.address.split(',')[0]}
                          </span>
                        </span>
                        {sunny && (
                          <span aria-label="Au soleil" className="text-[14px] shrink-0">☀️</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Search, X, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Filters from '@/components/Map/Filters'
import PlacePageClient from '@/components/Map/PlacePageClient'
import { owmIconToEmoji } from '@/lib/weather'
import { isOpenAt } from '@/lib/openingHours'
import type { Place, FilterType, WeatherForecastEntry } from '@/types'

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
  const [homeViewCount, setHomeViewCount] = useState(0)
  const dragRef = useRef<{ y: number; mode: SheetMode } | null>(null)

  // ── Météo ─────────────────────────────────────────────────────────────────────
  interface WeatherResponse {
    current: { temp: number; icon: string; description: string } | null
    forecast: WeatherForecastEntry[]
  }
  const [weather, setWeather] = useState<WeatherResponse | null>(null)

  useEffect(() => {
    fetch('/api/weather')
      .then(r => r.ok ? r.json() : null)
      .then(data => data ? setWeather(data) : null)
      .catch(() => null)
  }, [])

  // Entrée de prévision la plus proche de l'heure du slider
  const weatherForHour = useMemo(() => {
    if (!weather) return null
    const { current, forecast } = weather
    if (!forecast.length) return current
    // Trouve l'entrée dont l'heure locale est la plus proche du slider
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const target = todayStart.getTime() / 1000 + hour * 3600
    let best = forecast[0]
    let bestDiff = Math.abs(best.dt - target)
    for (const entry of forecast) {
      const diff = Math.abs(entry.dt - target)
      if (diff < bestDiff) { best = entry; bestDiff = diff }
    }
    return best
  }, [weather, hour])

  // focusPlace mémoisé pour éviter de re-déclencher le flyTo de la carte
  // à chaque rendu (ex. quand l'heure change dans le slider)
  const mapFocusPlace = useMemo(
    () => selectedPlace ? { lng: selectedPlace.lng, lat: selectedPlace.lat } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPlace?.id],
  )

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
      const dayOfWeek = new Date().getDay()
      result = result.filter((p) => isOpenAt(p.opening_hours ?? null, dayOfWeek, hour, p.type))
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
    setSearchQuery('')
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
          focusPlace={mapFocusPlace}
          sunHour={hour}
          homeView={homeViewCount}
          showFontaines={activeFilters.includes('fontaine')}
          showSanisettes={activeFilters.includes('sanisette')}
          showPark={activeFilters.includes('park')}
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
            className="pointer-events-auto inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full cursor-pointer"
            aria-label="Home — HopSoleil"
            role="button"
            tabIndex={0}
            onClick={() => { handleClose(); setHomeViewCount(c => c + 1) }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { handleClose(); setHomeViewCount(c => c + 1) } }}
            style={{
              background: 'rgba(255,255,255,0.86)',
              border: '1px solid rgba(20,32,51,0.10)',
              boxShadow: '0 6px 22px rgba(11,31,58,0.10)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <span className="grid place-items-center w-7 h-7 rounded-full text-[14px]"
              style={{
                background: 'radial-gradient(circle at 36% 30%, #fff5a0 0%, #ffb703 60%, #f77f00 100%)',
                boxShadow: '0 6px 14px rgba(255,183,3,0.35)',
                color: '#0b1f3a',
              }}
              aria-hidden="true"
            >☀</span>
            <span className="font-extrabold text-[20px] leading-none"
              style={{ fontFamily: 'var(--font-bricolage)', fontVariationSettings: "'wdth' 75", letterSpacing: '-0.03em', color: '#0b1f3a' }}>
              HopSoleil
            </span>
          </div>

          {/* Heure + Maintenant + count pill */}
          <div
            className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shrink-0"
            style={{
              background: 'rgba(255,255,255,0.86)',
              border: '1px solid rgba(20,32,51,0.10)',
              boxShadow: '0 6px 22px rgba(11,31,58,0.10)',
              backdropFilter: 'blur(16px)',
            }}
          >
            <input
              type="range" min={6} max={23.5} step={0.5}
              value={hour}
              onChange={(e) => setHour(parseFloat(e.target.value))}
              className="cb-hour-slider"
              style={{ width: 68, height: 20 }}
              aria-label="Heure du soleil"
            />
            <span className="font-outfit" style={{ fontSize: 10, fontWeight: 800, color: '#0b1f3a', minWidth: 26, textAlign: 'right' }}>
              {String(Math.floor(hour)).padStart(2,'0')}h{hour % 1 ? '30' : ''}
            </span>
            <button
              onClick={() => setHour(nowHalfHour())}
              aria-label="Voir les terrasses en ce moment"
              title="Voir les terrasses en ce moment"
              className="shrink-0 inline-flex items-center gap-1 font-bold rounded-full transition-all duration-150 active:scale-[0.95]"
              style={{
                fontSize: 10.5, paddingLeft: 7, paddingRight: 8, paddingTop: 4, paddingBottom: 4,
                background: Math.abs(hour - nowHalfHour()) < 0.3
                  ? 'linear-gradient(145deg,#ffe566 0%,#ffb703 100%)'
                  : 'rgba(20,32,51,0.07)',
                color: Math.abs(hour - nowHalfHour()) < 0.3 ? '#6b3d00' : '#0b1f3a',
                border: `1.5px solid ${Math.abs(hour - nowHalfHour()) < 0.3 ? 'rgba(255,183,3,0.50)' : 'transparent'}`,
                boxShadow: Math.abs(hour - nowHalfHour()) < 0.3 ? '0 2px 8px rgba(255,183,3,0.30)' : 'none',
              }}
            >
              <Clock size={10} strokeWidth={2.5} />
              Maintenant
            </button>
            {!loading && displayedPlaces.length > 0 && (
              <>
                <span aria-hidden="true" className="w-px h-3.5 shrink-0" style={{ background: 'rgba(20,32,51,0.15)' }} />
                <span className="font-bold text-[13px] leading-none" style={{ color: '#0b1f3a' }}>
                  {displayedPlaces.length}
                </span>
                {sunnyCount > 0 && (
                  <span className="font-bold text-[11px] leading-none flex items-center gap-0.5"
                    style={{ color: '#f77f00' }}>
                    <span aria-hidden="true">☀</span>{sunnyCount}
                  </span>
                )}
              </>
            )}
            {/* Pill météo — visible uniquement si l'API répond */}
            {weatherForHour && (
              <>
                <span aria-hidden="true" className="w-px h-3.5 shrink-0" style={{ background: 'rgba(20,32,51,0.15)' }} />
                <a
                  href="https://meteofrance.com/previsions-meteo-france/paris/75000"
                  target="_blank"
                  rel="noopener noreferrer"
                  title={weatherForHour.description}
                  className="inline-flex items-center gap-0.5 font-bold leading-none shrink-0"
                  style={{ fontSize: 11, color: '#0b1f3a', textDecoration: 'none' }}
                  aria-label={`Météo Paris : ${weatherForHour.description}, ${weatherForHour.temp}°C — voir sur Météo France`}
                >
                  <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>
                    {owmIconToEmoji(weatherForHour.icon)}
                  </span>
                  <span>{weatherForHour.temp}°</span>
                </a>
              </>
            )}
          </div>
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

      {/* ─── Barre flottante compact : search + filtres + slider heure ─── */}
      {!selectedPlace && (
      <div
        className="absolute bottom-0 inset-x-0 z-20 pointer-events-none"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)' }}
      >
        <div
          className="pointer-events-auto mx-3 rounded-2xl overflow-hidden"
          style={{
            background: 'rgba(255,252,243,0.97)',
            border: '1px solid rgba(20,32,51,0.09)',
            backdropFilter: 'blur(24px)',
            boxShadow: '0 10px 40px rgba(11,31,58,0.15)',
          }}
        >
          {/* Suggestions */}
          {searchQuery.trim() && suggestions.length > 0 && (
            <ul
              role="listbox" aria-label="Lieux suggérés"
              className="overflow-y-auto bg-white/90"
              style={{ maxHeight: 200, borderBottom: '1px solid rgba(20,32,51,0.07)' }}
            >
              {suggestions.map((p) => {
                const cp = p.address.match(/\b75(\d{3})\b/)
                const arr = p.arrondissement ?? (cp ? parseInt(cp[1]) : null)
                const icon = p.type === 'bar' ? '🍺' : p.type === 'restaurant' ? '🍽' : p.type === 'cafe' ? '☕' : '🌳'
                return (
                  <li key={p.id} role="option">
                    <button
                      onClick={() => handlePlaceSelect(p)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2 transition"
                    >
                      <span aria-hidden="true" className="text-[16px] shrink-0">{icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-bold text-[13px] text-text-primary truncate">{p.name}</span>
                        <span className="block font-outfit text-[11px] text-text-soft truncate">
                          {arr ? `${arr}${arr === 1 ? 'er' : 'e'} · ` : ''}{p.address.split(',')[0]}
                        </span>
                      </span>
                      {(p.currentScore ?? 0) >= 4 && <span aria-label="Au soleil" className="text-[13px] shrink-0">☀️</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          {/* ── Recherche : centrée, max 280px ── */}
          <div className="flex justify-center px-3 pt-2 pb-1">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full w-full"
              style={{ maxWidth: 280, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(20,32,51,0.08)' }}>
              <Search size={13} strokeWidth={2.5} className="shrink-0 text-text-soft" />
              <input
                id="search-places" type="text"
                placeholder="Bar, terrasse, café, 11e…"
                aria-label="Rechercher un lieu"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); e.currentTarget.blur() } }}
                className="flex-1 min-w-0 bg-transparent outline-none font-semibold text-text-primary placeholder:text-text-soft/70"
                style={{ fontSize: 13 }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} aria-label="Effacer"
                  className="p-0.5 rounded-full text-text-soft hover:bg-surface-2 shrink-0">
                  <X size={12} strokeWidth={2.2} />
                </button>
              )}
            </div>
          </div>

          {/* ── Filtres ── */}
          <div className="pb-2 pt-0" style={{ minHeight: 36 }}>
            <Filters activeFilters={activeFilters} onToggle={toggleFilter} compact />
          </div>
        </div>
      </div>
      )}

      {/* ─── Panel lieu sélectionné (desktop : côté droit, mobile : bottom sheet) ─── */}
      {selectedPlace && isDesktop && (
        <aside
          className="absolute top-0 right-0 z-30 h-dvh overflow-y-auto"
          style={{
            width: 420,
            background: 'rgba(255,252,243,0.97)',
            backdropFilter: 'blur(22px)',
            borderLeft: '1px solid rgba(20,32,51,0.10)',
            boxShadow: '-18px 0 48px rgba(11,31,58,0.18)',
          }}
          role="complementary" aria-label={`Détails de ${selectedPlace.name}`}
        >
          <PlacePageClient
            place={selectedPlace}
            scores={selectedScores}
            hour={hour}
            onHourChange={setHour}
            onClose={handleClose}
          />
        </aside>
      )}

      {selectedPlace && !isDesktop && (
        <section
          className="absolute bottom-0 inset-x-0 z-30"
          style={{
            height: SHEET_HEIGHTS[sheetMode],
            transition: 'height 280ms cubic-bezier(0.2,0.8,0.2,1)',
            background: 'rgba(255,252,243,0.97)',
            backdropFilter: 'blur(22px)',
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            borderTop: '1px solid rgba(20,32,51,0.10)',
            boxShadow: '0 -16px 42px rgba(11,31,58,0.20)',
            overflow: 'hidden',
          }}
          role="dialog" aria-label={`Détails de ${selectedPlace.name}`}
        >
          <div
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            role="separator" aria-label="Redimensionner (glisser haut/bas)"
            className="flex items-center justify-center cursor-grab active:cursor-grabbing"
            style={{ height: 22, touchAction: 'none' }}
          >
            <span aria-hidden="true"
              style={{ width: 44, height: 5, borderRadius: 999, background: 'rgba(20,32,51,0.18)' }} />
          </div>
          <div className="overflow-y-auto" style={{ height: 'calc(100% - 22px)' }}>
            <PlacePageClient
              place={selectedPlace}
              scores={selectedScores}
              hour={hour}
              onHourChange={setHour}
              onClose={handleClose}
            />
          </div>
        </section>
      )}
    </main>
  )
}

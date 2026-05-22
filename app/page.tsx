'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Search, X, Clock, UserCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Filters from '@/components/Map/Filters'
import PlacePageClient from '@/components/Map/PlacePageClient'
import FicheAmenitePanel from '@/components/Map/FicheAmenitePanel'
import ProfilePanel from '@/components/Map/ProfilePanel'
import { owmIconToEmoji } from '@/lib/weather'
import { isOpenAt } from '@/lib/openingHours'
import type { Place, FilterType, WeatherForecastEntry, AmeniteInfo } from '@/types'

type SheetMode = 'peek' | 'half' | 'full'
const SHEET_HEIGHTS: Record<SheetMode, string> = { peek: '20vh', half: '58vh', full: '92dvh' }

function nowHalfHour(): number {
  const now = new Date()
  return Math.max(6, Math.min(23.5, now.getHours() + (now.getMinutes() >= 30 ? 0.5 : 0)))
}

const MapView = dynamic(() => import('@/components/Map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#fffcf3' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-icon.png" alt="" style={{ width: 64, height: 64, opacity: 0.35 }} aria-hidden="true" />
    </div>
  ),
})

const TODAY_LABEL = (() => {
  const d = new Date()
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d)
})()

// "ven. 22 mai" — mobile compact
const HEADER_DATE = (() => {
  const d = new Date()
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(d)
})()

// "vendredi" + "22 mai" — desktop 2 lignes
const WEEKDAY_LABEL = (() => {
  const d = new Date()
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(d)
})()
const DAY_MONTH_LABEL = (() => {
  const d = new Date()
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d)
})()

export default function HomePage() {
  const [places, setPlaces] = useState<Place[]>([])
  const [activeFilters, setActiveFilters] = useState<FilterType[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  // ── Lieu sélectionné (inline, sans navigation) ─────────────────────────
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [selectedScores, setSelectedScores] = useState<{ time_slot: string; score: number }[]>([])
  const [selectedAmenite, setSelectedAmenite] = useState<AmeniteInfo | null>(null)
  const [hour, setHour] = useState<number>(nowHalfHour)
  const [sheetMode, setSheetMode] = useState<SheetMode>('half')
  const [isDesktop, setIsDesktop] = useState(false)
  const [homeViewCount, setHomeViewCount] = useState(0)
  const [showProfile, setShowProfile] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const dragRef = useRef<{ y: number; mode: SheetMode } | null>(null)

  // ── Auth state — suivi global pour passer userId aux composants ──────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Météo ────────────────────────────────────────────────────────────────
  interface WeatherResponse {
    current: { temp: number; icon: string; description: string } | null
    forecast: WeatherForecastEntry[]
  }
  const [weather, setWeather] = useState<WeatherResponse | null>(null)

  useEffect(() => {
    fetch('/api/weather')
      .then(r => r.json().catch(() => null))
      .then(data => (data?.current || data?.forecast?.length) ? setWeather(data) : null)
      .catch(() => null)
  }, [])

  // Entrée de prévision la plus proche de l'heure du slider
  const weatherForHour = useMemo(() => {
    if (!weather) return null
    const { current, forecast } = weather
    if (!forecast?.length) return current
    // Utilise le champ `hour` (heure locale Paris 0-23) directement
    const targetH = Math.floor(hour)
    let best = forecast[0]
    let bestDiff = Math.abs((best.hour ?? 0) - targetH)
    for (const entry of forecast) {
      const diff = Math.abs((entry.hour ?? 0) - targetH)
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

      // Pagination : Supabase limite à 1000 lignes par requête par défaut
      const PAGE = 1000
      let from = 0
      const allPlaces: Record<string, unknown>[] = []
      while (true) {
        const { data, error } = await supabase
          .from('places').select('*')
          .not('lat', 'is', null).not('lng', 'is', null)
          .range(from, from + PAGE - 1)
        if (error) { console.error('Erreur chargement lieux:', error.message); break }
        if (!data || data.length === 0) break
        allPlaces.push(...data)
        if (data.length < PAGE) break
        from += PAGE
      }

      if (!allPlaces.length) { setLoading(false); return }

      const { data: nowScores } = await supabase
        .from('sun_scores').select('place_id, score')
        .eq('month', month).eq('time_slot', timeSlot)

      const scoreByPlace = new Map<string, number>()
      for (const r of nowScores ?? []) scoreByPlace.set(r.place_id, r.score)

      const enriched: Place[] = allPlaces.map((p) => ({
        ...p,
        currentScore: scoreByPlace.get((p as { id: string }).id) ?? 3,
      } as Place))

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
    // Quand seuls les filtres amenite (eau/WC) sont actifs → cacher tous les bars/restos
    const ameniteOnly = activeFilters.length > 0 &&
      activeFilters.every(f => f === 'fontaine' || f === 'sanisette')
    if (ameniteOnly) return []

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
    setSelectedAmenite(null)  // ferme l'amenite si open
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

  const handleAmeniteSelect = useCallback((amenite: AmeniteInfo | null) => {
    setSelectedAmenite(amenite)
    if (amenite) setSelectedPlace(null)  // ferme le panel lieu si open
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
          onAmeniteSelect={handleAmeniteSelect}
        />
      </div>

      {/* ══════ HEADER RESPONSIVE ══════
           Mobile  : Row 1 = date+météo · logo · profil
                     Row 2 = slider full-width
           Desktop : Row 1 = date+météo · logo · slider+profil          */}
      <header
        className="absolute top-0 inset-x-0 z-20"
        style={{
          background: 'rgba(255,248,234,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(31,58,95,0.07)',
          boxShadow: '0 2px 18px rgba(31,58,95,0.06)',
        }}
      >
        {/* ── ROW 1 : date+météo · logo · [slider desktop] · profil ── */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 14,
            paddingRight: 14,
            paddingTop: 'max(env(safe-area-inset-top, 0px), 8px)',
            paddingBottom: isDesktop ? 8 : 6,
            minHeight: 'calc(max(env(safe-area-inset-top, 0px), 8px) + 50px)',
          }}
        >
          {/* ── GAUCHE : date + météo ── */}
          {isDesktop ? (
            /* Desktop : date 2 lignes à G, séparateur, météo à D */
            <div style={{ flex: '0 0 auto', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <span title={TODAY_LABEL} style={{
                  fontFamily: 'var(--font-bricolage)', fontSize: 11, fontWeight: 700,
                  color: 'rgba(31,58,95,0.42)', textTransform: 'capitalize',
                  letterSpacing: '0.01em', lineHeight: 1.2, whiteSpace: 'nowrap',
                }}>
                  {WEEKDAY_LABEL}
                </span>
                <span style={{
                  fontFamily: 'var(--font-bricolage)', fontSize: 24, fontWeight: 900,
                  color: '#1F3A5F', lineHeight: 0.9, letterSpacing: '-0.04em', whiteSpace: 'nowrap',
                  textTransform: 'capitalize',
                }}>
                  {DAY_MONTH_LABEL}
                </span>
              </div>
              <span style={{ width: 1, height: 34, background: 'rgba(31,58,95,0.10)', flexShrink: 0 }} />
              {weatherForHour ? (
                <a
                  href="https://meteofrance.com/previsions-meteo-france/paris/75000"
                  target="_blank" rel="noopener noreferrer"
                  aria-label={`Météo Paris : ${weatherForHour.description}, ${weatherForHour.temp}°C`}
                  className="inline-flex items-center gap-2"
                  style={{ textDecoration: 'none' }}
                >
                  <span aria-hidden="true" style={{ fontSize: 26, lineHeight: 1, flexShrink: 0 }}>
                    {owmIconToEmoji(weatherForHour.icon)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-outfit)' }}>
                    <span style={{ display: 'block', fontSize: 17, fontWeight: 900, color: '#1F3A5F', lineHeight: 1 }}>
                      {weatherForHour.temp}°
                    </span>
                    <span style={{
                      display: 'block', fontSize: 10, fontWeight: 600,
                      color: 'rgba(31,58,95,0.45)', lineHeight: 1.2, marginTop: 2,
                      maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {weatherForHour.description}
                    </span>
                  </span>
                </a>
              ) : null}
            </div>
          ) : (
            /* Mobile : compact empilé */
            <div style={{ flex: '0 0 auto', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span title={TODAY_LABEL} style={{
                fontFamily: 'var(--font-bricolage)', fontSize: 9.5, fontWeight: 800,
                color: 'rgba(31,58,95,0.38)', letterSpacing: '0.02em',
                textTransform: 'capitalize', whiteSpace: 'nowrap', lineHeight: 1,
              }}>
                {HEADER_DATE}
              </span>
              {weatherForHour ? (
                <a
                  href="https://meteofrance.com/previsions-meteo-france/paris/75000"
                  target="_blank" rel="noopener noreferrer"
                  aria-label={`Météo Paris : ${weatherForHour.description}, ${weatherForHour.temp}°C`}
                  className="inline-flex items-center gap-1.5"
                  style={{ textDecoration: 'none' }}
                >
                  <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>
                    {owmIconToEmoji(weatherForHour.icon)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-outfit)' }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 900, color: '#1F3A5F', lineHeight: 1 }}>
                      {weatherForHour.temp}°
                    </span>
                    <span style={{
                      display: 'block', fontSize: 9, fontWeight: 600,
                      color: 'rgba(31,58,95,0.45)', lineHeight: 1.2, marginTop: 1,
                      maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {weatherForHour.description}
                    </span>
                  </span>
                </a>
              ) : null}
            </div>
          )}

          {/* ── CENTRE : logo ── */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', zIndex: 1 }}>
            <button
              aria-label="HopSoleil — Retour à l'accueil"
              onClick={() => { handleClose(); setHomeViewCount(c => c + 1) }}
              className="active:scale-[0.95] transition-transform"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'block' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-hopsoleil.png"
                alt="HopSoleil"
                style={{ height: 34, width: 'auto', display: 'block', mixBlendMode: 'multiply' }}
              />
            </button>
          </div>

          {/* ── DROITE : slider (desktop uniquement) + profil ── */}
          <div style={{
            flex: '0 0 auto', marginLeft: 'auto', zIndex: 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {/* Slider pill — desktop seulement */}
            {isDesktop && (
              <div
                className="inline-flex items-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(31,58,95,0.07) 0%, rgba(237,193,69,0.10) 100%)',
                  border: '1.5px solid rgba(237,193,69,0.32)',
                  borderRadius: 999,
                  padding: '4px 8px 4px 12px',
                  gap: 6,
                  boxShadow: '0 2px 10px rgba(237,193,69,0.12)',
                  width: 'clamp(180px, 28vw, 260px)',
                }}
              >
                <input
                  type="range" min={6} max={23.5} step={0.5}
                  value={hour}
                  onChange={(e) => setHour(parseFloat(e.target.value))}
                  className="cb-hour-slider"
                  style={{ flex: 1, minWidth: 0 }}
                  aria-label="Heure du soleil"
                />
                <span className="font-outfit shrink-0" style={{ fontSize: 12.5, fontWeight: 900, color: '#1F3A5F', lineHeight: 1, minWidth: 32 }}>
                  {String(Math.floor(hour)).padStart(2,'0')}h{hour % 1 ? '30' : '00'}
                </span>
                <button
                  onClick={() => setHour(nowHalfHour())}
                  aria-label="Heure actuelle"
                  className="shrink-0 inline-flex items-center justify-center rounded-full transition-all active:scale-[0.90]"
                  style={{
                    width: 24, height: 24,
                    background: Math.abs(hour - nowHalfHour()) < 0.3 ? '#EDC145' : 'rgba(31,58,95,0.09)',
                    border: `1px solid ${Math.abs(hour - nowHalfHour()) < 0.3 ? 'rgba(237,193,69,0.55)' : 'transparent'}`,
                    boxShadow: Math.abs(hour - nowHalfHour()) < 0.3 ? '0 2px 8px rgba(237,193,69,0.40)' : 'none',
                    color: '#1F3A5F',
                  }}
                >
                  <Clock size={12} strokeWidth={2.5} />
                </button>
                {!loading && sunnyCount > 0 && (
                  <span className="shrink-0 font-outfit font-bold" style={{ fontSize: 11, color: '#b87c00', lineHeight: 1 }}>
                    ☀ {sunnyCount}
                  </span>
                )}
              </div>
            )}

            {/* Bouton profil — toujours visible */}
            <button
              onClick={() => { setShowProfile(p => !p); setSelectedPlace(null); setSelectedAmenite(null) }}
              aria-label={userId ? 'Mon profil' : 'Se connecter'}
              className="shrink-0 inline-flex items-center justify-center rounded-full transition-all active:scale-[0.94]"
              style={{
                width: 38, height: 38,
                background: showProfile
                  ? '#1F3A5F'
                  : userId ? 'rgba(237,193,69,0.18)' : 'rgba(31,58,95,0.07)',
                border: `1.5px solid ${showProfile ? '#1F3A5F' : userId ? 'rgba(237,193,69,0.45)' : 'rgba(31,58,95,0.10)'}`,
                boxShadow: showProfile ? '0 4px 14px rgba(31,58,95,0.25)' : userId ? '0 2px 8px rgba(237,193,69,0.18)' : 'none',
                cursor: 'pointer',
              }}
            >
              <UserCircle
                size={18} strokeWidth={2}
                style={{ color: showProfile ? '#EDC145' : userId ? '#b87c00' : 'rgba(31,58,95,0.40)' }}
              />
            </button>
          </div>
        </div>

      </header>

      {/* ── Slider mobile — bulle flottante détachée du header ── */}
      {!isDesktop && (
        <div
          className="absolute inset-x-0 z-[18]"
          style={{ top: 'calc(max(env(safe-area-inset-top, 0px), 8px) + 62px)', padding: '0 12px' }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,252,243,0.98)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1.5px solid rgba(237,193,69,0.42)',
            borderRadius: 999,
            padding: '7px 14px',
            boxShadow: '0 6px 22px rgba(31,58,95,0.13), 0 2px 8px rgba(237,193,69,0.15)',
          }}>
            <span style={{ fontFamily: 'var(--font-outfit)', fontSize: 10, fontWeight: 800,
              color: 'rgba(31,58,95,0.35)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              ☀ 6h
            </span>
            <input
              type="range" min={6} max={23.5} step={0.5}
              value={hour}
              onChange={(e) => setHour(parseFloat(e.target.value))}
              className="cb-hour-slider"
              style={{ flex: 1, minWidth: 0 }}
              aria-label="Heure du soleil"
            />
            <span style={{ fontFamily: 'var(--font-outfit)', fontSize: 10, fontWeight: 800,
              color: 'rgba(31,58,95,0.35)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              🌙 23h
            </span>
            <span style={{ width: 1, height: 14, background: 'rgba(31,58,95,0.12)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-outfit)', fontSize: 13, fontWeight: 900,
              color: '#1F3A5F', lineHeight: 1, minWidth: 32, textAlign: 'right', flexShrink: 0 }}>
              {String(Math.floor(hour)).padStart(2,'0')}h{hour % 1 ? '30' : '00'}
            </span>
            <button
              onClick={() => setHour(nowHalfHour())}
              aria-label="Heure actuelle"
              className="inline-flex items-center justify-center rounded-full transition-all active:scale-[0.88]"
              style={{
                width: 26, height: 26, flexShrink: 0,
                background: Math.abs(hour - nowHalfHour()) < 0.3 ? '#EDC145' : 'rgba(31,58,95,0.08)',
                border: `1.5px solid ${Math.abs(hour - nowHalfHour()) < 0.3 ? 'rgba(237,193,69,0.55)' : 'transparent'}`,
                boxShadow: Math.abs(hour - nowHalfHour()) < 0.3 ? '0 3px 10px rgba(237,193,69,0.45)' : 'none',
                color: '#1F3A5F',
              }}
            >
              <Clock size={12} strokeWidth={2.5} />
            </button>
            {!loading && sunnyCount > 0 && (
              <span style={{ fontFamily: 'var(--font-outfit)', fontSize: 11, fontWeight: 800,
                color: '#b87c00', flexShrink: 0, lineHeight: 1 }}>
                ☀{sunnyCount}
              </span>
            )}
          </div>
        </div>
      )}

      {/* État vide */}
      {!loading && displayedPlaces.length === 0 && !activeFilters.some(f => f === 'fontaine' || f === 'sanisette') && (
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

      {/* Message guidé quand filtre eau/WC actif sans autre filtre */}
      {!loading && activeFilters.some(f => f === 'fontaine' || f === 'sanisette') && displayedPlaces.length === 0 && (
        <div className="absolute inset-x-0 z-10 pointer-events-none flex justify-center px-6"
          style={{ top: isDesktop ? 'calc(max(env(safe-area-inset-top,0px),10px) + 68px)' : 'calc(max(env(safe-area-inset-top,0px),10px) + 120px)' }}>
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-outfit text-xs font-bold"
            style={{ background: 'rgba(255,248,234,0.97)', border: '1.5px solid rgba(31,58,95,0.12)',
              boxShadow: '0 4px 16px rgba(31,58,95,0.08)', color: '#1F3A5F' }}>
            {activeFilters.includes('fontaine') && <span>💧</span>}
            {activeFilters.includes('sanisette') && <span>🚺</span>}
            <span>Zoome pour voir les points d&apos;eau et sanitaires</span>
          </div>
        </div>
      )}

      {/* ══════════════ BOTTOM BAR — floating pill centré ══════════════ */}
      {!selectedPlace && !selectedAmenite && (
        <div
          className="absolute bottom-0 inset-x-0 z-20 flex justify-center"
          style={{ padding: '0 12px', paddingBottom: 'max(env(safe-area-inset-bottom,0px), 10px)' }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'rgba(255,248,234,0.97)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1.5px solid rgba(31,58,95,0.10)',
              borderRadius: 20,
              boxShadow: '0 8px 32px rgba(31,58,95,0.13), 0 2px 8px rgba(31,58,95,0.06)',
              overflow: 'hidden',
            }}
          >
            {/* Suggestions */}
            {searchQuery.trim() && suggestions.length > 0 && (
              <ul
                role="listbox" aria-label="Lieux suggérés"
                className="overflow-y-auto"
                style={{ maxHeight: 200, borderBottom: '1px solid rgba(31,58,95,0.07)' }}
              >
                {suggestions.map((p) => {
                  const cp = p.address.match(/\b75(\d{3})\b/)
                  const arr = p.arrondissement ?? (cp ? parseInt(cp[1]) : null)
                  const icon = p.type === 'bar' ? '🍺' : p.type === 'restaurant' ? '🍽' : p.type === 'cafe' ? '☕' : '🌳'
                  return (
                    <li key={p.id} role="option">
                      <button
                        onClick={() => handlePlaceSelect(p)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[rgba(31,58,95,0.05)] transition"
                      >
                        <span aria-hidden="true" className="text-[15px] shrink-0">{icon}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-bold text-[13px] text-text-primary truncate">{p.name}</span>
                          <span className="block font-outfit text-[11px] text-text-soft truncate">
                            {arr ? `${arr}${arr === 1 ? 'er' : 'e'} · ` : ''}{p.address.split(',')[0]}
                          </span>
                        </span>
                        {(p.currentScore ?? 0) >= 4 && <span aria-label="Au soleil" className="text-[12px] shrink-0">☀️</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {/* ── Recherche ── */}
            <div className="px-3 pt-3 pb-2">
              <div
                className="flex items-center gap-2.5"
                style={{
                  background: 'rgba(31,58,95,0.07)',
                  border: '1px solid rgba(31,58,95,0.10)',
                  borderRadius: 13,
                  padding: '0 12px',
                  height: 46,
                }}
              >
                <Search size={16} strokeWidth={2.3} style={{ color: 'rgba(31,58,95,0.35)', flexShrink: 0 }} />
                <input
                  id="search-places" type="text"
                  placeholder="Bar, restaurant, 11e…"
                  aria-label="Rechercher un lieu"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); e.currentTarget.blur() } }}
                  className="flex-1 min-w-0 bg-transparent outline-none font-semibold placeholder:text-text-soft/55"
                  style={{ fontSize: 14, fontFamily: 'var(--font-outfit)', color: '#1F3A5F' }}
                />
                {searchQuery ? (
                  <button
                    onClick={() => setSearchQuery('')} aria-label="Effacer"
                    className="shrink-0 inline-flex items-center justify-center rounded-full"
                    style={{ width: 22, height: 22, background: 'rgba(31,58,95,0.10)', color: '#1F3A5F' }}
                  >
                    <X size={11} strokeWidth={2.5} />
                  </button>
                ) : !loading && displayedPlaces.length > 0 ? (
                  <span className="shrink-0 font-outfit font-semibold" style={{ fontSize: 11, color: 'rgba(31,58,95,0.28)', whiteSpace: 'nowrap' }}>
                    {displayedPlaces.length}
                  </span>
                ) : null}
              </div>
            </div>

            {/* ── Filtres ── */}
            <div style={{ paddingBottom: 10 }}>
              <Filters activeFilters={activeFilters} onToggle={toggleFilter} />
            </div>
          </div>
        </div>
      )}

      {/* ─── Panel Profil (desktop : côté droit, mobile : bottom sheet) ─── */}
      {showProfile && isDesktop && (
        <aside
          className="absolute top-0 right-0 z-40 h-dvh overflow-y-auto"
          style={{
            width: 420,
            background: 'rgba(255,252,243,0.97)',
            backdropFilter: 'blur(22px)',
            borderLeft: '1.5px solid rgba(31,58,95,0.10)',
            boxShadow: '-16px 0 40px rgba(31,58,95,0.12)',
          }}
          role="complementary" aria-label="Mon profil"
        >
          <ProfilePanel
            onClose={() => setShowProfile(false)}
            onAuthChange={(u) => setUserId(u?.id ?? null)}
          />
        </aside>
      )}

      {showProfile && !isDesktop && (
        <section
          className="absolute bottom-0 inset-x-0 z-40"
          style={{
            height: '90dvh',
            background: 'rgba(255,252,243,0.97)',
            backdropFilter: 'blur(22px)',
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            borderTop: '1.5px solid rgba(31,58,95,0.10)',
            boxShadow: '0 -12px 36px rgba(31,58,95,0.14)',
            overflow: 'hidden',
          }}
          role="dialog" aria-label="Mon profil"
        >
          <div className="flex items-center justify-center" style={{ height: 22 }}>
            <span style={{ width: 44, height: 5, borderRadius: 999, background: 'rgba(20,32,51,0.18)', display: 'block' }} />
          </div>
          <div className="overflow-y-auto" style={{ height: 'calc(100% - 22px)' }}>
            <ProfilePanel
              onClose={() => setShowProfile(false)}
              onAuthChange={(u) => setUserId(u?.id ?? null)}
            />
          </div>
        </section>
      )}

      {/* ─── Panel fontaine / sanisette (desktop : côté droit, mobile : bottom sheet) ─── */}
      {selectedAmenite && isDesktop && (
        <aside
          className="absolute top-0 right-0 z-30 h-dvh overflow-y-auto"
          style={{
            width: 420,
            background: 'rgba(255,252,243,0.97)',
            backdropFilter: 'blur(22px)',
            borderLeft: '1.5px solid rgba(31,58,95,0.10)',
            boxShadow: '-16px 0 40px rgba(31,58,95,0.12)',
          }}
          role="complementary" aria-label="Détails du point d'intérêt"
        >
          <FicheAmenitePanel
            amenite={selectedAmenite}
            onClose={() => setSelectedAmenite(null)}
            userId={userId}
            onOpenProfile={() => { setShowProfile(true); setSelectedAmenite(null) }}
          />
        </aside>
      )}

      {selectedAmenite && !isDesktop && (
        <section
          className="absolute bottom-0 inset-x-0 z-30"
          style={{
            height: '62vh',
            background: 'rgba(255,252,243,0.97)',
            backdropFilter: 'blur(22px)',
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            borderTop: '1.5px solid rgba(31,58,95,0.10)',
            boxShadow: '0 -12px 36px rgba(31,58,95,0.14)',
            overflow: 'hidden',
          }}
          role="dialog" aria-label="Détails du point d'intérêt"
        >
          <div className="flex items-center justify-center" style={{ height: 22 }}>
            <span style={{ width: 44, height: 5, borderRadius: 999, background: 'rgba(20,32,51,0.18)', display: 'block' }} />
          </div>
          <div className="overflow-y-auto" style={{ height: 'calc(100% - 22px)' }}>
            <FicheAmenitePanel
              amenite={selectedAmenite}
              onClose={() => setSelectedAmenite(null)}
              userId={userId}
              onOpenProfile={() => { setShowProfile(true); setSelectedAmenite(null) }}
            />
          </div>
        </section>
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
            userId={userId}
            onOpenProfile={() => { setShowProfile(true); setSelectedPlace(null) }}
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
              userId={userId}
              onOpenProfile={() => { setShowProfile(true); setSelectedPlace(null) }}
            />
          </div>
        </section>
      )}
    </main>
  )
}

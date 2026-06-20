'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { Search, X, Clock, UserCircle, Compass, MapPin, ArrowUpRight, Sun, LocateFixed } from 'lucide-react'
import PlaceTypeIcon from '@/components/Map/PlaceTypeIcon'
import { supabase } from '@/lib/supabase'
import { getSunPosition, getSunTimes } from '@/lib/suncalc'
import { cloudAdjustedScore } from '@/lib/sunScore'
import Filters from '@/components/Map/Filters'
import SunSlotBubbles from '@/components/Map/SunSlotBubbles'
import PlacePageClient from '@/components/Map/PlacePageClient'
import FicheAmenitePanel, { AmenitePeek } from '@/components/Map/FicheAmenitePanel'
import MobileSheet from '@/components/Map/MobileSheet'
import ProfilePanel from '@/components/Map/ProfilePanel'
import { owmIconToEmoji } from '@/lib/weather'
import { isOpenAt } from '@/lib/openingHours'
import { hourToSlot, formatHourLabelPad } from '@/lib/hourSlot'
import { textMatchScore } from '@/lib/searchUtils'
import { isHiddenPlace } from '@/lib/terraceClassify'
import { geocodeParis, type GeoResult } from '@/lib/geocode'
import type { Place, FilterType, WeatherForecastEntry, AmeniteInfo } from '@/types'
import PwaInstallPrompt from '@/components/PwaInstallPrompt'
import SunnyStrip from '@/components/SunnyStrip'
import { sunNote10, placeCoord, distanceM } from '@/lib/sunNote'
import { terraceSunScore } from '@/lib/terraceSun'

function nowQuarter(): number {
  const now = new Date()
  // Snap au quart d'heure le plus proche (15 min)
  const q = Math.round((now.getHours() + now.getMinutes() / 60) * 4) / 4
  return Math.max(6, Math.min(23.75, q))
}

const MapView      = dynamic(() => import('@/components/Map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#fffcf3' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-icon.png" alt="" style={{ width: 64, height: 64, opacity: 0.35 }} aria-hidden="true" />
    </div>
  ),
})
const PlacePreview = dynamic(() => import('@/components/Map/PlacePreview'), { ssr: false })

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
  const [activeFilters, setActiveFilters] = useState<FilterType[]>(['terrace'])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  // ── Recherche d'adresses / rues (géocodage Mapbox) ─────────────────────
  const [geoResults, setGeoResults] = useState<GeoResult[]>([])
  const [flyToTarget, setFlyToTarget] = useState<{ lng: number; lat: number; zoom: number; nonce: number } | null>(null)
  // Zoom caméra sur un point d'eau / sanisette sélectionné (comme une fiche lieu)
  const [focusPoint, setFocusPoint] = useState<{ lng: number; lat: number; nonce: number } | null>(null)

  // ── Lieu sélectionné (inline, sans navigation) ─────────────────────────
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null)
  const [selectedScores, setSelectedScores] = useState<{ time_slot: string; score: number }[]>([])
  const [selectedAmenite, setSelectedAmenite] = useState<AmeniteInfo | null>(null)
  const [hour, setHour] = useState<number>(nowQuarter)
  // ── Aperçu solaire animé (bulles de créneaux) ──────────────────────────
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const slotAnimRef = useRef<number | null>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [homeViewCount, setHomeViewCount] = useState(0)
  const [geolocateNonce, setGeolocateNonce] = useState(0)
  const [showProfile, setShowProfile] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null)
  const prevShowProfileRef    = useRef(false)
  // Bouton retour : true si on a pushé un état history pour le panel courant
  const panelHistoryPushed = useRef(false)
  const headerRef = useRef<HTMLElement>(null)
  const [headerH, setHeaderH] = useState(0)

  // ── Auth state — suivi global pour passer userId aux composants ──────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Fetch avatar_url pour l'afficher dans le header ───────────────────
  useEffect(() => {
    if (!userId) { setProfileAvatarUrl(null); return }
    supabase.from('profiles').select('avatar_url').eq('id', userId).single()
      .then(({ data }) => setProfileAvatarUrl(data?.avatar_url ?? null))
  }, [userId])

  // Rafraîchir l'avatar quand le panel profil se ferme (upload éventuel)
  useEffect(() => {
    if (!showProfile && prevShowProfileRef.current && userId) {
      supabase.from('profiles').select('avatar_url').eq('id', userId).single()
        .then(({ data }) => setProfileAvatarUrl(data?.avatar_url ?? null))
    }
    prevShowProfileRef.current = showProfile
  }, [showProfile, userId])

  // ── Bouton retour natif : ferme le panel au lieu de quitter l'app ────────
  // Quand un panel s'ouvre → on pousse une entrée dans l'historique navigateur.
  // Quand l'utilisateur appuie sur ← → popstate → on ferme le panel.
  useEffect(() => {
    const anyOpen = !!(selectedPlace || showProfile || selectedAmenite)
    if (anyOpen && !panelHistoryPushed.current) {
      history.pushState({ hs: 'panel' }, '')
      panelHistoryPushed.current = true
    } else if (!anyOpen) {
      panelHistoryPushed.current = false
    }
  }, [!!selectedPlace, showProfile, !!selectedAmenite]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPop = () => {
      // Ferme tous les panels au lieu de naviguer vers la page précédente
      setSelectedPlace(null)
      setShowProfile(false)
      setSelectedAmenite(null)
      panelHistoryPushed.current = false
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
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

  // ── Pollen + canicule ─────────────────────────────────────────────────────
  const [conditions, setConditions] = useState<{
    pollenLevel: number; pollenLabel: string; feelsLike: number | null; isHeatwave: boolean
  } | null>(null)

  useEffect(() => {
    fetch('/api/conditions')
      .then(r => r.json().catch(() => null))
      .then(d => d && setConditions(d))
      .catch(() => null)
  }, [])

  // Entrée de prévision la plus proche de l'heure du slider
  const weatherForHour = useMemo(() => {
    if (!weather) return null
    const { current, forecast } = weather
    if (!forecast?.length) return current
    // Utilise le champ `hour` (heure locale Paris 0-23) directement
    const targetH = Math.round(hour)
    let best = forecast[0]
    let bestDiff = Math.abs((best.hour ?? 0) - targetH)
    for (const entry of forecast) {
      const diff = Math.abs((entry.hour ?? 0) - targetH)
      if (diff < bestDiff) { best = entry; bestDiff = diff }
    }
    return best
  }, [weather, hour])

  // Couverture nuageuse (%) à l'heure du slider — module les scores en direct.
  // LISSÉE : moyenne pondérée des 2 créneaux de prévision (3h) qui encadrent
  // l'heure choisie. Évite qu'un seul bucket nuageux (un passage de nuages)
  // fasse chuter brutalement TOUS les scores — la couverture varie en douceur,
  // comme le ressenti réel d'un après-midi « soleil et nuages ».
  const cloudForHour = useMemo<number | null>(() => {
    // Quantifié à l'heure pleine : la valeur reste STABLE entre les ticks
    // sous-horaires du slider → `displayedPlaces` (7000+ lieux) ne se recalcule
    // pas à chaque frame pendant le drag (même fréquence qu'avant, + le lissage).
    const qh = Math.round(hour)
    const list = weather?.forecast
    if (list && list.length > 0) {
      const sorted = [...list].sort(
        (a, b) => Math.abs((a.hour ?? 0) - qh) - Math.abs((b.hour ?? 0) - qh),
      )
      const a = sorted[0]
      const b = sorted[1] ?? a
      const da = Math.abs((a.hour ?? 0) - qh)
      const db = Math.abs((b.hour ?? 0) - qh)
      const wTot = da + db
      // Le créneau le plus proche pèse le plus (poids ∝ distance de l'autre).
      const blended = wTot === 0 ? a.cloudCover : (a.cloudCover * db + b.cloudCover * da) / wTot
      return Math.round(blended)
    }
    const c = weatherForHour as { cloudCover?: number } | null
    return typeof c?.cloudCover === 'number' ? c.cloudCover : null
  }, [weather, weatherForHour, hour])

  // focusPlace mémoisé pour éviter de re-déclencher le flyTo de la carte
  // à chaque rendu (ex. quand l'heure change dans le slider)
  const mapFocusPlace = useMemo(
    () => selectedPlace ? {
      lng: selectedPlace.lng,
      lat: selectedPlace.lat,
      terraceLat: selectedPlace.terrace_lat ?? null,
      terraceLng: selectedPlace.terrace_lng ?? null,
      terraceBearing: selectedPlace.terrace_bearing ?? null,
    } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPlace?.id],
  )

  // ── Heure du coucher de soleil aujourd'hui (Paris) ────────────────────────
  const sunsetHour = useMemo(() => {
    const s = getSunTimes(new Date(), 48.8566, 2.3522).sunset
    if (!s || isNaN(s.getTime())) return 21.5
    return Math.min(23.5, s.getHours() + s.getMinutes() / 60)
  }, [])

  // Stoppe net une animation en cours (appelé dès que l'utilisateur reprend
  // la main sur le slider ou le bouton "maintenant").
  const stopSlotAnim = useCallback(() => {
    if (slotAnimRef.current != null) {
      cancelAnimationFrame(slotAnimRef.current)
      slotAnimRef.current = null
    }
    setActiveSlot(null)
  }, [])

  // Lance un balayage solaire de ~3 s : l'heure glisse de startH → endH avec
  // un easing doux. La carte (ombres setLights) et la card ouverte suivent en
  // direct puisqu'elles partagent `hour`.
  const previewSlot = useCallback((startH: number, endH: number, idx: number) => {
    if (slotAnimRef.current != null) cancelAnimationFrame(slotAnimRef.current)
    setActiveSlot(idx)
    const DURATION = 3000
    const t0 = performance.now()
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
    setHour(startH)
    const step = (now: number) => {
      const p = Math.min((now - t0) / DURATION, 1)
      const h = startH + (endH - startH) * easeInOut(p)
      // Résolution 1 min : au pic de l'easing chaque frame est distincte (ombres
      // continues), aux extrémités lentes les frames quasi-identiques fusionnent
      // → fluide sans surcharge de renders. Couplé au cache de preset (MapView).
      setHour(Math.round(h * 60) / 60)
      if (p < 1) {
        slotAnimRef.current = requestAnimationFrame(step)
      } else {
        slotAnimRef.current = null
        setHour(endH)
        setActiveSlot(null)
      }
    }
    slotAnimRef.current = requestAnimationFrame(step)
  }, [])

  // Nettoyage au démontage
  useEffect(() => () => { if (slotAnimRef.current != null) cancelAnimationFrame(slotAnimRef.current) }, [])

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeaderH(el.offsetHeight))
    ro.observe(el)
    setHeaderH(el.offsetHeight)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    // ── Cache localStorage ────────────────────────────────────────────────────
    // Les données lieux sont quasi-statiques (noms, coords, types).
    // On les cache 30 min côté client → affichage instantané au 2e chargement.
    // Les scores soleil sont recalculés séparément par le slider effect.
    const CACHE_KEY = 'cb_places_v3'
    const CACHE_TTL = 30 * 60 * 1000 // 30 min

    function saveCache(data: Place[]) {
      try {
        // Stocke sans currentScore (recalculé par le slider effect)
        const slim = data.map(({ currentScore: _, ...p }) => p)
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: slim, ts: Date.now() }))
      } catch { /* quota exceeded → silencieux */ }
    }

    async function fetchFresh(background = false) {
      const now   = new Date()
      const month = now.getMonth() + 1
      const h     = now.getHours()
      const m     = now.getMinutes() < 30 ? '00' : '30'
      const slot  = `${String(h).padStart(2, '0')}:${m}`

      // Essai 1 : route API /api/places (cache CDN Vercel 30 s)
      try {
        const res = await fetch(`/api/places?month=${month}&slot=${encodeURIComponent(slot)}`)
        if (res.ok) {
          const json = await res.json()
          if (Array.isArray(json) && json.length > 0) {
            setPlaces(json as Place[])
            if (!background) setLoading(false)
            saveCache(json as Place[])
            return
          }
        }
      } catch { /* fall through */ }

      // Fallback : Supabase direct
      const SLIM = 'id,name,address,lat,lng,type,arrondissement,has_terrace,terrace_lat,terrace_lng,terrace_longueur,terrace_largeur,terrace_bearing,google_rating,price_level,google_place_id'
      const PAGE = 1000
      const BBOX = { latMin: 48.810, latMax: 48.910, lngMin: 2.215, lngMax: 2.480 }
      try {
        const allPlaces: Place[] = []
        const [scoresRes] = await Promise.all([
          supabase.from('sun_scores').select('place_id,score').eq('month', month).eq('time_slot', slot),
          (async () => {
            let from = 0
            while (from < 25000) {
              const { data, error } = await supabase.from('places').select(SLIM)
                .gte('lat', BBOX.latMin).lte('lat', BBOX.latMax)
                .gte('lng', BBOX.lngMin).lte('lng', BBOX.lngMax)
                .range(from, from + PAGE - 1)
              if (error || !data?.length) break
              allPlaces.push(...(data as Place[]))
              if (data.length < PAGE) break
              from += PAGE
            }
          })(),
        ])
        const scoreMap = new Map<string, number>(
          ((scoresRes.data ?? []) as { place_id: string; score: number }[]).map(r => [r.place_id, r.score])
        )
        const result = allPlaces.map(p => ({ ...p, currentScore: scoreMap.get(p.id) ?? 3 }))
        setPlaces(result)
        saveCache(result)
      } catch (err) {
        console.error('Erreur chargement lieux (fallback):', err)
      } finally {
        if (!background) setLoading(false)
      }
    }

    async function loadPlaces() {
      // Vérifie le cache localStorage
      try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (raw) {
          const { data, ts } = JSON.parse(raw) as { data: Place[]; ts: number }
          if (Date.now() - ts < CACHE_TTL && Array.isArray(data) && data.length > 0) {
            // Affichage instantané depuis le cache
            setPlaces(data)
            setLoading(false)
            // Rafraîchissement silencieux en arrière-plan
            fetchFresh(true)
            return
          }
        }
      } catch { /* cache corrompu → rechargement normal */ }

      // Pas de cache valide → chargement normal avec spinner
      await fetchFresh(false)
    }

    loadPlaces()
  }, [])

  const displayedPlaces = useMemo(() => {
    // Garder large : on n'exclut QUE les lieux clairement « non-terrasse »
    // (chaînes, commerces non-conso). Les bars/cafés/restos sans signal restent
    // affichés (badge « à confirmer » géré dans le panel). cf. lib/terraceClassify.
    let result = places.filter(p => !isHiddenPlace(p))

    // Pondération météo temps réel UNIQUEMENT pour les lieux SANS terrasse
    // géolocalisée (score DB/altitude). Les terrasses ont déjà leur score calculé
    // en direct par terraceSunScore() qui intègre les nuages → pas de double peine.
    if (cloudForHour != null && cloudForHour > 55) {
      result = result.map((p) => {
        if (p.terrace_lat != null) return p
        const raw = p.currentScore ?? 3
        const adj = cloudAdjustedScore(raw, cloudForHour)
        return adj === raw ? p : { ...p, currentScore: adj }
      })
    }
    const typeFilters = activeFilters.filter((f): f is 'bar' | 'restaurant' | 'cafe' | 'park' =>
      ['bar', 'restaurant', 'cafe', 'park'].includes(f)
    )
    // Quand seuls les filtres amenite (eau/WC) sont actifs → cacher tous les bars/restos
    const ameniteOnly = activeFilters.length > 0 &&
      activeFilters.every(f => f === 'fontaine' || f === 'sanisette')
    if (ameniteOnly) return []

    if (activeFilters.includes('terrace')) result = result.filter((p) => p.has_terrace === true)
    if (typeFilters.length > 0) result = result.filter((p) => typeFilters.includes(p.type))
    if (activeFilters.includes('sun')) result = result.filter((p) => (p.currentScore ?? 0) >= 3.5)
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
        // Quartiers parisiens → arrondissements
        const QUARTIERS: Record<string, number[]> = {
          marais: [3, 4], bastille: [11, 12], montmartre: [18], pigalle: [9, 18],
          oberkampf: [11], belleville: [19, 20], nation: [12], 'opéra': [9], opera: [9],
          chatelet: [1, 4], 'âtelet': [1, 4], 'saint-germain': [6], 'germain': [6],
          latin: [5], luxembourg: [5, 6], montparnasse: [14, 15], batignolles: [17],
          canal: [10], republique: [10, 11], 'république': [10, 11],
          madeleine: [8], champs: [8], trocadero: [16], 'trocadéro': [16],
          passy: [16], auteuil: [16], bercy: [12], invalides: [7], eiffel: [7, 15],
          grenelle: [15], gobelins: [13], denfert: [14], odeon: [6], 'ódéon': [6],
          sentier: [2], temple: [3], 'ménilmontant': [20], menilmontant: [20],
          charonne: [11, 20], popincourt: [11], 'sacré': [18], butte: [18],
          'grands boulevards': [9, 10], 'saint-paul': [4], 'le marais': [3, 4],
        }
        // Arr. écrit "11", "11e", "11ème"…
        const arrMatch = textQ.match(/^(\d{1,2})(?:e|er|ème|ère)?$/)
        const arrNum   = arrMatch ? parseInt(arrMatch[1]) : null
        const quartierArrs = Object.entries(QUARTIERS)
          .filter(([q]) => textQ.includes(q)).flatMap(([, a]) => a)
        result = result.filter((p) => {
          // Match nom/adresse tolérant aux accents et fautes de frappe
          if (textMatchScore(textQ, p.name, p.address) > 0) return true
          if (arrNum !== null) {
            if (p.arrondissement === arrNum) return true
            const cp = p.address.match(/\b75(\d{3})\b/)
            if (cp && parseInt(cp[1]) === arrNum) return true
          }
          if (quartierArrs.length > 0 && p.arrondissement != null && quartierArrs.includes(p.arrondissement)) return true
          return false
        })
      }
    }
    return result
  }, [places, activeFilters, searchQuery, cloudForHour])

  // Suggestions : top 6 lieux pour le dropdown sous la search
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.trim()
    // Trie : pertinence texte floue (nom > adresse) puis note Google en départage
    return [...displayedPlaces]
      .map((p) => {
        const textScore = textMatchScore(q, p.name, p.address)
        const rating    = (p.google_rating ?? 0) * 2
        return { p, score: textScore + rating }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.p)
  }, [displayedPlaces, searchQuery])

  // ── Géocodage Mapbox : rues / adresses / quartiers (débounce 250 ms) ────
  useEffect(() => {
    const q = searchQuery.trim()
    if (q.length < 3) { setGeoResults([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      const results = await geocodeParis(q, ctrl.signal)
      setGeoResults(results)
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [searchQuery])

  // Sélection d'une adresse géocodée → recentre la carte dessus
  const handleGeoSelect = useCallback((g: GeoResult) => {
    setSearchQuery('')
    setGeoResults([])
    setSelectedPlace(null)
    setSelectedAmenite(null)
    setFlyToTarget({ lng: g.lng, lat: g.lat, zoom: g.zoom, nonce: Date.now() })
  }, [])

  const sunnyCount = useMemo(
    () => displayedPlaces.filter((p) => (p.currentScore ?? 0) >= 4).length,
    [displayedPlaces]
  )

  // ── Recommandations « trouver une terrasse ensoleillée » ──────────────────
  // IMPORTANT : on classe et on affiche avec la MÊME note que la fiche
  // (currentScore = score RÉEL en direct : soleil + orientation + nuages).
  // → la note de la pastille == la note de la card quand on clique. Cohérent.
  // Uniquement les terrasses géolocalisées (terrace_lat).
  const allTerraces = useMemo(
    () => places.filter(p => p.terrace_lat != null && p.terrace_lng != null && !isHiddenPlace(p)),
    [places]
  )
  const recoNote = useCallback((p: Place) => sunNote10(p.currentScore), [])
  const MIN_RECO = 2 // score ≥ 2 → note ≥ 4 (on montre toujours les meilleures du moment)

  // Score live d'un lieu à l'heure courante (utilisé à la sélection pour que la
  // card affiche EXACTEMENT la même note que la carte/les recos).
  const liveScoreOf = useCallback((p: Place) => {
    if (p.terrace_lat == null || p.terrace_lng == null) return p.currentScore ?? 3
    const d = new Date()
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0)
    return terraceSunScore(p, d, cloudForHour)
  }, [hour, cloudForHour])
  // Titre adaptatif : « au soleil » seulement si le top est franchement ensoleillé
  const sunnyTitle = (cloudForHour ?? 0) > 50 ? 'Les plus lumineuses maintenant' : 'Au soleil maintenant'

  // Au-dessus de la recherche : les terrasses les plus ensoleillées maintenant
  const sunnyTop = useMemo(() => {
    return allTerraces
      .filter(p => (p.currentScore ?? 0) >= MIN_RECO)
      .sort((a, b) => (b.currentScore ?? 0) - (a.currentScore ?? 0) || (b.google_rating ?? 0) - (a.google_rating ?? 0))
      .slice(0, 12)
  }, [allTerraces])

  // Fiche ouverte : les terrasses ENSOLEILLÉES du quartier (note ≥ 6), triées
  // de la plus ensoleillée à la plus proche. On NE conditionne PLUS au fait
  // d'être « mieux que la sélection » (avant : ça vidait quasi toujours la liste
  // → « jamais de reco »). On élargit aussi le rayon à 700 m. Si rien n'est au
  // soleil (nuit / tout à l'ombre) → liste vide → message honnête.
  const SUNNY = 3.5 // score ≥ 3.5 → note ≥ 7 (« bien ensoleillé », pour le message)
  const NEARBY_SUN = 3 // score ≥ 3 → note ≥ 6 (« ensoleillé »)
  const sunnyNearby = useMemo(() => {
    if (!selectedPlace) return []
    const [la, lo] = placeCoord(selectedPlace)
    return allTerraces
      .filter(p => p.id !== selectedPlace.id)
      .map(p => { const [pa, po] = placeCoord(p); return { p, s: p.currentScore ?? 0, d: distanceM(la, lo, pa, po) } })
      .filter(x => x.d <= 400 && x.s >= NEARBY_SUN) // quartier resserré (≈ 5 min à pied)
      .sort((a, b) => b.s - a.s || a.d - b.d)
      .slice(0, 8)
      .map(x => x.p)
  }, [selectedPlace, allTerraces])

  // L'endroit choisi est-il déjà bien ensoleillé ? (pour le message si aucune reco)
  const selectedIsSunny = (selectedPlace?.currentScore ?? 0) >= SUNNY


  // ── Scores en DIRECT au mouvement du slider ───────────────────────────────
  // Les TERRASSES sont recalculées LOCALEMENT (terraceSunScore : soleil +
  // orientation + nuages) sans attendre le réseau → réactif au curseur.
  // Petit debounce 90 ms pour throttler le rebuild de la couche carte.
  //
  // ⚠️ `places` EST dans les deps (avant : seulement [hour, cloudForHour]).
  // Sinon, au montage `places` est vide → l'effet sortait tôt et NE RE-TOURNAIT
  // JAMAIS quand les lieux arrivaient → les terrasses gardaient le score DB (ou
  // le défaut 3 → note 6) au lieu du score live. Résultat visible : à 22h, soleil
  // couché, des recos affichaient « 6/10 » / « 9/10 » et la note ne suivait pas
  // le slider tant qu'on ne le bougeait pas. Garde anti-boucle : on renvoie la
  // MÊME référence quand rien ne change → pas de re-render, donc pas de boucle
  // (l'effet se redéclencherait sur sa propre écriture sinon).
  useEffect(() => {
    if (!places.length) return
    const d = new Date()
    d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0)

    const t = window.setTimeout(() => {
      setPlaces(prev => {
        let changed = false
        const next = prev.map(p => {
          if (p.terrace_lat == null || p.terrace_lng == null) return p
          const s = terraceSunScore(p, d, cloudForHour)
          if (p.currentScore == null || Math.abs(p.currentScore - s) > 0.01) {
            changed = true
            return { ...p, currentScore: s }
          }
          return p
        })
        return changed ? next : prev
      })
      // La fiche ouverte suit aussi le curseur en direct
      setSelectedPlace(prev => {
        if (!prev || prev.terrace_lat == null || prev.terrace_lng == null) return prev
        const s = terraceSunScore(prev, d, cloudForHour)
        if (prev.currentScore != null && Math.abs(prev.currentScore - s) <= 0.01) return prev
        return { ...prev, currentScore: s }
      })
    }, 90)
    return () => window.clearTimeout(t)
  }, [hour, cloudForHour, places]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scores des lieux SANS terrasse géolocalisée (DB précalculée) ──────────
  // Séparé et plus lent (réseau) — n'impacte pas la réactivité des terrasses.
  useEffect(() => {
    if (!places.length) return
    const slot  = hourToSlot(hour)
    const month = new Date().getMonth() + 1
    const t = window.setTimeout(async () => {
      const { data } = await supabase
        .from('sun_scores').select('place_id, score')
        .eq('month', month).eq('time_slot', slot)
      const d = new Date()
      d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0)
      const pos = getSunPosition(d, 48.8566, 2.3522)
      const alt = (pos.altitude * 180) / Math.PI
      const altScore = pos.altitude <= 0 ? 0 : alt < 5 ? 2 : alt < 15 ? 3 : alt < 35 ? 4 : 5
      const byId = new Map((data ?? []).map(r => [r.place_id, r.score]))
      setPlaces(prev => prev.map(p =>
        (p.terrace_lat != null && p.terrace_lng != null)
          ? p
          : { ...p, currentScore: byId.get(p.id) ?? altScore }
      ))
    }, 350)
    return () => window.clearTimeout(t)
  }, [hour]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleFilter = useCallback((filter: FilterType) => {
    setActiveFilters((prev) => {
      const has = prev.includes(filter)
      let next = has ? prev.filter((f) => f !== filter) : [...prev, filter]
      // En ACTIVANT un filtre eau/WC, on désactive « terrasse » automatiquement
      // (la carte se concentre sur les points d'eau / sanisettes). On peut
      // réactiver « terrasse » manuellement ensuite pour voir les deux.
      if (!has && (filter === 'fontaine' || filter === 'sanisette')) {
        next = next.filter((f) => f !== 'terrace')
      }
      return next
    })
  }, [])

  const handlePlaceSelect = useCallback(async (place: Place | null) => {
    if (!place) { setSelectedPlace(null); return }
    setSelectedAmenite(null)
    // currentScore garanti → la card affiche la même note que la carte/les recos
    setSelectedPlace({ ...place, currentScore: liveScoreOf(place) })
    setSearchQuery('')
    setSelectedScores([])     // vide les scores de la fiche précédente

    // Charge en parallèle : données complètes (photos, horaires…) + scores du mois
    const month = new Date().getMonth() + 1
    const [{ data: fullPlace }, { data: scores }] = await Promise.all([
      supabase.from('places').select('*').eq('id', place.id).single(),
      supabase
        .from('sun_scores').select('time_slot, score')
        .eq('place_id', place.id).eq('month', month)
        .order('time_slot'),
    ])

    // Mise à jour uniquement si l'utilisateur n'a pas cliqué ailleurs entretemps
    if (fullPlace) {
      setSelectedPlace(prev =>
        prev?.id === place.id
          ? ({ ...fullPlace, currentScore: liveScoreOf(fullPlace as Place) } as Place)
          : prev
      )
    }
    setSelectedScores(scores ?? [])
  }, [liveScoreOf])

  const handleClose = useCallback(() => {
    setSelectedPlace(null)
  }, [])

  const handleAmeniteSelect = useCallback((amenite: AmeniteInfo | null) => {
    setSelectedAmenite(amenite)
    if (amenite) {
      setSelectedPlace(null)  // ferme le panel lieu si open
      // Zoom caméra sur le point d'eau, comme pour une fiche lieu.
      setFocusPoint({ lng: amenite.lng, lat: amenite.lat, nonce: Date.now() })
    }
  }, [])

  /** Depuis le profil : ouvrir la fiche d'un lieu par son ID */
  const handleSelectPlaceFromProfile = useCallback(async (placeId: string) => {
    setShowProfile(false)
    const { data } = await supabase.from('places').select('*').eq('id', placeId).single()
    if (data) await handlePlaceSelect(data as Place)
  }, [handlePlaceSelect])

  // Lien partagé : /place/[id] redirige vers /?place=[id] → on ouvre la terrasse
  // directement dans la vraie interface, puis on nettoie l'URL.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('place')
    if (!id) return
    history.replaceState(null, '', '/')
    handleSelectPlaceFromProfile(id)
  }, [handleSelectPlaceFromProfile])

  // Contenu de la reco « à proximité » dans la card : soit la bande de
  // terrasses ensoleillées, soit un message honnête s'il n'y en a pas.
  const renderNearbyReco = (variant: 'compact' | 'mini') => {
    if (sunnyNearby.length > 0) {
      return (
        <SunnyStrip
          title="Plus ensoleillées à proximité"
          items={sunnyNearby}
          onSelect={handlePlaceSelect}
          noteOf={recoNote}
          compact={variant === 'compact'}
          mini={variant === 'mini'}
        />
      )
    }
    const msg = selectedIsSunny
      ? '☀️ Déjà l’une des plus ensoleillées du quartier'
      : '🌥️ Aucune terrasse vraiment au soleil juste à côté'
    return (
      <div style={{
        fontFamily: 'var(--font-outfit)', fontSize: variant === 'mini' ? 11.5 : 12.5,
        fontWeight: 700, color: 'rgba(31,58,95,0.65)', display: 'flex', alignItems: 'center', gap: 6,
        padding: '2px 2px',
      }}>
        {msg}
      </div>
    )
  }

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* ─── Contenu SEO indexable (invisible — accessibilité + Google) ───
         h1 + texte sémantique riche pour les moteurs. Aucun impact visuel
         (sr-only) ni accessibilité (lu par lecteurs d'écran). */}
      <div className="sr-only">
        <h1>Terrasses ensoleillées à Paris — carte en temps réel</h1>
        <p>
          HopSoleil est le radar des terrasses au soleil à Paris. Plus de
          19 000 bars, cafés, restaurants et parcs parisiens classés en direct
          selon leur ensoleillement, l’ombre projetée par les bâtiments voisins
          et la météo en temps réel. Trouvez la meilleure terrasse au soleil
          près de chez vous, dans le Marais, à Bastille, sur le canal
          Saint-Martin, à Oberkampf, Montmartre, Pigalle, Belleville,
          Saint-Germain, aux Batignolles ou ailleurs dans Paris.
        </p>
        <h2>Comment ça marche</h2>
        <p>
          Le score soleil va de 1 (à l’ombre) à 5 (plein soleil) et se met à
          jour toutes les 30 minutes. Il combine la position réelle du soleil
          (SunCalc), les hauteurs de bâtiments OpenStreetMap (ombres projetées
          en 3D) et la couverture nuageuse en direct sur Paris. Vous pouvez
          aussi visualiser la fenêtre d’ensoleillement de chaque terrasse
          heure par heure.
        </p>
        <h2>Catégories couvertes</h2>
        <ul>
          <li>Bars avec terrasse au soleil à Paris</li>
          <li>Cafés avec terrasse ensoleillée à Paris</li>
          <li>Restaurants avec terrasse au soleil à Paris</li>
          <li>Rooftops et bars en hauteur à Paris</li>
          <li>Parcs et jardins ensoleillés à Paris</li>
        </ul>
        <h2>Arrondissements</h2>
        <p>
          Couverture des 20 arrondissements de Paris : 1er (Châtelet, Louvre),
          2e (Sentier), 3e (Haut Marais, Temple), 4e (Marais, Saint-Paul,
          Île Saint-Louis), 5e (Quartier latin), 6e (Saint-Germain,
          Luxembourg), 7e (Invalides, Tour Eiffel), 8e (Champs-Élysées,
          Madeleine), 9e (Opéra, Pigalle), 10e (Canal Saint-Martin,
          République), 11e (Bastille, Oberkampf, Charonne), 12e (Bercy,
          Nation), 13e (Gobelins, Butte-aux-Cailles), 14e (Denfert,
          Montparnasse), 15e (Grenelle), 16e (Trocadéro, Passy, Auteuil),
          17e (Batignolles), 18e (Montmartre, Pigalle, Sacré-Cœur), 19e
          (Buttes-Chaumont, Belleville), 20e (Ménilmontant, Père-Lachaise).
        </p>
      </div>

      {/* Carte plein écran */}
      <div className="absolute left-0 right-0 bottom-0" style={{ top: isDesktop ? headerH : 0 }} role="application" aria-label="Carte des terrasses ensoleillées à Paris">
        <MapView
          places={displayedPlaces}
          onPlaceSelect={handlePlaceSelect}
          highlightPlaceId={selectedPlace?.id}
          focusPlace={mapFocusPlace}
          sunHour={hour}
          homeView={homeViewCount}
          flyToTarget={flyToTarget}
          focusPoint={focusPoint}
          showFontaines={activeFilters.includes('fontaine')}
          showSanisettes={activeFilters.includes('sanisette')}
          onAmeniteSelect={handleAmeniteSelect}
          geolocateNonce={geolocateNonce}
        />
      </div>

      {/* ══════ HEADER RESPONSIVE ══════
           Mobile  : Row 1 = date+météo · logo · profil
                     Row 2 = slider full-width
           Desktop : Row 1 = date+météo · logo · slider+profil          */}
      <header
        ref={headerRef}
        className="absolute top-0 inset-x-0 z-20"
        style={{
          background: 'rgba(252,249,243,0.99)',
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
              {/* Pollen / canicule badge (desktop) */}
              {conditions && (conditions.pollenLevel >= 1 || conditions.isHeatwave) && (
                <div style={{ display: 'flex', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                  {conditions.pollenLevel >= 1 && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, lineHeight: 1,
                      background: conditions.pollenLevel >= 2 ? 'rgba(120,160,60,0.14)' : 'rgba(140,170,80,0.10)',
                      color: conditions.pollenLevel >= 2 ? '#5a7a20' : '#6a8a30',
                      borderRadius: 999, padding: '2px 7px',
                      border: '1px solid rgba(100,140,50,0.22)',
                    }}>
                      🌿 Pollen {conditions.pollenLabel.toLowerCase()}
                    </span>
                  )}
                  {conditions.isHeatwave && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, lineHeight: 1,
                      background: 'rgba(255,100,60,0.12)', color: '#c44020',
                      borderRadius: 999, padding: '2px 7px',
                      border: '1px solid rgba(255,100,60,0.22)',
                    }}>
                      🌡️ {conditions.feelsLike !== null ? `${Math.round(conditions.feelsLike)}° ressenti` : 'Canicule'}
                    </span>
                  )}
                </div>
              )}
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
              {/* Pollen / canicule badge (mobile) */}
              {conditions && (conditions.pollenLevel >= 1 || conditions.isHeatwave) && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 1 }}>
                  {conditions.pollenLevel >= 1 && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, lineHeight: 1,
                      background: conditions.pollenLevel >= 2 ? 'rgba(120,160,60,0.14)' : 'rgba(140,170,80,0.10)',
                      color: conditions.pollenLevel >= 2 ? '#5a7a20' : '#6a8a30',
                      borderRadius: 999, padding: '2px 6px',
                      border: '1px solid rgba(100,140,50,0.22)', whiteSpace: 'nowrap',
                    }}>
                      🌿 {conditions.pollenLabel}
                    </span>
                  )}
                  {conditions.isHeatwave && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, lineHeight: 1,
                      background: 'rgba(255,100,60,0.12)', color: '#c44020',
                      borderRadius: 999, padding: '2px 6px',
                      border: '1px solid rgba(255,100,60,0.22)', whiteSpace: 'nowrap',
                    }}>
                      🌡️ {conditions.feelsLike !== null ? `${Math.round(conditions.feelsLike)}°` : '+'}
                    </span>
                  )}
                </div>
              )}
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
                  type="range" min={6} max={23.75} step={0.25}
                  value={hour}
                  onInput={(e) => { stopSlotAnim(); setHour(parseFloat((e.target as HTMLInputElement).value)) }}
                  onChange={(e) => { stopSlotAnim(); setHour(parseFloat(e.target.value)) }}
                  className="cb-hour-slider"
                  style={{ flex: 1, minWidth: 0 }}
                  aria-label="Heure du soleil"
                />
                <span className="font-outfit shrink-0" style={{ fontSize: 12.5, fontWeight: 900, color: '#1F3A5F', lineHeight: 1, minWidth: 44 }}>
                  {formatHourLabelPad(hour)}
                </span>
                <button
                  onClick={() => { stopSlotAnim(); setHour(nowQuarter()) }}
                  aria-label="Heure actuelle"
                  className="shrink-0 inline-flex items-center justify-center rounded-full transition-all active:scale-[0.90]"
                  style={{
                    width: 24, height: 24,
                    background: Math.abs(hour - nowQuarter()) < 0.2 ? '#EDC145' : 'rgba(31,58,95,0.09)',
                    border: `1px solid ${Math.abs(hour - nowQuarter()) < 0.2 ? 'rgba(237,193,69,0.55)' : 'transparent'}`,
                    boxShadow: Math.abs(hour - nowQuarter()) < 0.2 ? '0 2px 8px rgba(237,193,69,0.40)' : 'none',
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
                overflow: 'hidden',
              }}
            >
              {userId && profileAvatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profileAvatarUrl} alt="" width={38} height={38} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                : <UserCircle
                    size={18} strokeWidth={2}
                    style={{ color: showProfile ? '#EDC145' : userId ? '#b87c00' : 'rgba(31,58,95,0.40)' }}
                  />
              }
            </button>
          </div>
        </div>

      </header>

      {/* ── Slider mobile — bulle flottante détachée du header ── */}
      {!isDesktop && (
        <div
          className="absolute inset-x-0 z-[18]"
          style={{ top: 'calc(max(env(safe-area-inset-top, 0px), 8px) + 72px)', padding: '0 12px' }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(254,252,248,0.99)',
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
              type="range" min={6} max={23.75} step={0.25}
              value={hour}
              onInput={(e) => setHour(parseFloat((e.target as HTMLInputElement).value))}
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
              color: '#1F3A5F', lineHeight: 1, minWidth: 44, textAlign: 'right', flexShrink: 0 }}>
              {formatHourLabelPad(hour)}
            </span>
            <button
              onClick={() => setHour(nowQuarter())}
              aria-label="Heure actuelle"
              className="inline-flex items-center justify-center rounded-full transition-all active:scale-[0.88]"
              style={{
                width: 26, height: 26, flexShrink: 0,
                background: Math.abs(hour - nowQuarter()) < 0.2 ? '#EDC145' : 'rgba(31,58,95,0.08)',
                border: `1.5px solid ${Math.abs(hour - nowQuarter()) < 0.2 ? 'rgba(237,193,69,0.55)' : 'transparent'}`,
                boxShadow: Math.abs(hour - nowQuarter()) < 0.2 ? '0 3px 10px rgba(237,193,69,0.45)' : 'none',
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

      {/* ── Spinner soleil — overlay sur la carte seulement (header + recherche restent visibles) ── */}
      {loading && (
        <>
          <style>{`
            @keyframes cb-spin-sun { to { transform: rotate(360deg) } }
            @keyframes cb-sun-pulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.08); opacity: 0.92 } }
          `}</style>
          <div
            aria-live="polite" aria-label="Chargement des terrasses en cours"
            style={{
              position: 'absolute',
              top: isDesktop ? headerH : headerH,
              left: 0, right: 0,
              bottom: 0,
              zIndex: 15,           // sous le header (z-20) et le slider (z-18)
              background: 'rgba(255,252,243,0.88)',
              backdropFilter: 'blur(4px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 14,
              pointerEvents: 'none',
            }}
          >
            <div style={{ position: 'relative', width: 60, height: 60 }} aria-hidden="true">
              {/* Rayons dorés qui tournent — pointe lumineuse en rotation (effet halo) */}
              <svg width={60} height={60} viewBox="0 0 60 60"
                style={{ position: 'absolute', inset: 0, animation: 'cb-spin-sun 1.1s linear infinite' }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <rect key={i} x={28.4} y={3} width={3.2} height={11} rx={1.6}
                    fill="#EDC145" opacity={0.16 + (i / 7) * 0.84}
                    transform={`rotate(${i * 45} 30 30)`} />
                ))}
              </svg>
              {/* Cœur du soleil — dégradé doux + léger battement */}
              <div style={{
                position: 'absolute', inset: 17, borderRadius: '50%',
                background: 'radial-gradient(circle at 38% 34%, #FFE89A 0%, #EDC145 56%, #F2A23B 100%)',
                boxShadow: '0 2px 12px rgba(237,193,69,0.55), 0 0 0 5px rgba(237,193,69,0.12)',
                animation: 'cb-sun-pulse 1.6s ease-in-out infinite',
              }} />
            </div>
            <p style={{ margin: 0, fontFamily: 'var(--font-outfit)', fontSize: 13, fontWeight: 800, color: '#1F3A5F', opacity: 0.72 }}>
              Chargement des terrasses…
            </p>
          </div>
        </>
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

      {/* ══════════════ BOTTOM BAR — floating pill centré ══════════════ */}
      {!selectedPlace && !selectedAmenite && (
        <div
          className="absolute bottom-0 inset-x-0 z-20 flex justify-center"
          style={{ padding: '0 12px', paddingBottom: 'max(env(safe-area-inset-bottom,0px), 10px)', pointerEvents: 'none' }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              pointerEvents: 'auto',
              background: 'rgba(252,249,243,0.99)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1.5px solid rgba(31,58,95,0.10)',
              borderRadius: 20,
              boxShadow: '0 8px 32px rgba(31,58,95,0.13), 0 2px 8px rgba(31,58,95,0.06)',
              overflow: 'hidden',
            }}
          >
            {/* Suggestions : lieux + rues/adresses */}
            {searchQuery.trim() && (suggestions.length > 0 || geoResults.length > 0) && (
              <div
                className="overflow-y-auto"
                style={{ maxHeight: 264, borderBottom: '1px solid rgba(31,58,95,0.07)' }}
              >
                {/* ─ Lieux ─ */}
                {suggestions.length > 0 && (
                  <ul role="listbox" aria-label="Lieux suggérés">
                    {geoResults.length > 0 && (
                      <li aria-hidden="true" className="px-4 pt-2.5 pb-1 font-outfit font-bold uppercase"
                          style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(31,58,95,0.40)' }}>
                        Lieux
                      </li>
                    )}
                    {suggestions.map((p) => {
                      const cp = p.address.match(/\b75(\d{3})\b/)
                      const arr = p.arrondissement ?? (cp ? parseInt(cp[1]) : null)
                      // Ligne 2 : Paris → "11e · rue" ; hors Paris → "rue · Ville"
                      const parts = p.address.split(',').map((s) => s.trim()).filter(Boolean)
                      // Re-fusionne un numéro isolé avec sa rue ("163-165, Rue X" → "163-165 Rue X")
                      if (parts.length > 1 && /^\d+([-–/]\d+)?\s*(bis|ter)?$/i.test(parts[0])) {
                        parts.splice(0, 2, `${parts[0]} ${parts[1]}`)
                      }
                      const street = parts[0] ?? p.address
                      // Ville = partie avec code postal (fiable), sinon 1re partie alpha hors "France"
                      const pcPart = parts.slice(1).find((s) => /^\d{4,5}\s+\D/.test(s))
                      const city = pcPart
                        ? pcPart.replace(/^\d{4,5}\s*/, '').replace(/\s*cedex.*$/i, '').trim()
                        : (parts.slice(1).find((s) => /^[A-Za-zÀ-ÿ' -]+$/.test(s) && !/^france$/i.test(s)) ?? '')
                      const meta = arr
                        ? `${arr}${arr === 1 ? 'er' : 'e'} · ${street}`
                        : city ? `${street} · ${city}` : street
                      return (
                        <li key={p.id} role="option">
                          <button
                            onClick={() => handlePlaceSelect(p)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[rgba(31,58,95,0.05)] transition"
                          >
                            <span
                              className="shrink-0 flex items-center justify-center"
                              style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(31,58,95,0.06)' }}
                            >
                              <PlaceTypeIcon type={p.type} size={16} color="#1F3A5F" />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block font-bold text-[13px] text-text-primary truncate">{p.name}</span>
                              <span className="block font-outfit text-[11px] text-text-soft truncate">
                                {meta}
                              </span>
                            </span>
                            {(p.currentScore ?? 0) >= 4 && (
                              <Sun size={15} strokeWidth={2.4} className="shrink-0" style={{ color: '#FFBE0B', fill: '#FFBE0B' }} aria-label="Au soleil" />
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {/* ─ Rues & adresses (géocodage Mapbox) ─ */}
                {geoResults.length > 0 && (
                  <ul role="listbox" aria-label="Rues et adresses"
                      style={suggestions.length > 0 ? { borderTop: '1px solid rgba(31,58,95,0.07)' } : undefined}>
                    <li aria-hidden="true" className="px-4 pt-2.5 pb-1 font-outfit font-bold uppercase"
                        style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(31,58,95,0.40)' }}>
                      Rues &amp; adresses
                    </li>
                    {geoResults.map((g) => (
                      <li key={g.id} role="option">
                        <button
                          onClick={() => handleGeoSelect(g)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[rgba(31,58,95,0.05)] transition"
                        >
                          <span
                            className="shrink-0 flex items-center justify-center"
                            style={{ width: 30, height: 30, borderRadius: 9, background: 'rgba(58,134,255,0.10)' }}
                          >
                            <MapPin size={16} strokeWidth={2.2} style={{ color: '#3A86FF' }} aria-hidden="true" />
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block font-bold text-[13px] text-text-primary truncate">{g.title}</span>
                            {g.subtitle && (
                              <span className="block font-outfit text-[11px] text-text-soft truncate">{g.subtitle}</span>
                            )}
                          </span>
                          <ArrowUpRight size={15} strokeWidth={2.2} className="shrink-0" style={{ color: 'rgba(31,58,95,0.30)' }} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* ── Reco terrasses au soleil maintenant (cachées en recherche) ── */}
            {!searchQuery.trim() && sunnyTop.length > 0 && (
              <div className="px-3 pt-3">
                <SunnyStrip
                  title={sunnyTitle}
                  items={sunnyTop}
                  onSelect={handlePlaceSelect}
                  noteOf={recoNote}
                  compact
                />
              </div>
            )}

            {/* Aucune terrasse au soleil (nuit / tout à l'ombre) → message honnête
                plutôt qu'une bande vide ou de fausses notes. */}
            {!searchQuery.trim() && !loading && sunnyTop.length === 0 && (
              <div className="px-3 pt-3">
                <div
                  className="flex items-center gap-2.5"
                  style={{
                    background: 'rgba(141,153,174,0.10)',
                    border: '1px solid rgba(141,153,174,0.22)',
                    borderRadius: 13, padding: '10px 12px',
                  }}
                >
                  <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1 }}>🌥️</span>
                  <span style={{ fontFamily: 'var(--font-outfit)', fontSize: 12.5, fontWeight: 700, color: '#5b6776', lineHeight: 1.3 }}>
                    Toutes les terrasses sont à l’ombre pour l’instant.{' '}
                    <span style={{ color: 'rgba(31,58,95,0.55)', fontWeight: 600 }}>
                      Changez l’heure avec le curseur ou ajustez les filtres.
                    </span>
                  </span>
                </div>
              </div>
            )}

            {/* ── Bulles d'aperçu solaire ── (cachées pendant une recherche) */}
            {!searchQuery.trim() && (
              <div className="px-3 pt-3">
                <SunSlotBubbles
                  sunsetHour={sunsetHour}
                  activeSlot={activeSlot}
                  onPreview={previewSlot}
                />
              </div>
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

      {/* ─── Contrôles carte : géoloc + recentrer ───
           • Desktop : colonne, sous le header (le slider est DANS le header).
           • Mobile : RANGÉE côte à côte, juste SOUS le slider flottant — sinon le
             slider pleine largeur (z-18) les recouvrait. z au-dessus du slider +
             clairance verticale → jamais masqués.
           Décalés à gauche du panneau desktop quand il est ouvert. */}
      <div
        style={{
          position: 'absolute',
          top: isDesktop
            ? `calc(${headerH || 64}px + 12px)`
            : 'calc(max(env(safe-area-inset-top, 0px), 8px) + 142px)',
          right: isDesktop && (selectedPlace || selectedAmenite || showProfile) ? 434 : 14,
          zIndex: 19, // au-dessus du slider mobile (z-18) → jamais caché
          display: 'flex', flexDirection: isDesktop ? 'column' : 'row', gap: 8,
          transition: 'right 280ms cubic-bezier(0.2,0.8,0.2,1)',
        }}
      >
        <button
          onClick={() => setGeolocateNonce(c => c + 1)}
          aria-label="Me localiser"
          title="Me localiser"
          className="active:scale-[0.88] transition-transform"
          style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'rgba(254,252,248,0.99)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
            border: '1.5px solid rgba(31,58,95,0.12)', boxShadow: '0 4px 16px rgba(31,58,95,0.14)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <LocateFixed size={18} strokeWidth={2} style={{ color: '#3A86FF' }} />
        </button>
        <button
          onClick={() => { setHomeViewCount(c => c + 1) }}
          aria-label="Recentrer la carte sur Paris"
          title="Recentrer"
          className="active:scale-[0.88] transition-transform"
          style={{
            width: 42, height: 42, borderRadius: '50%',
            background: 'rgba(254,252,248,0.99)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
            border: '1.5px solid rgba(31,58,95,0.12)', boxShadow: '0 4px 16px rgba(31,58,95,0.14)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Compass size={18} strokeWidth={2} style={{ color: '#1F3A5F' }} />
        </button>
      </div>

      {/* ─── Panel Profil (desktop : côté droit, mobile : bottom sheet) ─── */}
      {showProfile && isDesktop && (
        <aside
          className="absolute right-0 z-40 overflow-y-auto"
          style={{
            top: headerH,
            height: `calc(100dvh - ${headerH}px)`,
            width: 420,
            background: 'rgba(254,252,248,0.99)',
            backdropFilter: 'blur(22px)',
            borderLeft: '1.5px solid rgba(31,58,95,0.10)',
            boxShadow: '-16px 0 40px rgba(31,58,95,0.12)',
          }}
          role="complementary" aria-label="Mon profil"
        >
          <ProfilePanel
            onClose={() => setShowProfile(false)}
            onAuthChange={(u) => setUserId(u?.id ?? null)}
            onSelectPlace={handleSelectPlaceFromProfile}
          />
        </aside>
      )}

      {showProfile && !isDesktop && (
        <section
          className="absolute bottom-0 inset-x-0 z-40"
          style={{
            height: '90dvh',
            background: 'rgba(254,252,248,0.99)',
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
              onSelectPlace={handleSelectPlaceFromProfile}
            />
          </div>
        </section>
      )}

      {/* ─── Panel fontaine / sanisette (desktop : côté droit, mobile : bottom sheet) ─── */}
      {selectedAmenite && isDesktop && (
        <aside
          className="absolute right-0 z-30 overflow-y-auto"
          style={{
            top: headerH,
            height: `calc(100dvh - ${headerH}px)`,
            width: 420,
            background: 'rgba(254,252,248,0.99)',
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
            onSelectAmenite={handleAmeniteSelect}
          />
        </aside>
      )}

      {selectedAmenite && !isDesktop && (
        <MobileSheet
          ariaLabel="Détails du point d'intérêt"
          onClose={() => setSelectedAmenite(null)}
          peek={<AmenitePeek amenite={selectedAmenite} onClose={() => setSelectedAmenite(null)} />}
        >
          <FicheAmenitePanel
            amenite={selectedAmenite}
            onClose={() => setSelectedAmenite(null)}
            userId={userId}
            onOpenProfile={() => { setShowProfile(true); setSelectedAmenite(null) }}
            onSelectAmenite={handleAmeniteSelect}
            bare
          />
        </MobileSheet>
      )}

      {/* ─── Panel lieu sélectionné (desktop : côté droit, mobile : bottom sheet) ─── */}
      {selectedPlace && isDesktop && (
        <aside
          className="absolute right-0 z-30"
          style={{
            top: headerH,
            height: `calc(100dvh - ${headerH}px)`,
            width: 420,
            display: 'flex', flexDirection: 'column',
            background: 'rgba(254,252,248,0.99)',
            backdropFilter: 'blur(22px)',
            borderLeft: '1px solid rgba(20,32,51,0.10)',
            boxShadow: '-18px 0 48px rgba(11,31,58,0.18)',
          }}
          role="complementary" aria-label={`Détails de ${selectedPlace.name}`}
        >
          <div style={{ padding: '10px 14px 9px', borderBottom: '1px solid rgba(31,58,95,0.08)', flexShrink: 0 }}>
            {renderNearbyReco('compact')}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <PlacePageClient
              place={selectedPlace}
              scores={selectedScores}
              hour={hour}
              onHourChange={setHour}
              onClose={handleClose}
              userId={userId}
              onOpenProfile={() => { setShowProfile(true); setSelectedPlace(null) }}
              sunsetHour={sunsetHour}
              activeSlot={activeSlot}
              onSlotPreview={previewSlot}
              cloudCover={cloudForHour}
            />
          </div>
        </aside>
      )}

      {selectedPlace && !isDesktop && (
        <PlacePreview
          place={selectedPlace}
          hour={hour}
          onClose={handleClose}
          userId={userId}
          onOpenProfile={() => { setShowProfile(true); setSelectedPlace(null) }}
          sunsetHour={sunsetHour}
          activeSlot={activeSlot}
          onSlotPreview={previewSlot}
          cloudCover={cloudForHour}
          reco={renderNearbyReco('mini')}
        />
      )}


      <PwaInstallPrompt />
    </main>
  )
}

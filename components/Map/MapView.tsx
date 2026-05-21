'use client'

/**
 * MapView v3 - GeoJSON source + Mapbox GL native layers (cluster).
 * Gère des milliers de lieux sans jank DOM.
 * Pins colorés par score (0-5), regroupés en clusters au dézoom.
 */

import { useEffect, useRef, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Place } from '@/types'
import { getSunPosition } from '@/lib/suncalc'

const PARIS_CENTER: [number, number] = [2.3522, 48.8566]

// Couleurs (bg/text) par score 0..5 — dominante chaude pour 5/4/3.
const SCORE_BG = ['#0b1f3a', '#cbd5e1', '#98a2b3', '#f77f00', '#ffd76a', '#ffb703']
const SCORE_TX = ['#ffffff', '#142033', '#ffffff', '#ffffff', '#3a2700', '#0b1f3a']

// ── Diamond pin — border-radius:50% 50% 50% 12px rotate(-45deg) ──────────────
// Matches the HTML mockup's .pin shape exactly.
function drawPinImage(score: number): { width: number; height: number; data: Uint8Array } {
  const W = 54, H = 60
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  const bg = SCORE_BG[score] ?? SCORE_BG[3]
  const tx = SCORE_TX[score] ?? SCORE_TX[3]

  // Square size (pre-rotation). After -45° rotation, the bottom-left corner
  // (small radius = point) becomes the bottom-most tip of the diamond.
  const SIZE = 30
  const CX = W / 2        // horizontal center
  const CY = H / 2 - 1   // vertical center of the square

  // Radii: top-left=50%, top-right=50%, bottom-right=50%, bottom-left=12px equiv
  const r50 = SIZE / 2          // 15px
  const r12 = Math.round(SIZE * 12 / 46)  // ≈ 8px

  // Drop shadow
  ctx.save()
  ctx.shadowColor   = 'rgba(11,31,58,0.34)'
  ctx.shadowBlur    = 14
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 6

  // Draw rounded square rotated -45°
  ctx.translate(CX, CY)
  ctx.rotate(-Math.PI / 4)
  ctx.beginPath()
  const rr = ctx as CanvasRenderingContext2D & { roundRect?: (...a: unknown[]) => void }
  if (rr.roundRect) {
    rr.roundRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE, [r50, r50, r50, r12])
  } else {
    ctx.arc(0, 0, SIZE / 2, 0, Math.PI * 2)
  }
  ctx.fillStyle = bg
  ctx.fill()
  ctx.restore()

  // White border (no shadow, same transform)
  ctx.save()
  ctx.translate(CX, CY)
  ctx.rotate(-Math.PI / 4)
  ctx.beginPath()
  if (rr.roundRect) {
    rr.roundRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE, [r50, r50, r50, r12])
  } else {
    ctx.arc(0, 0, SIZE / 2, 0, Math.PI * 2)
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.restore()

  // icon + score — drawn at normal orientation (center CX, CY)
  ctx.fillStyle = tx
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (score === 0) {
    ctx.font = '16px system-ui'
    ctx.fillText('🌙', CX, CY + 1)
  } else {
    ctx.font = 'bold 10px system-ui, sans-serif'
    ctx.fillText('☀', CX, CY - 5.5)
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillText(String(score), CX, CY + 6)
  }

  return { width: W, height: H, data: new Uint8Array(ctx.getImageData(0, 0, W, H).data.buffer) }
}

// ── Style CielBleu ─────────────────────────────────────────────────────────
// Catégories de POIs Mapbox qu'on garde : nourriture (bar/resto/café),
// parcs/jardins, métro/RER/tram. Tout le reste (hôtels, shops, banques,
// gymnases, écoles, etc.) est filtré.
const ALLOWED_POI_CLASSES = [
  'food_and_drink',
  'food_and_drink_stores',
  'park_like',
  'park',
  'rail',
  'transit',
]
const ALLOWED_POI_MAKI = [
  'bar', 'beer', 'restaurant', 'fast-food', 'cafe', 'pub', 'wine', 'ice-cream',
  'park', 'garden', 'playground', 'park-alt1',
  'rail-metro', 'rail-light', 'rail', 'tram', 'entrance',
]

/**
 * Active des ombres RÉALISTES, calculées heure par heure depuis la vraie
 * position du soleil (suncalc). On combine :
 *   1) `lightPreset` Standard pour le mood chromatique (couleurs ciel/sol)
 *   2) `setLights()` pour la direction PRÉCISE du soleil (azimut/altitude réels)
 *   3) `setPaintProperty('2d-building', 'fill-extrusion-cast-shadows', true)`
 *      pour que les bâtiments PROJETTENT leurs ombres au sol
 */
function applySunLightingByHour(map: mapboxgl.Map, lat: number, lng: number, h: number) {
  // Date construite depuis l'heure du slider (résolution 1 min)
  const d = new Date()
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)

  const sun     = getSunPosition(d, lat, lng)
  const azNorth = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const altDeg  = (sun.altitude * 180) / Math.PI
  const isDay   = altDeg > -2
  // polar = angle depuis la verticale ; soleil bas → grande polar → ombres longues
  const polar   = Math.min(86, Math.max(20, 90 - Math.max(altDeg, 4)))

  // 1) lightPreset Standard : mood chromatique (dawn/day/dusk/night)
  let preset: 'dawn' | 'day' | 'dusk' | 'night'
  if      (altDeg < -3)            preset = 'night'
  else if (altDeg < 8 && h < 12)   preset = 'dawn'
  else if (altDeg < 8 && h >= 12)  preset = 'dusk'
  else                             preset = 'day'

  const setConfig = (map as unknown as {
    setConfigProperty?: (importId: string, name: string, value: unknown) => void
  }).setConfigProperty
  if (typeof setConfig === 'function') {
    try { setConfig.call(map, 'basemap', 'lightPreset', preset) } catch { /* noop */ }
  }

  // Mapbox Standard a déjà `fill-extrusion-cast-shadows: true` par défaut
  // sur ses layers building — pas besoin de le forcer.

  // 2) setLights avec direction solaire RÉELLE — réagit au pixel près au slider
  const setLightsFn = (map as unknown as { setLights?: (l: unknown[]) => void }).setLights
  if (typeof setLightsFn !== 'function') return

  if (isDay) {
    const lightColor = altDeg < 8  ? '#FFCC9A'   // lumière chaude rasante
                    : altDeg < 20 ? '#FFE8BC'
                                  : '#FFF8E8'
    const intensity = Math.min(0.95, Math.max(0.40, 0.45 + altDeg / 80))
    const ambInt    = Math.max(0.16, 0.34 - altDeg / 130)
    const shadowInt = Math.min(0.92, Math.max(0.55, 0.55 + altDeg / 100))
    try {
      setLightsFn.call(map, [
        { id: 'cb-amb', type: 'ambient',     properties: { color: '#FFEED8', intensity: ambInt } },
        { id: 'cb-sun', type: 'directional', properties: {
          color: lightColor, intensity,
          direction: [azNorth, polar],
          'cast-shadows': altDeg > 2,
          'shadow-intensity': shadowInt,
          'shadow-quality': 0.85,
        }},
      ])
    } catch { /* noop */ }
  } else {
    try {
      setLightsFn.call(map, [
        { id: 'cb-amb', type: 'ambient',     properties: { color: '#1A2840', intensity: 0.18 } },
        { id: 'cb-sun', type: 'directional', properties: {
          color: '#2A3C58', intensity: 0.05,
          direction: [0, 88], 'cast-shadows': false,
        }},
      ])
    } catch { /* noop */ }
  }
}

/**
 * Calcule le bearing (en degrés compass) pointant du point (lat,lng) vers
 * la façade la plus proche du polygone de bâtiment. Sert à positionner
 * la caméra "en face de la façade".
 */
function bearingFromBuildingPoly(
  shape: { type?: string; coordinates?: unknown },
  lat: number, lng: number,
): number | null {
  if (!shape?.type) return null
  let ring: number[][] | null = null
  if (shape.type === 'Polygon') {
    ring = (shape as { coordinates: number[][][] }).coordinates[0]
  } else if (shape.type === 'MultiPolygon') {
    const coords = (shape as { coordinates: number[][][][] }).coordinates
    if (coords?.length) ring = coords[0][0]
  }
  if (!ring || ring.length < 3) return null

  const cosLat = Math.cos(lat * Math.PI / 180)
  let bestDist = Infinity
  let bestBearing: number | null = null

  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[i + 1]
    // Midpoint relatif (en m)
    const mx = ((ax + bx) / 2 - lng) * 111320 * cosLat
    const my = ((ay + by) / 2 - lat) * 111320
    const d = Math.sqrt(mx * mx + my * my)
    if (d > 80 || d < 1) continue
    // Vecteur arête + normale
    const ex = (bx - ax) * 111320 * cosLat
    const ey = (by - ay) * 111320
    const el = Math.sqrt(ex * ex + ey * ey)
    if (el < 0.5) continue
    const n1x = ey / el, n1y = -ex / el
    const dot = n1x * (-mx) + n1y * (-my)
    // Normale orientée VERS le bar (le pin)
    const nx = dot > 0 ? n1x : -n1x
    const ny = dot > 0 ? n1y : -n1y
    // Compass bearing du vecteur (-nx, -ny) : direction du bar VERS la façade
    const cb = ((Math.atan2(-nx, -ny) * 180 / Math.PI) + 360) % 360
    if (d < bestDist) { bestDist = d; bestBearing = cb }
  }
  return bestBearing
}

function applyStyle(map: mapboxgl.Map) {
  // Le style custom Mapbox a ses propres POIs avec un schéma qu'on ne connaît pas
  // d'avance. Stratégie en 3 étapes :
  //   1) Tenter un setFilter sur chaque layer POI (filtre standard class/maki/type)
  //   2) Sur chaque feature affichée, vérifier des propriétés permissives
  //   3) Si même après filter, on voit que des features non voulues sortent, fallback
  //      sur hide visibility pour les layers à fort risque (lodging-only, shop-only…)
  const HIDE_KEYWORDS = ['lodging', 'hotel', 'shop', 'office', 'school', 'hospital',
    'bank', 'atm', 'lawyer', 'cemetery', 'religious', 'industrial', 'fuel',
    'parking', 'pharmacy', 'cosmetic', 'health', 'sport', 'attraction', 'museum',
    'monument', 'historic', 'entertainment', 'cinema', 'theatre', 'gym']

  for (const l of map.getStyle().layers ?? []) {
    if (l.type !== 'symbol') continue
    if (!l.id.includes('poi') && !l.id.includes('label')) continue

    // Heuristique 1 : si l'id du layer contient un mot-clé "à cacher", on masque tout
    if (HIDE_KEYWORDS.some(kw => l.id.toLowerCase().includes(kw))) {
      try { map.setLayoutProperty(l.id, 'visibility', 'none') } catch { /* noop */ }
      continue
    }

    // Heuristique 2 : tenter un filter strict
    if (!l.id.includes('poi')) continue
    try {
      const existing = (l as { filter?: unknown }).filter
      const restrict: unknown = ['any',
        ['in', ['get', 'class'],    ['literal', ALLOWED_POI_CLASSES]],
        ['in', ['get', 'maki'],     ['literal', ALLOWED_POI_MAKI]],
        ['in', ['get', 'type'],     ['literal', ALLOWED_POI_MAKI]],
        ['in', ['get', 'category'], ['literal', ALLOWED_POI_CLASSES]],
        ['in', ['get', 'subclass'], ['literal', ALLOWED_POI_MAKI]],
      ]
      const combined = existing
        ? ['all', existing, restrict]
        : restrict
      map.setFilter(l.id, combined as Parameters<typeof map.setFilter>[1])
    } catch { /* noop */ }
  }
}

// ── Composant ──────────────────────────────────────────────────────────────

interface Props {
  places: Place[]
  onPlaceSelect: (place: Place | null) => void
  initialCenter?: [number, number]
  initialZoom?: number
  highlightPlaceId?: string
  // Active la séquence d'arrivée immersive : carte démarre dézoomée,
  // puis flyTo vers (lng,lat) avec pitch+bearing calculés depuis la façade.
  cinematicFocus?: { lng: number; lat: number } | null
  // Zoom doux sur un lieu sélectionné (page d'accueil). Quand null → retour
  // à la caméra précédente. Ne recrée PAS la carte, économise les tiles.
  focusPlace?: { lng: number; lat: number } | null
  // Heure solaire (0..24) — pilote `lightPreset` de Mapbox Standard pour
  // changer dawn/day/dusk/night en direct avec le slider. Passer un nombre
  // évite les problèmes de référence d'objet Date dans les deps useEffect.
  sunHour?: number
  // Incrémenter ce compteur depuis l'extérieur provoque un flyTo vers le centre Paris (retour à la vue de base)
  homeView?: number
  // true = affiche fontaines/sanisettes même dézoomé + highlight
  showFontaines?: boolean
  showSanisettes?: boolean
}

interface AmeniteInfo {
  type: 'fontaine' | 'sanisette'
  props: Record<string, unknown>
  lat: number
  lng: number
}

export default function MapView({ places, onPlaceSelect, initialCenter, initialZoom, cinematicFocus, focusPlace, sunHour, homeView, showFontaines, showSanisettes }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<mapboxgl.Map | null>(null)
  const placesRef     = useRef<Place[]>(places)
  const onSelectRef   = useRef(onPlaceSelect)
  placesRef.current   = places
  onSelectRef.current = onPlaceSelect

  // Sauvegarde la caméra avant le zoom focusPlace pour pouvoir revenir
  const returnCameraRef = useRef<{ center: [number, number]; zoom: number; pitch: number; bearing: number } | null>(null)

  const [amenite, setAmenite] = useState<AmeniteInfo | null>(null)

  // GeoJSON mis à jour dès que places change
  const geojson = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, score: Math.round(p.currentScore ?? 3), name: p.name },
    })),
  }), [places])

  // Refs accessibles depuis la closure de l'init effect (deps=[]) :
  // - geojsonRef : permet d'init la source avec les places déjà chargées (évite la race condition)
  // - sunHourRef : permet d'appliquer les ombres dès style.load sans attendre le slider
  const geojsonRef  = useRef(geojson)
  geojsonRef.current = geojson
  const sunHourRef  = useRef(sunHour)
  sunHourRef.current = sunHour

  // ── Init carte (une fois) ──────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    // Si on a un cinematicFocus, on démarre EN GRAND PLAN (zoom 14)
    // pour que le flyTo qui suit donne une vraie sensation de "plongée"
    // (vue aérienne, pitch léger, pas Street View)
    const startCenter: [number, number] = cinematicFocus
      ? [cinematicFocus.lng, cinematicFocus.lat]
      : (initialCenter ?? PARIS_CENTER)
    const startZoom  = cinematicFocus ? 14.2 : (initialZoom ?? 12.4)
    const startPitch = cinematicFocus ? 0 : (initialZoom && initialZoom >= 15 ? 45 : 0)

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/kennykenny99/cmpd46pyv001801r65bnugkd3',
      center: startCenter,
      zoom: startZoom,
      minZoom: 11,
      maxZoom: 20,
      attributionControl: false,
      pitch: startPitch,
      maxBounds: [[2.10, 48.74], [2.55, 49.00]],
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    map.addControl(
      new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true, showUserHeading: true }),
      'bottom-right'
    )

    map.on('style.load', () => {
      applyStyle(map)

      // Enregistre les images de pin pour chaque score
      for (let s = 0; s <= 5; s++) {
        if (!map.hasImage(`pin-${s}`)) {
          map.addImage(`pin-${s}`, drawPinImage(s) as unknown as HTMLImageElement)
        }
      }

      // Ombres solaires dès le chargement — utilise l'heure courante via ref
      const initSunLat = cinematicFocus?.lat ?? PARIS_CENTER[1]
      const initSunLng = cinematicFocus?.lng ?? PARIS_CENTER[0]
      if (sunHourRef.current != null) {
        applySunLightingByHour(map, initSunLat, initSunLng, sunHourRef.current)
      }

      // Source GeoJSON : initialisation avec les places déjà chargées (pas d'objet vide)
      map.addSource('places', {
        type: 'geojson',
        data: geojsonRef.current,
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 55,
      })

      // Ombre clusters
      map.addLayer({
        id: 'clusters-shadow', type: 'circle', source: 'places',
        filter: ['has', 'point_count'],
        paint: {
          'circle-radius': ['step', ['get', 'point_count'], 24, 30, 30, 200, 36],
          'circle-color': 'rgba(11,31,58,0.18)',
          'circle-translate': [2, 5],
          'circle-blur': 0.4,
        },
      })

      // Clusters — fond navy (HTML mockup), anneau soleil
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'places',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': 'rgba(24,59,102,0.92)',
          'circle-radius': ['step', ['get', 'point_count'], 22, 30, 27, 200, 32],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#ffb703',
        },
      })

      // Compteur de cluster
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'places',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 13,
          'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#ffffff' },
      })

      // Pins individuels — symbol layer GPU-accelerated
      map.addLayer({
        id: 'places-pins', type: 'symbol', source: 'places',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['match', ['get', 'score'], 0, 'pin-0', 1, 'pin-1', 2, 'pin-2', 3, 'pin-3', 4, 'pin-4', 5, 'pin-5', 'pin-3'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.60, 14, 0.88, 16, 1.05, 18, 1.25],
        },
      })

      // ── Fontaines à boire (cachées par défaut, activées via filtre 💧) ──
      map.addSource('fontaines', { type: 'geojson', data: '/api/geo/fontaines' })
      map.addLayer({
        id: 'fontaines-layer', type: 'circle', source: 'fontaines',
        filter: ['==', ['get', 'dispo'], 'OUI'],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 15, 7, 18, 11],
          'circle-color': '#3A86FF',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.85,
        },
      })

      // ── Sanisettes (cachées par défaut, activées via filtre 🚻) ─────────
      map.addSource('sanisettes', { type: 'geojson', data: '/api/geo/sanisettes' })
      map.addLayer({
        id: 'sanisettes-layer', type: 'circle', source: 'sanisettes',
        filter: ['==', ['get', 'statut'], 'En service'],
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 15, 7, 18, 11],
          'circle-color': '#52B788',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.85,
        },
      })

      map.on('click', 'clusters', (e) => {
        e.originalEvent.stopPropagation()
        const f = e.features?.[0]
        if (!f || f.geometry.type !== 'Point') return
        const src = map.getSource('places') as mapboxgl.GeoJSONSource
        src.getClusterExpansionZoom(f.properties!.cluster_id as number, (err, zoom) => {
          if (err || zoom == null) return
          const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number]
          map.easeTo({ center: coords, zoom: zoom + 0.5 })
        })
      })

      // Click pin → naviguer vers le lieu
      map.on('click', 'places-pins', (e) => {
        e.originalEvent.stopPropagation()
        const id = e.features?.[0]?.properties?.id as string | undefined
        const place = placesRef.current.find((p) => p.id === id)
        if (place) onSelectRef.current(place)
      })

      map.on('mouseenter', 'clusters',    () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'clusters',    () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'places-pins', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'places-pins', () => { map.getCanvas().style.cursor = '' })

      // Curseurs + clics fontaines / sanisettes
      map.on('mouseenter', 'fontaines-layer',  () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'fontaines-layer',  () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'sanisettes-layer', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'sanisettes-layer', () => { map.getCanvas().style.cursor = '' })

      map.on('click', 'fontaines-layer', (e) => {
        e.originalEvent.stopPropagation()
        const f = e.features?.[0]
        if (f) {
          const g = f.geometry as { type: string; coordinates: [number, number] }
          const [lng, lat] = g.coordinates
          setAmenite({ type: 'fontaine', props: f.properties ?? {}, lat, lng })
        }
      })
      map.on('click', 'sanisettes-layer', (e) => {
        e.originalEvent.stopPropagation()
        const f = e.features?.[0]
        if (f) {
          const g = f.geometry as { type: string; coordinates: [number, number] }
          const [lng, lat] = g.coordinates
          setAmenite({ type: 'sanisette', props: f.properties ?? {}, lat, lng })
        }
      })

      // Labels EAU / WC au zoom 16+
      map.addLayer({
        id: 'fontaines-label', type: 'symbol', source: 'fontaines',
        filter: ['==', ['get', 'dispo'], 'OUI'], minzoom: 14,
        layout: {
          visibility: 'none',
          'text-field': '💧', 'text-size': 14,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
          'text-offset': [0, -1.6], 'text-anchor': 'bottom', 'text-allow-overlap': false,
        },
        paint: { 'text-opacity': 0.95 },
      })
      map.addLayer({
        id: 'sanisettes-label', type: 'symbol', source: 'sanisettes',
        filter: ['==', ['get', 'statut'], 'En service'], minzoom: 14,
        layout: {
          visibility: 'none',
          'text-field': '🚻', 'text-size': 14,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
          'text-offset': [0, -1.6], 'text-anchor': 'bottom', 'text-allow-overlap': false,
        },
        paint: { 'text-opacity': 0.95 },
      })

      // Force-sync : si Supabase a répondu avant que le style finisse de charger,
      // geojsonRef.current contient déjà les places — on les injecte maintenant.
      const placesSource = map.getSource('places') as mapboxgl.GeoJSONSource | undefined
      if (placesSource && geojsonRef.current.features.length > 0) {
        placesSource.setData(geojsonRef.current)
      }
    })

    // Clic fond → déselection
    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ['places-pins', 'clusters', 'fontaines-layer', 'sanisettes-layer'],
      })
      if (!hits.length) { onSelectRef.current(null); setAmenite(null) }
    })

    mapRef.current = map
    // DEBUG : expose la carte pour inspection console
    ;(window as unknown as { _cbMap?: mapboxgl.Map })._cbMap = map

    // ── Séquence cinématique : flyTo "en face du bar" après chargement ──
    if (cinematicFocus) {
      const { lng, lat } = cinematicFocus
      let disposed = false
      const sequence = async () => {
        // 1) Récupère le polygone du bâtiment et la terrasse via Paris OD
        let bearing = 0
        let targetLng = lng
        let targetLat = lat
        try {
          const r = await fetch(`/api/place-context?lat=${lat}&lng=${lng}`, {
            signal: AbortSignal.timeout(4000),
          })
          if (r.ok) {
            const ctx = await r.json()
            const shape = ctx?.building?.geo_shape
            const tCoord = ctx?.terrace?.geo_point_2d as { lat?: number; lon?: number } | undefined
            // Position cible = terrasse si dispo, sinon le bar
            const tLat = tCoord?.lat ?? lat
            const tLng = tCoord?.lon ?? lng
            targetLat = tLat
            targetLng = tLng
            // Bearing = vecteur terrasse → bar (perpendiculaire à la façade)
            if (tCoord && (Math.abs(tLat - lat) > 1e-7 || Math.abs(tLng - lng) > 1e-7)) {
              const cosLat = Math.cos(lat * Math.PI / 180)
              const dy = lat - tLat
              const dx = (lng - tLng) * cosLat
              bearing = ((Math.atan2(dx, dy) * 180 / Math.PI) + 360) % 360
            } else if (shape) {
              bearing = bearingFromBuildingPoly(shape, lat, lng) ?? 0
            }
          }
        } catch { /* on continue avec le bearing par défaut */ }
        if (disposed) return

        // 2) flyTo aérien : pitch léger (32°), padding bas pour le bottom sheet
        // → la cible apparaît dans la moitié haute, visible au-dessus du panel
        const isMobile = window.matchMedia('(max-width: 899px)').matches
        const paddingBottom = isMobile ? window.innerHeight * 0.55 : 0
        const paddingRight  = isMobile ? 0 : 420  // panel desktop = 420px
        map.flyTo({
          center: [targetLng, targetLat],
          zoom: 19.0,
          pitch: 32,
          bearing,
          duration: 2000,
          curve: 1.5,
          essential: true,
          padding: { top: 20, bottom: paddingBottom, left: 20, right: paddingRight },
        })

        // Plus de polygone de terrasse au sol — l'utilisateur trouvait ça moche.
        // Le pin du bar suffit pour situer le lieu.
      }
      // Attendre que le style soit chargé avant la séquence
      if (map.isStyleLoaded()) sequence()
      else map.once('style.load', sequence)

      return () => { disposed = true; map.remove(); mapRef.current = null }
    }

    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line

  // ── Mise à jour GeoJSON quand les places changent ─────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // IMPORTANT : utiliser geojsonRef.current (pas la closure `geojson`) pour éviter
    // le bug de closure périmée — quand once('style.load') fire, la ref a
    // toujours la valeur la plus récente même si le closure date d'un rendu antérieur.
    const update = () => {
      (map.getSource('places') as mapboxgl.GeoJSONSource | undefined)?.setData(geojsonRef.current)
    }
    if (map.isStyleLoaded()) update()
    else map.once('style.load', update)
  }, [geojson])

  // ── Zoom doux sur un lieu sélectionné (page d'accueil) ───────────────
  // focusPlace set → sauvegarde caméra + flyTo
  // focusPlace null → retour à la caméra sauvegardée
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (focusPlace) {
      const c = map.getCenter()
      returnCameraRef.current = {
        center:  [c.lng, c.lat],
        zoom:    map.getZoom(),
        pitch:   map.getPitch(),
        bearing: map.getBearing(),
      }
      const isMobile = window.matchMedia('(max-width: 899px)').matches
      map.flyTo({
        center:  [focusPlace.lng, focusPlace.lat],
        zoom:    16.5,
        pitch:   40,
        bearing: 0,
        duration: 1200,
        essential: true,
        padding: {
          top: 20,
          bottom: isMobile ? Math.round(window.innerHeight * 0.52) : 20,
          left:   20,
          right:  isMobile ? 20 : 430,
        },
      })
    } else if (returnCameraRef.current) {
      const rc = returnCameraRef.current
      map.flyTo({
        center:   rc.center,
        zoom:     rc.zoom,
        pitch:    rc.pitch,
        bearing:  0, // Toujours Nord en haut au retour
        duration: 1000,
        essential: true,
        padding:  { top: 0, bottom: 0, left: 0, right: 0 },
      })
      returnCameraRef.current = null
    }
  }, [focusPlace]) // eslint-disable-line

  // ── Vue de base Paris (clic logo HopSoleil) ────────────────────────────
  useEffect(() => {
    if (!homeView) return // valeur initiale 0 = pas de trigger
    const map = mapRef.current
    if (!map) return
    returnCameraRef.current = null // invalide tout retour en attente
    map.flyTo({
      center:   PARIS_CENTER,
      zoom:     12.4,
      pitch:    0,
      bearing:  0,
      duration: 1200,
      essential: true,
      padding:  { top: 0, bottom: 0, left: 0, right: 0 },
    })
  }, [homeView]) // eslint-disable-line

  // ── Soleil + ombres réalistes : suit `sunHour` heure par heure ────────
  // On utilise lat/lng du cinematicFocus (ou Paris par défaut) pour la
  // position solaire — Paris est petite, l'écart de soleil entre 2 points
  // est négligeable.
  const sunLat = cinematicFocus?.lat ?? PARIS_CENTER[1]
  const sunLng = cinematicFocus?.lng ?? PARIS_CENTER[0]
  useEffect(() => {
    const map = mapRef.current
    if (!map || sunHour == null) return
    const apply = () => applySunLightingByHour(map, sunLat, sunLng, sunHour)
    // setConfigProperty est safe même si le style charge encore — il met
    // simplement en file d'attente. On NE GATE PAS sur isStyleLoaded car
    // l'event style.load ne re-fire pas après le 1er chargement.
    apply()
  }, [sunHour, sunLat, sunLng])

  // ── Visibilité couches fontaines / sanisettes ──────────────────────────
  // Cachées par défaut. Le filtre active/désactive la visibilité.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const vis = (active: boolean) => active ? 'visible' : 'none' as const
      const layers: Array<[string, boolean]> = [
        ['fontaines-layer',  !!showFontaines],
        ['fontaines-label',  !!showFontaines],
        ['sanisettes-layer', !!showSanisettes],
        ['sanisettes-label', !!showSanisettes],
      ]
      for (const [id, active] of layers) {
        if (!map.getLayer(id)) continue
        try { map.setLayoutProperty(id, 'visibility', vis(active)) } catch { /* noop */ }
      }
    }
    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
  }, [showFontaines, showSanisettes])

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="w-full h-full" />

      {/* Orbit controls — rotate view around selected place */}
      {focusPlace && (
        <div
          style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            display: 'flex', flexDirection: 'column', gap: 6, zIndex: 10, pointerEvents: 'none',
          }}
        >
          <button
            onClick={() => {
              const map = mapRef.current
              if (!map) return
              map.easeTo({ bearing: ((map.getBearing() - 30) % 360 + 360) % 360, duration: 600, essential: true })
            }}
            style={{
              width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', pointerEvents: 'auto',
              background: 'rgba(255,252,243,0.95)', border: '1px solid rgba(20,32,51,0.15)',
              boxShadow: '0 4px 14px rgba(11,31,58,0.20)', fontSize: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b1f3a',
            }}
            aria-label="Pivoter à gauche"
          >↺</button>
          <button
            onClick={() => {
              const map = mapRef.current
              if (!map) return
              map.easeTo({ bearing: ((map.getBearing() + 30) % 360 + 360) % 360, duration: 600, essential: true })
            }}
            style={{
              width: 38, height: 38, borderRadius: '50%', cursor: 'pointer', pointerEvents: 'auto',
              background: 'rgba(255,252,243,0.95)', border: '1px solid rgba(20,32,51,0.15)',
              boxShadow: '0 4px 14px rgba(11,31,58,0.20)', fontSize: 20,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b1f3a',
            }}
            aria-label="Pivoter à droite"
          >↻</button>
        </div>
      )}

      {amenite && (
        <FicheAmenite
          amenite={amenite}
          map={mapRef.current}
          onClose={() => setAmenite(null)}
        />
      )}
    </div>
  )
}

// ─── FicheAmenite ─────────────────────────────────────────────────────────────

function FicheAmenite({ amenite, map, onClose }: {
  amenite: AmeniteInfo
  map: mapboxgl.Map | null
  onClose: () => void
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [svError, setSvError] = useState(false)

  useEffect(() => {
    setSvError(false) // reset si on change d'amenite
  }, [amenite.lat, amenite.lng])

  useEffect(() => {
    if (!map) return
    const update = () => {
      const p = map.project([amenite.lng, amenite.lat])
      setPos({ x: p.x, y: p.y })
    }
    update()
    map.on('move', update)
    map.on('zoom', update)
    return () => { map.off('move', update); map.off('zoom', update) }
  }, [map, amenite.lng, amenite.lat])

  const p          = amenite.props
  const isFontaine = amenite.type === 'fontaine'
  const status     = isFontaine
    ? (p.dispo === 'OUI' ? 'Disponible' : 'Indisponible')
    : (String(p.statut ?? '') === 'En service' ? 'En service' : 'Hors service')
  const statusOk = status === 'Disponible' || status === 'En service'
  const potable  = isFontaine && p.potable ? (String(p.potable) === 'OUI' ? 'Eau potable' : null) : null
  const pmr      = !isFontaine && p.acces_pmr ? (String(p.acces_pmr).toLowerCase() === 'oui' ? 'Accessible PMR' : null) : null
  const horaire  = !isFontaine && (p.horaire ?? p.horaire_ouverture) ? String(p.horaire ?? p.horaire_ouverture) : null
  const model    = isFontaine && p.modele ? String(p.modele) : null
  const adresse  = !isFontaine && p.adresse ? String(p.adresse) : null

  const title      = isFontaine ? 'Fontaine à boire' : 'Sanisette'
  const themeColor = isFontaine ? '#3A86FF' : '#4F8F65'
  const svSrc      = `/api/streetview?lat=${amenite.lat}&lng=${amenite.lng}&w=560&h=240&fov=80`
  const gmapsUrl   = `https://www.google.com/maps/dir/?api=1&destination=${amenite.lat},${amenite.lng}&travelmode=walking`

  if (!pos) return null

  return (
    <div
      className="pointer-events-auto"
      role="dialog" aria-label={title}
      style={{
        position: 'absolute',
        left: pos.x, top: pos.y,
        transform: 'translate(-50%, calc(-100% - 18px))',
        maxWidth: 290, width: 'calc(100vw - 28px)',
        zIndex: 25,
      }}
    >
      <div className="rounded-3xl overflow-hidden"
        style={{ background: 'rgba(255,253,247,0.97)', backdropFilter: 'blur(20px)',
          boxShadow: '0 18px 40px rgba(11,31,58,0.20), 0 2px 10px rgba(11,31,58,0.10)',
          border: '1px solid rgba(20,32,51,0.08)' }}>

        {/* Photo Street View ou fallback illustré */}
        <div className="relative" style={{ height: 130, overflow: 'hidden' }}>
          {!svError ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={svSrc}
                alt="Vue depuis la rue"
                onError={() => setSvError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {/* Label superposé */}
              <div style={{
                position: 'absolute', bottom: 8, left: 10,
                background: 'rgba(11,31,58,0.60)', backdropFilter: 'blur(6px)',
                borderRadius: 20, padding: '3px 10px',
                fontFamily: 'var(--font-outfit)', fontSize: 11, fontWeight: 600, color: '#fff',
              }}>
                📸 Vue depuis la rue
              </div>
            </>
          ) : (
            /* Fallback : dégradé + emoji */
            <div className="flex items-center justify-center w-full h-full"
              style={{ background: `linear-gradient(135deg, ${themeColor}18 0%, ${themeColor}38 100%)` }}>
              <span aria-hidden="true" style={{ fontSize: 64, lineHeight: 1, opacity: 0.85 }}>
                {isFontaine ? '💧' : '🚻'}
              </span>
            </div>
          )}

          {/* Bouton fermer toujours visible */}
          <button onClick={onClose}
            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-[13px]"
            style={{ background: 'rgba(255,253,247,0.92)', color: '#1B2838',
              boxShadow: '0 2px 8px rgba(11,31,58,0.18)' }}
            aria-label="Fermer">✕</button>
        </div>

        {/* Corps */}
        <div className="px-4 pt-3 pb-4">
          <p className="font-bricolage text-[17px] font-bold leading-tight"
            style={{ color: '#0b1f3a', letterSpacing: '-0.02em' }}>
            {title}
          </p>
          {adresse && (
            <p className="font-outfit text-[12px] mt-0.5 leading-snug"
              style={{ color: '#6f7a8a' }}>
              {adresse}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Chip color={statusOk ? '#3D9A70' : '#E05252'}>
              {statusOk ? '● ' : '◯ '}{status}
            </Chip>
            {potable && <Chip color="#3A86FF">💧 {potable}</Chip>}
            {pmr     && <Chip color="#7B61FF">♿ {pmr}</Chip>}
            {horaire && <Chip color="#F77F00">🕐 {horaire}</Chip>}
            {model   && <Chip color="#8D99AE">{model}</Chip>}
          </div>

          {/* CTA Y aller */}
          <a
            href={gmapsUrl} target="_blank" rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl"
            style={{
              height: 42,
              background: statusOk ? themeColor : 'rgba(20,32,51,0.08)',
              color: statusOk ? '#ffffff' : '#98a2b3',
              fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 13,
              textDecoration: 'none',
              boxShadow: statusOk ? `0 8px 18px ${themeColor}40` : 'none',
              pointerEvents: statusOk ? 'auto' : 'none',
            }}
            aria-disabled={!statusOk}
          >
            <span aria-hidden="true">📍</span>
            <span>{statusOk ? 'Y aller à pied' : 'Indisponible'}</span>
          </a>
        </div>
      </div>
    </div>
  )
}

function Chip({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span className="font-outfit text-[11px] font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1"
      style={{ background: color + '18', color, border: `1px solid ${color}30` }}>
      {children}
    </span>
  )
}
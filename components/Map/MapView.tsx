'use client'

/**
 * MapView v3 - GeoJSON source + Mapbox GL native layers (cluster).
 * Gère des milliers de lieux sans jank DOM.
 * Pins par catégorie (cercle navy + icône jaune), regroupés en clusters au dézoom.
 */

import { useEffect, useRef, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Place, AmeniteInfo } from '@/types'
import { getSunPosition } from '@/lib/suncalc'

const PARIS_CENTER: [number, number] = [2.3522, 48.8566]

// Couleurs DA v2
const NAVY = '#1F3A5F'
const WHITE = 'rgba(255,255,255,0.95)'
const SOLEIL = '#FFBE0B'   // jaune marque — icône de catégorie tracée sur les pins

// ── Pins par catégorie ────────────────────────────────────────────────────────
// On N'AFFICHE PLUS de note/score sur les pins : les scores étaient biaisés et
// trompeurs. Chaque pin = cercle navy + bordure blanche + l'icône de la catégorie
// (la même que dans les résultats de recherche) tracée en jaune marque.
// Tracés issus de Lucide (viewBox 24×24, stroke 2, caps/joins arrondis) :
// bar=Beer, restaurant=UtensilsCrossed, cafe=Coffee, park=Trees.
const LUCIDE_PATHS: Record<string, string[]> = {
  bar: [
    'M17 11h1a3 3 0 0 1 0 6h-1',
    'M9 12v6',
    'M13 12v6',
    'M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z',
    'M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8',
  ],
  restaurant: [
    'm16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8',
    'M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7',
    'm2.1 21.8 6.4-6.3',
    'm19 5-7 7',
  ],
  cafe: [
    'M10 2v2',
    'M14 2v2',
    'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1',
    'M6 2v2',
  ],
  park: [
    'M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z',
    'M7 16v6',
    'M13 19v3',
    'M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5',
  ],
}

function drawCategoryPin(type: string): { width: number; height: number; data: Uint8Array } {
  const W = 60, H = 60
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const CX = W / 2, CY = H / 2
  const R = 17

  // ── Cercle navy + ombre douce ───────────────────────────────────────────────
  ctx.save()
  ctx.shadowColor = 'rgba(31,58,95,0.28)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  ctx.beginPath()
  ctx.arc(CX, CY, R, 0, Math.PI * 2)
  ctx.fillStyle = NAVY
  ctx.fill()
  ctx.restore()

  // ── Bordure blanche ─────────────────────────────────────────────────────────
  ctx.save()
  ctx.beginPath()
  ctx.arc(CX, CY, R, 0, Math.PI * 2)
  ctx.strokeStyle = WHITE
  ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.restore()

  // ── Icône de catégorie (Lucide) tracée en jaune, centrée ────────────────────
  const paths = LUCIDE_PATHS[type] ?? LUCIDE_PATHS.restaurant
  ctx.save()
  const s = 0.82                       // 24 × 0.82 ≈ 19.7 px → tient dans le cercle
  ctx.translate(CX, CY)
  ctx.scale(s, s)
  ctx.translate(-12, -12)              // recadre le viewBox 24×24 sur le centre
  ctx.strokeStyle = SOLEIL
  ctx.lineWidth = 2.4                  // ≈ 2 px une fois mis à l'échelle
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of paths) ctx.stroke(new Path2D(d))
  ctx.restore()

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

  // ⚠️ setConfigProperty re-évalue TOUT le style → très coûteux. Pendant le
  // balayage horaire (≈60 appels/s) ça provoquait des micro-freezes et des
  // ombres saccadées. Le preset ne change qu'aux frontières jour/aube/crépuscule :
  // on ne l'applique donc QUE s'il a réellement changé depuis le dernier rendu.
  const presetCache = map as unknown as { _cbPreset?: string }
  const setConfig = (map as unknown as {
    setConfigProperty?: (importId: string, name: string, value: unknown) => void
  }).setConfigProperty
  if (typeof setConfig === 'function' && presetCache._cbPreset !== preset) {
    try { setConfig.call(map, 'basemap', 'lightPreset', preset); presetCache._cbPreset = preset } catch { /* noop */ }
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
  // Recentre la carte sur une adresse/rue géocodée (recherche). Le `nonce`
  // garantit qu'un nouveau choix re-déclenche le flyTo même au même endroit.
  flyToTarget?: { lng: number; lat: number; zoom: number; nonce: number } | null
  // true = affiche fontaines/sanisettes même dézoomé + highlight
  showFontaines?: boolean
  showSanisettes?: boolean
  // Callback quand l'utilisateur clique sur une fontaine / sanisette
  onAmeniteSelect?: (amenite: AmeniteInfo | null) => void
}

export default function MapView({ places, onPlaceSelect, initialCenter, initialZoom, cinematicFocus, focusPlace, sunHour, homeView, flyToTarget, showFontaines, showSanisettes, onAmeniteSelect, highlightPlaceId }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<mapboxgl.Map | null>(null)
  const placesRef     = useRef<Place[]>(places)
  const onSelectRef   = useRef(onPlaceSelect)
  placesRef.current   = places
  onSelectRef.current = onPlaceSelect

  // Sauvegarde la caméra avant le zoom focusPlace pour pouvoir revenir
  const returnCameraRef = useRef<{ center: [number, number]; zoom: number; pitch: number; bearing: number } | null>(null)
  const selectedRingRef = useRef<mapboxgl.Marker | null>(null)
  const onAmeniteRef = useRef(onAmeniteSelect)
  onAmeniteRef.current = onAmeniteSelect

  // GeoJSON mis à jour dès que places change
  const geojson = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name, type: p.type },
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

      // Enregistre une image de pin par catégorie (cercle navy + icône jaune)
      for (const cat of ['bar', 'restaurant', 'cafe', 'park', 'default']) {
        if (!map.hasImage(`pin-${cat}`)) {
          map.addImage(`pin-${cat}`, drawCategoryPin(cat) as unknown as HTMLImageElement)
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
          'circle-color': 'rgba(31,58,95,0.15)',
          'circle-translate': [2, 5],
          'circle-blur': 0.4,
        },
      })

      // Clusters — DA v2 : navy, white ring, white count
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'places',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1F3A5F',
          'circle-radius': ['step', ['get', 'point_count'], 22, 30, 27, 200, 32],
          'circle-stroke-width': 3,
          'circle-stroke-color': 'rgba(255,255,255,0.25)',
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
          'icon-image': ['match', ['get', 'type'],
            'bar', 'pin-bar',
            'restaurant', 'pin-restaurant',
            'cafe', 'pin-cafe',
            'park', 'pin-park',
            'pin-default'],
          'icon-anchor': 'center',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 14, 0.80, 16, 0.95, 18, 1.15],
        },
      })

      // ── Fontaines à boire — static asset public/geo/fontaines.geojson ───────
      map.addSource('fontaines', { type: 'geojson', data: '/geo/fontaines.geojson' })
      map.addLayer({
        id: 'fontaines-layer', type: 'circle', source: 'fontaines',
        filter: ['==', ['get', 'dispo'], 'OUI'],
        minzoom: 14,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 5, 16, 8, 18, 13],
          'circle-color': '#3A86FF',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.9,
        },
      })

      // ── Sanisettes — static asset public/geo/sanisettes.geojson ─────────────
      map.addSource('sanisettes', { type: 'geojson', data: '/geo/sanisettes.geojson' })
      map.addLayer({
        id: 'sanisettes-layer', type: 'circle', source: 'sanisettes',
        filter: ['==', ['get', 'statut'], 'En service'],
        minzoom: 14,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 5, 16, 8, 18, 13],
          'circle-color': '#52B788',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-opacity': 0.9,
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
          onAmeniteRef.current?.({ type: 'fontaine', props: f.properties ?? {}, lat, lng })
        }
      })
      map.on('click', 'sanisettes-layer', (e) => {
        e.originalEvent.stopPropagation()
        const f = e.features?.[0]
        if (f) {
          const g = f.geometry as { type: string; coordinates: [number, number] }
          const [lng, lat] = g.coordinates
          onAmeniteRef.current?.({ type: 'sanisette', props: f.properties ?? {}, lat, lng })
        }
      })

      // Labels EAU / WC au zoom 15+
      map.addLayer({
        id: 'fontaines-label', type: 'symbol', source: 'fontaines',
        filter: ['==', ['get', 'dispo'], 'OUI'],
        minzoom: 15,
        layout: {
          'text-field': '💧', 'text-size': 14,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
          'text-offset': [0, -1.8], 'text-anchor': 'bottom', 'text-allow-overlap': false,
        },
        paint: { 'text-opacity': 0.95 },
      })
      map.addLayer({
        id: 'sanisettes-label', type: 'symbol', source: 'sanisettes',
        filter: ['==', ['get', 'statut'], 'En service'],
        minzoom: 15,
        layout: {
          'text-field': '🚻', 'text-size': 14,
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
          'text-offset': [0, -1.8], 'text-anchor': 'bottom', 'text-allow-overlap': false,
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
      if (!hits.length) { onSelectRef.current(null); onAmeniteRef.current?.(null) }
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
    }
    // Quand focusPlace → null : la carte reste à sa position courante.
    // (Pas de fly-back — l'utilisateur glisse bas pour fermer, la vue ne bouge pas.)
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

  // ── Recentrage sur une rue / adresse géocodée (recherche) ──────────────
  useEffect(() => {
    if (!flyToTarget) return
    const map = mapRef.current
    if (!map) return
    returnCameraRef.current = null
    map.flyTo({
      center:   [flyToTarget.lng, flyToTarget.lat],
      zoom:     flyToTarget.zoom,
      pitch:    35,
      bearing:  0,
      duration: 1400,
      essential: true,
      padding:  { top: 0, bottom: 0, left: 0, right: 0 },
    })
  }, [flyToTarget]) // eslint-disable-line

  // ── Anneau animé autour du pin sélectionné ─────────────────────────
  useEffect(() => {
    const map = mapRef.current
    selectedRingRef.current?.remove()
    selectedRingRef.current = null
    if (!map || !highlightPlaceId) return

    const place = placesRef.current.find(p => p.id === highlightPlaceId)
    if (!place) return

    // Anneau pulsant — IMPORTANT: Mapbox écrase `element.style.transform` pour positionner
    // le marqueur. Si l'animation CSS applique aussi `transform: scale()` sur le même
    // élément, l'animation gagne dans la cascade CSS et le pin se retrouve en haut-gauche.
    // Solution : wrapper sans animation (que Mapbox peut transformer librement) +
    // anneau enfant qui porte l'animation.
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'width:58px;height:58px;pointer-events:none'
    const ring = document.createElement('div')
    ring.style.cssText = [
      'width:58px', 'height:58px', 'border-radius:50%',
      'border:3px solid rgba(255,255,255,0.92)',
      'box-shadow:0 0 0 2.5px rgba(237,193,69,0.85), 0 0 18px rgba(237,193,69,0.40)',
      'animation:pin-selected-pulse 1.7s ease-out infinite',
      'pointer-events:none',
    ].join(';')
    wrapper.appendChild(ring)

    selectedRingRef.current = new mapboxgl.Marker({ element: wrapper, anchor: 'center' })
      .setLngLat([place.lng, place.lat])
      .addTo(map)
  }, [highlightPlaceId]) // eslint-disable-line

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

  // ── Visibilité couches fontaines / sanisettes / park-highlight ──────────
  // Chaque couche n'est visible QUE si son filtre est explicitement activé.
  // ⚠️ Les couches sont ajoutées dans map.on('style.load', ...) — on ne peut
  // donc les manipuler qu'APRÈS ce handler. On détecte leur présence via
  // map.getLayer() plutôt que map.isStyleLoaded() (qui peut être vrai avant
  // que les layers custom soient enregistrés si le style reload).
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const apply = () => {
      // Fontaines — visible seulement si showFontaines actif
      if (map.getLayer('fontaines-layer')) {
        try {
          map.setLayoutProperty('fontaines-layer', 'visibility', showFontaines ? 'visible' : 'none')
          if (showFontaines) map.setLayerZoomRange('fontaines-layer', 0, 24)
        } catch { /* noop */ }
      }
      if (map.getLayer('fontaines-label')) {
        try {
          map.setLayoutProperty('fontaines-label', 'visibility', showFontaines ? 'visible' : 'none')
          if (showFontaines) map.setLayerZoomRange('fontaines-label', 0, 24)
        } catch { /* noop */ }
      }
      // Sanisettes
      if (map.getLayer('sanisettes-layer')) {
        try {
          map.setLayoutProperty('sanisettes-layer', 'visibility', showSanisettes ? 'visible' : 'none')
          if (showSanisettes) map.setLayerZoomRange('sanisettes-layer', 0, 24)
        } catch { /* noop */ }
      }
      if (map.getLayer('sanisettes-label')) {
        try {
          map.setLayoutProperty('sanisettes-label', 'visibility', showSanisettes ? 'visible' : 'none')
          if (showSanisettes) map.setLayerZoomRange('sanisettes-label', 0, 24)
        } catch { /* noop */ }
      }
    }

    // Si les couches existent déjà (style chargé + layers ajoutés) → applique immédiatement.
    // Sinon attend style.load qui déclenchera d'abord l'ajout des layers (handler on() enregistré
    // en premier dans l'init effect), puis notre apply() via once().
    if (map.getLayer('fontaines-layer')) {
      apply()
    } else {
      map.once('style.load', apply)
      // Cleanup : évite les listeners stale si l'effet re-run avant le chargement
      return () => { map.off('style.load', apply) }
    }
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

    </div>
  )
}
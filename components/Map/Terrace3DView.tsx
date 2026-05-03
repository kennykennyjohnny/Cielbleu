'use client'

/**
 * Terrace3DView v4 — vue Mapbox 3D face à la façade du bar.
 *
 * Fixes v4 :
 *  - CAMERA SUR LA RUE : offset négatif (-14m) positionne la caméra côté rue,
 *    pas dans le bâtiment
 *  - BEARING = React state → SunOverlay se re-render quand bearing est calculé
 *  - INTERACTIF PAN : dragPan activé, zoom/rotation bloqués → légèrement déplaçable
 *  - queryRenderedFeatures sur bbox autour du bar (pas tout le viewport)
 *  - Éclairage très directionnel : intensité 1.0, ombres dramatiques
 *  - Soleil : disque 80px + halo 200px + rayons CSS rotatifs (cb-sun-spin)
 */

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { getSunPosition } from '@/lib/suncalc'

interface Props {
  lat: number
  lng: number
  score: number
  date?: Date
}

// Distance de recul côté rue (positif = la caméra recule dans la direction OPPOSÉE au bâtiment)
const STREET_OFFSET_M = 20

interface NearestBuilding {
  bearing: number
  distM: number
  feature: mapboxgl.MapboxGeoJSONFeature
}

export default function Terrace3DView({ lat, lng, score, date }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const dateRef      = useRef<Date>(date ?? new Date())
  const scoreRef     = useRef<number>(score)
  // State (pas ref) → SunOverlay se re-render quand le bearing est calculé
  const [bearing, setBearing] = useState<number>(180)

  dateRef.current = date ?? new Date()
  scoreRef.current = score

  // ── Création de la carte ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [lng, lat],
      zoom: 19.0,
      pitch: 65,        // 65° = façade bien visible + terrasse au premier plan
      bearing: 180,
      // Pan activé, tout le reste désactivé = légèrement déplaçable
      scrollZoom: false,
      boxZoom: false,
      doubleClickZoom: false,
      dragRotate: false,
      keyboard: false,
      touchZoomRotate: false,
      touchPitch: false,
      attributionControl: false,
      fadeDuration: 0,
    })

    map.on('style.load', () => {
      styleMap(map)
      applySunLighting(map, lat, lng, dateRef.current, scoreRef.current)

      map.once('idle', () => {
        tryBearing(1)
      })

      function tryBearing(attempt: number) {
        const result = findNearestBuilding(map, lat, lng)
        if (result) {
          // Caméra sur la rue : recule dans la direction OPPOSÉE au bâtiment
          const [streetLng, streetLat] = offsetCenter(lat, lng, result.bearing, -STREET_OFFSET_M)
          map.jumpTo({ center: [streetLng, streetLat], bearing: result.bearing })
          setBearing(result.bearing)   // → SunOverlay re-render
          highlightBuilding(map, result.feature, scoreRef.current)
          addTerraceZone(map, lat, lng, result.bearing)
          // Dolly-in doux
          map.easeTo({ zoom: map.getZoom() + 0.15, duration: 1400, easing: (t) => t * (2 - t) })
        } else if (attempt < 4) {
          setTimeout(() => tryBearing(attempt + 1), 500 * attempt)
        } else {
          // Fallback : animation sans correction (bearing reste 180°)
          map.easeTo({ zoom: map.getZoom() + 0.1, duration: 1200, easing: (t) => t * (2 - t) })
        }
      }
    })

    // Pin visible — grand marqueur avec emoji
    const pinEl = createPinEl(score)
    new mapboxgl.Marker({ element: pinEl, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(map)

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [lat, lng]) // eslint-disable-line

  // ── Mise à jour éclairage quand le slider change ──────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => applySunLighting(map, lat, lng, dateRef.current, scoreRef.current)
    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
  }, [date, score, lat, lng])

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      <SunOverlay lat={lat} lng={lng} score={score} date={date} bearing={bearing} />
    </div>
  )
}

// ── Pin marqueur ──────────────────────────────────────────────────────────

const SCORE_EMOJI_PIN = ['🌙', '🌥', '⛅', '🌤', '☀️', '🌞']

function createPinEl(score: number): HTMLElement {
  const emoji = SCORE_EMOJI_PIN[Math.max(0, Math.min(5, score))]
  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 6px 16px rgba(0,0,0,0.55));'
  el.innerHTML = `
    <div style="
      width:46px;height:46px;border-radius:50%;
      background:radial-gradient(circle at 36% 30%,#FFF5A0 0%,#FFBE0B 55%,#FF7A00 100%);
      border:3.5px solid rgba(255,253,247,0.95);
      box-shadow:0 0 0 5px rgba(255,190,11,0.38),0 0 28px rgba(255,180,0,0.80),0 8px 20px rgba(27,40,56,0.55);
      display:flex;align-items:center;justify-content:center;
      font-size:22px;line-height:1;
      animation:pin-halo 2.4s ease-in-out infinite;
    ">${emoji}</div>
    <div style="width:3px;height:14px;background:linear-gradient(to bottom,#FFBE0B,rgba(255,190,11,0));margin-top:-2px;"></div>
  `
  return el
}

// ── Style carte ───────────────────────────────────────────────────────────

function styleMap(map: mapboxgl.Map) {
  const set = (id: string, prop: string, val: unknown) => {
    if (map.getLayer(id)) try { map.setPaintProperty(id, prop as never, val as never) } catch { /* noop */ }
  }

  set('background', 'background-color', '#A8CCEA')
  set('water',      'fill-color',       '#5FA8CF')
  set('waterway',   'line-color',       '#5FA8CF')
  for (const r of ['road-primary', 'road-secondary-tertiary', 'road-street', 'road-minor', 'road-motorway']) {
    set(r, 'line-color', '#D8D1C4')
  }
  set('road-path',        'line-color', '#E8E2D8')
  set('road-pedestrian',  'line-color', '#E8E2D8')
  for (const g of ['landuse', 'park', 'national-park', 'pitch', 'grass']) {
    set(g, 'fill-color', '#A4C98A')
  }

  // Cache labels & POI
  for (const l of map.getStyle().layers ?? []) {
    if (l.type === 'symbol' || l.id.includes('poi') || l.id.includes('label') || l.id.includes('transit')) {
      try { map.setLayoutProperty(l.id, 'visibility', 'none') } catch { /* noop */ }
    }
  }

  // Bâtiments 3D — pierre de taille Haussmann
  if (!map.getLayer('cb-3d-buildings')) {
    const labelLayer = map.getStyle().layers?.find(
      (l) => l.type === 'symbol' && (l.layout as Record<string, unknown>)?.['text-field']
    )?.id

    map.addLayer({
      id: 'cb-3d-buildings',
      source: 'composite',
      'source-layer': 'building',
      filter: ['==', ['get', 'extrude'], 'true'],
      type: 'fill-extrusion',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['get', 'height'],
          0,  '#C8BD9E',
          10, '#BDB090',
          22, '#B0A480',
          40, '#9E9070',
          70, '#877A5E',
        ],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base':   ['get', 'min_height'],
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-ambient-occlusion-intensity': 0.85,
        'fill-extrusion-ambient-occlusion-radius': 2.5,
      },
    }, labelLayer)
  }

  set('building',         'fill-color',    '#E8DFC8')
  set('building',         'fill-opacity',  0.6)
  set('building-outline', 'line-color',    '#CCC3AD')

  try {
    map.setFog({
      color: '#C0D8EC', 'high-color': '#7AAECC',
      'horizon-blend': 0.04, 'space-color': '#162030', range: [0.8, 12],
    } as Parameters<typeof map.setFog>[0])
  } catch { /* old SDK */ }
}

// ── Highlight bâtiment cible ──────────────────────────────────────────────

function highlightBuilding(map: mapboxgl.Map, feature: mapboxgl.MapboxGeoJSONFeature, score: number) {
  if (!feature.geometry) return
  // Couleurs très lumineuses pour que le bâtiment cible ressorte clairement
  const hlColor  = score >= 5 ? '#FFF040' : score >= 4 ? '#FFE030' : score >= 3 ? '#F5D060' : '#E2CA88'
  const hlOpacity = 0.84
  const outlineColor = score >= 4 ? '#FFB800' : '#C8A030'
  const height   = (feature.properties?.height    as number | null) ?? 18
  const minH     = (feature.properties?.min_height as number | null) ?? 0

  const geoData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: feature.geometry as GeoJSON.Geometry, properties: {} }],
  }

  const existingSrc = map.getSource('cb-bar-bld') as mapboxgl.GeoJSONSource | undefined
  if (existingSrc) {
    existingSrc.setData(geoData)
    if (map.getLayer('cb-bar-bld-hl')) {
      map.setPaintProperty('cb-bar-bld-hl', 'fill-extrusion-color', hlColor)
      map.setPaintProperty('cb-bar-bld-hl', 'fill-extrusion-opacity', hlOpacity)
    }
    if (map.getLayer('cb-bar-outline')) {
      map.setPaintProperty('cb-bar-outline', 'line-color', outlineColor)
    }
    return
  }

  map.addSource('cb-bar-bld', { type: 'geojson', data: geoData })

  // Extrusion colorée — vertical-gradient false pour garder la couleur uniforme sur toute la hauteur
  map.addLayer({
    id:     'cb-bar-bld-hl',
    source: 'cb-bar-bld',
    type:   'fill-extrusion',
    paint: {
      'fill-extrusion-color':              hlColor,
      'fill-extrusion-height':             height,
      'fill-extrusion-base':               minH,
      'fill-extrusion-opacity':            hlOpacity,
      'fill-extrusion-vertical-gradient':  false,
    },
  })

  // Contour lumineux au sol (délimite clairement le bâtiment)
  map.addLayer({
    id: 'cb-bar-outline', source: 'cb-bar-bld', type: 'line',
    paint: {
      'line-color':   outlineColor,
      'line-width':   3,
      'line-blur':    2,
      'line-opacity': 0.95,
    },
  })
}

// ── Zone terrasse au sol ──────────────────────────────────────────────────
// Rectangle doré devant le bar, côté rue (dans la direction –cameraBearing)

function addTerraceZone(map: mapboxgl.Map, lat: number, lng: number, cameraBearing: number) {
  const W = 8, D = 3.5   // 8m de large, 3.5m de profondeur côté rue
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const rad    = (cameraBearing * Math.PI) / 180
  // fwd = direction vers le bâtiment ; right = droite caméra
  const fwdE  = Math.sin(rad),  fwdN  = Math.cos(rad)
  const rightE = Math.cos(rad), rightN = -Math.sin(rad)

  const toLL = (dE: number, dN: number): [number, number] => [
    lng + dE / (111320 * cosLat),
    lat + dN / 111320,
  ]

  // Coins : de la façade vers la rue (direction -fwd)
  const corners: [number, number][] = [
    toLL( rightE * W / 2,                   rightN * W / 2),
    toLL(-rightE * W / 2,                  -rightN * W / 2),
    toLL(-fwdE * D - rightE * W / 2,  -fwdN * D - rightN * W / 2),
    toLL(-fwdE * D + rightE * W / 2,  -fwdN * D + rightN * W / 2),
    toLL( rightE * W / 2,                   rightN * W / 2),   // fermeture
  ]

  const geoData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [corners] }, properties: {} }],
  }

  if (map.getSource('cb-terrace')) {
    ;(map.getSource('cb-terrace') as mapboxgl.GeoJSONSource).setData(geoData)
    return
  }
  map.addSource('cb-terrace', { type: 'geojson', data: geoData })
  map.addLayer({
    id: 'cb-terrace-fill', source: 'cb-terrace', type: 'fill',
    paint: { 'fill-color': '#E8B84B', 'fill-opacity': 0.55 },
  })
  map.addLayer({
    id: 'cb-terrace-outline', source: 'cb-terrace', type: 'line',
    paint: { 'line-color': '#BB8518', 'line-width': 1.5, 'line-dasharray': [3, 2] },
  })
}

// ── Trouver le bâtiment le plus proche (par normale de façade) ────────────
// Cherche l'arête la plus proche dont la normale pointe vers le bar

function findNearestBuilding(map: mapboxgl.Map, lat: number, lng: number): NearestBuilding | null {
  let features: mapboxgl.MapboxGeoJSONFeature[] = []
  try {
    const pinPx = map.project([lng, lat])
    const pad = 220
    const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
      [pinPx.x - pad, pinPx.y - pad],
      [pinPx.x + pad, pinPx.y + pad],
    ]
    features = map.queryRenderedFeatures(bbox, { layers: ['cb-3d-buildings'] })
  } catch { return null }
  if (!features?.length) return null

  const cosLat = Math.cos((lat * Math.PI) / 180)
  let best: NearestBuilding | null = null

  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    let rings: number[][][] = []
    if      (g.type === 'Polygon')      rings = [g.coordinates[0] as number[][]]
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) if (poly[0]) rings.push(poly[0])
    }

    for (const ring of rings) {
      if (ring.length < 4) continue

      // Parcours chaque arête → cherche celle dont la normale pointe vers le bar
      let bestEdgeDist = Infinity
      let bestBearing  = 0

      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i]
        const [bx, by] = ring[i + 1]

        // Milieu de l'arête → vector vers le bar (en mètres, axes E/N)
        const mx = ((ax + bx) / 2 - lng) * 111320 * cosLat
        const my = ((ay + by) / 2 - lat) * 111320
        const edgeDist = Math.sqrt(mx * mx + my * my)
        if (edgeDist < 1 || edgeDist > 55) continue

        // Direction de l'arête
        const ex = (bx - ax) * 111320 * cosLat
        const ey = (by - ay) * 111320
        const elen = Math.sqrt(ex * ex + ey * ey)
        if (elen < 0.5) continue

        // Normale candidate (perpendiculaire) ; choisit celle qui pointe vers le bar
        const n1x =  ey / elen, n1y = -ex / elen
        const dot  = n1x * (-mx) + n1y * (-my)   // (-mx,-my) = vecteur arête→bar
        const nx   = dot > 0 ? n1x : -n1x
        const ny   = dot > 0 ? n1y : -n1y

        // Bearing caméra = direction FROM caméra TOWARD bâtiment = opposé de la normale
        const cBearing = ((Math.atan2(-nx, -ny) * 180 / Math.PI) + 360) % 360

        if (edgeDist < bestEdgeDist) {
          bestEdgeDist = edgeDist
          bestBearing  = cBearing
        }
      }

      if (bestEdgeDist < Infinity && bestEdgeDist < (best?.distM ?? Infinity)) {
        best = { bearing: bestBearing, distM: bestEdgeDist, feature: f }
      }
    }
  }
  return best
}

// ── Décalage du centre ────────────────────────────────────────────────────

function offsetCenter(lat: number, lng: number, bearingDeg: number, distM: number): [number, number] {
  const rad    = (bearingDeg * Math.PI) / 180
  const cosLat = Math.cos((lat * Math.PI) / 180)
  return [
    lng + (Math.sin(rad) * distM) / (111320 * cosLat),
    lat + (Math.cos(rad) * distM) / 111320,
  ]
}

// ── Éclairage solaire ─────────────────────────────────────────────────────

function applySunLighting(map: mapboxgl.Map, lat: number, lng: number, date: Date, score: number) {
  const sun    = getSunPosition(date, lat, lng)
  const azNorth = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const altDeg  = (sun.altitude * 180) / Math.PI
  const isDay   = altDeg > -3

  const set = (id: string, prop: string, val: unknown) => {
    if (map.getLayer(id)) try { map.setPaintProperty(id, prop as never, val as never) } catch { /* noop */ }
  }

  if (isDay) {
    const t = Math.max(0, Math.min(1, altDeg / 55))
    // Intensité élevée pour ombres bien visibles
    // Intensité TOUJOURS élevée → ombres prononcées en toutes circonstances
    const intensity = 1.0
    // Couleur : dorée au lever/coucher, blanche-chaude en journée
    const color = altDeg < 6 ? '#F2C080' : score >= 4 ? '#FFFBD0' : '#FFF6E8'
    // Polaire très horizontal (58–82°) = ombres latérales longues et dramatiques
    const polar = Math.min(82, Math.max(58, 90 - altDeg * 0.30))

    map.setLight({
      anchor: 'map',
      position: [1.5, azNorth, polar],
      color,
      intensity,
    })
    set('background', 'background-color', altDeg > 6 ? '#A8CCEA' : '#D4A878')
  } else {
    map.setLight({ anchor: 'map', position: [1.5, 0, 90], color: '#7090B0', intensity: 0.06 })
    set('background', 'background-color', '#0D1820')
  }
}

// ── Overlay Soleil / Lune ─────────────────────────────────────────────────

function SunOverlay({
  lat, lng, score, date, bearing,
}: {
  lat: number; lng: number; score: number; date?: Date; bearing: number
}) {
  const d      = date ?? new Date()
  const sun    = getSunPosition(d, lat, lng)
  const altDeg = (sun.altitude  * 180) / Math.PI
  const azDeg  = ((sun.azimuth  * 180) / Math.PI + 180) % 360
  const isDay  = altDeg > -3
  const isSunny = score >= 4

  // Angle relatif soleil / caméra → position X dans le cadre
  const rel   = (((azDeg - bearing + 540) % 360) - 180)
  const inFov = Math.abs(rel) < 115
  const sunX  = 50 + (rel / 115) * 42             // 8%–92% de la largeur
  // Y recalibré pour pitch 65°  (horizon ~42% du haut)
  const sunY  = Math.max(5, 42 - altDeg * 0.58)
  // La façade face à la caméra est éclairée si le soleil est derrière la caméra (<90°)
  const isFrontLit = isDay && Math.abs(rel) < 92

  const cardDir = azDeg < 45 ? 'N' : azDeg < 135 ? 'E' : azDeg < 225 ? 'S' : azDeg < 315 ? 'O' : 'N'

  if (!isDay) {
    return (
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-4 right-4 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg"
          style={{ background: 'rgba(13,24,32,0.85)', backdropFilter: 'blur(8px)' }}>
          <span className="text-base">🌙</span>
          <span className="text-[11px] font-outfit font-bold text-[#B0C8E0]">Nuit</span>
        </div>
      </div>
    )
  }

  const sunSize  = isSunny ? 80 : 54
  const haloSize = isSunny ? 200 : 120
  const raysSize = haloSize + 30

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {inFov && (
        <div style={{
          position: 'absolute',
          left: `${sunX}%`, top: `${sunY}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          transition: 'left 700ms cubic-bezier(0.34,1.1,0.64,1), top 700ms cubic-bezier(0.34,1.1,0.64,1)',
        }}>
          {/* Rayons rotatifs (8 faisceaux) */}
          {isSunny && (
            <div style={{
              position: 'absolute',
              width:  raysSize, height: raysSize,
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: `conic-gradient(
                transparent 0deg,   rgba(255,210,0,0.22) 7deg,  transparent 14deg,
                transparent 37deg,  rgba(255,210,0,0.22) 44deg, transparent 51deg,
                transparent 82deg,  rgba(255,210,0,0.22) 89deg, transparent 96deg,
                transparent 127deg, rgba(255,210,0,0.22) 134deg,transparent 141deg,
                transparent 172deg, rgba(255,210,0,0.22) 179deg,transparent 186deg,
                transparent 217deg, rgba(255,210,0,0.22) 224deg,transparent 231deg,
                transparent 262deg, rgba(255,210,0,0.22) 269deg,transparent 276deg,
                transparent 307deg, rgba(255,210,0,0.22) 314deg,transparent 321deg,
                transparent 352deg, rgba(255,210,0,0.22) 359deg,transparent 360deg
              )`,
              animation: 'cb-sun-spin 20s linear infinite',
            }} />
          )}

          {/* Halo corona */}
          <div style={{
            position: 'absolute',
            width: haloSize, height: haloSize,
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: isSunny
              ? 'radial-gradient(circle, rgba(255,220,0,0.70) 0%, rgba(255,160,0,0.30) 38%, rgba(255,80,0,0.08) 65%, transparent 100%)'
              : 'radial-gradient(circle, rgba(255,230,100,0.48) 0%, rgba(255,200,80,0.16) 50%, transparent 100%)',
            filter: 'blur(2px)',
            animation: isSunny ? 'cb-sun-glow 3s ease-in-out infinite' : 'none',
          }} />

          {/* Disque soleil */}
          <div style={{
            position: 'relative',
            width: sunSize, height: sunSize,
            borderRadius: '50%',
            background: isSunny
              ? 'radial-gradient(circle at 32% 28%, #FFFFF5 0%, #FFF080 16%, #FFCC00 52%, #FF8800 100%)'
              : 'radial-gradient(circle at 32% 28%, #FFFEF5 0%, #FFF878 22%, #FFE860 58%, #FFCC30 100%)',
            boxShadow: isSunny
              ? '0 0 20px 2px #FFE000, 0 0 55px 8px rgba(255,160,0,0.92), 0 0 100px 20px rgba(255,80,0,0.55)'
              : '0 0 14px 1px #FFE090, 0 0 32px 4px rgba(255,200,80,0.68)',
            transition: 'width 400ms, height 400ms, box-shadow 400ms',
          }} />
        </div>
      )}

      {/* Badge direction + altitude */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
        <div className="rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg"
          style={{ background: 'rgba(255,253,247,0.92)', backdropFilter: 'blur(10px)' }}>
          <span className="text-[14px]">{inFov ? '☀' : '☁'}</span>
          <span className="text-[11px] font-outfit font-bold text-nuit">
            {Math.round(altDeg)}° {cardDir}
          </span>
        </div>
        {/* Badge état façade */}
        <div className="rounded-full px-2.5 py-1 shadow-lg" style={{
          background: isFrontLit ? '#FFE030' : 'rgba(27,40,56,0.72)',
        }}>
          <span className="text-[10px] font-outfit font-black tracking-wide" style={{
            color: isFrontLit ? '#1B2838' : '#A8C0D8',
          }}>
            {isFrontLit ? '☀ FAÇADE ÉCLAIRÉE' : '🌔 FAÇADE À L’OMBRE'}
          </span>
        </div>
        {isSunny && isFrontLit && (
          <div className="rounded-full px-2.5 py-1 shadow-lg" style={{ background: '#FFBE0B' }}>
            <span className="text-[10px] font-outfit font-black text-nuit tracking-wide">SUNNY</span>
          </div>
        )}
      </div>
    </div>
  )
}
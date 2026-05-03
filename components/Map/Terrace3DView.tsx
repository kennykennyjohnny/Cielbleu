'use client'

/**
 * Terrace3DView — vue 3D Mapbox face à la façade du bar.
 *
 * Améliorations v3 :
 *  - pitch 62° (vs 74) pour voir le sol/terrasse ET le bâtiment
 *  - FACADE_OFFSET réduit à 8m (évite de décaler le centre dans le bâtiment)
 *  - highlight amber sur le bâtiment cible (GeoJSON fill-extrusion)
 *  - pin 44px avec emoji score — visible devant les bâtiments
 *  - éclairage solaire intense (0.82 max) pour ombres dramatiques
 *  - soleil overlay 80px + halo 180px + rayons CSS rotatifs
 *  - positionnement soleil recalibré pour pitch 62°
 */

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { getSunPosition } from '@/lib/suncalc'

interface Props {
  lat: number
  lng: number
  score: number
  date?: Date
}

const MIN_DIST_M = 1     // catch les bars à l'intérieur d'un bâtiment
const MAX_DIST_M = 45    // max distance bâtiment voisin (rues haussmanniennes ~20m)
const FACADE_OFFSET_M = 8  // décale centre vers le bâtiment (8m = ok pour toutes tailles)

interface NearestBuilding {
  bearing: number
  distM: number
  feature: mapboxgl.MapboxGeoJSONFeature
}

export default function Terrace3DView({ lat, lng, score, date }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const bearingRef = useRef<number>(180)
  const dateRef = useRef<Date>(date ?? new Date())
  const scoreRef = useRef<number>(score)
  dateRef.current = date ?? new Date()
  scoreRef.current = score

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [lng, lat],
      zoom: 18.8,
      pitch: 62,    // ← clé: on voit le sol (terrasse) ET la façade
      bearing: 180,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    })

    map.on('style.load', () => {
      styleMap(map)
      applySunLighting(map, lat, lng, dateRef.current, scoreRef.current)

      function tryBearing(attempt: number) {
        const result = findNearestBuilding(map, lat, lng)
        if (result) {
          bearingRef.current = result.bearing
          // Décale le centre légèrement vers le bâtiment pour mieux cadrer la façade
          const [offLng, offLat] = offsetCenter(lat, lng, result.bearing, FACADE_OFFSET_M)
          map.jumpTo({ center: [offLng, offLat], bearing: result.bearing })
          // Highlight du bâtiment cible
          highlightBuilding(map, result.feature, scoreRef.current)
          // Dolly-in doux
          map.easeTo({ zoom: map.getZoom() + 0.12, duration: 1400, easing: (t) => t * (2 - t) })
        } else if (attempt < 4) {
          setTimeout(() => tryBearing(attempt + 1), 450 * attempt)
        } else {
          map.easeTo({ zoom: map.getZoom() + 0.12, duration: 1400, easing: (t) => t * (2 - t) })
        }
      }

      map.once('idle', () => tryBearing(1))
    })

    // Pin visible — grand marqueur avec emoji score
    const pinEl = createPinElement(score)
    new mapboxgl.Marker({ element: pinEl, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(map)

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [lat, lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mise à jour éclairage quand le slider change
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
      <SunOverlay lat={lat} lng={lng} score={score} date={date} bearingRef={bearingRef} />
    </div>
  )
}

// ─── Pin marqueur ─────────────────────────────────────────────────────────────

const SCORE_EMOJI_PIN = ['🌙', '🌥', '⛅', '🌤', '☀️', '🌞']

function createPinElement(score: number): HTMLElement {
  const emoji = SCORE_EMOJI_PIN[Math.max(0, Math.min(5, score))]
  const el = document.createElement('div')
  el.style.cssText = `
    display: flex; flex-direction: column; align-items: center;
    filter: drop-shadow(0 6px 16px rgba(0,0,0,0.55));
    cursor: default;
  `
  el.innerHTML = `
    <div style="
      width: 46px; height: 46px; border-radius: 50%;
      background: radial-gradient(circle at 36% 30%, #FFF5A0 0%, #FFBE0B 55%, #FF7A00 100%);
      border: 3.5px solid rgba(255,253,247,0.95);
      box-shadow: 0 0 0 5px rgba(255,190,11,0.38), 0 0 28px rgba(255,180,0,0.80), 0 8px 20px rgba(27,40,56,0.55);
      display: flex; align-items: center; justify-content: center;
      font-size: 22px; line-height: 1;
      animation: pin-halo 2.4s ease-in-out infinite;
    ">${emoji}</div>
    <div style="
      width: 3px; height: 14px;
      background: linear-gradient(to bottom, #FFBE0B 0%, rgba(255,190,11,0) 100%);
      margin-top: -2px;
    "></div>
  `
  return el
}

// ─── Style carte ─────────────────────────────────────────────────────────────

function styleMap(map: mapboxgl.Map) {
  const set = (id: string, prop: string, val: string | number | unknown[]) => {
    if (map.getLayer(id)) {
      try { map.setPaintProperty(id, prop as Parameters<typeof map.setPaintProperty>[1], val as never) } catch { /* noop */ }
    }
  }

  // Ciel & eau
  set('background', 'background-color', '#A8CCEA')
  set('water', 'fill-color', '#5FA8CF')
  set('waterway', 'line-color', '#5FA8CF')

  // Routes — macadam gris chaud, largeur visible
  for (const r of ['road-primary', 'road-secondary-tertiary', 'road-street', 'road-minor', 'road-motorway']) {
    set(r, 'line-color', '#D8D1C4')
  }
  // Trottoirs / voies piétonnes plus claires
  set('road-path', 'line-color', '#E8E2D8')
  set('road-pedestrian', 'line-color', '#E8E2D8')

  // Espaces verts
  for (const g of ['landuse', 'park', 'national-park', 'pitch', 'grass']) {
    set(g, 'fill-color', '#A4C98A')
  }

  // Cache labels et POI (pour clarté de la vue 3D)
  const layers = map.getStyle().layers ?? []
  for (const l of layers) {
    if (l.type === 'symbol' || l.id.includes('poi') || l.id.includes('label') || l.id.includes('transit')) {
      try { map.setLayoutProperty(l.id, 'visibility', 'none') } catch { /* noop */ }
    }
  }

  // Bâtiments 3D — palette Haussmann pierre de taille chaude
  if (!map.getLayer('cb-3d-buildings')) {
    const labelLayerId = layers.find(
      (l) => l.type === 'symbol' && (l.layout as Record<string, unknown>)?.['text-field']
    )?.id

    map.addLayer(
      {
        id: 'cb-3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', ['get', 'extrude'], 'true'],
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'height'],
            0,  '#EAE0CE',   // rez-de-chaussée : pierre claire
            10, '#DFD4BF',   // étages bas
            22, '#D0C4A9',   // étages moyen
            40, '#BEB099',   // étages haut
            70, '#A89A84',   // combles / ardoise
          ],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 0.95,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      labelLayerId
    )
  }

  // Sol visible entre bâtiments
  set('building', 'fill-color', '#E4DBC8')
  set('building', 'fill-opacity', 0.6)
  set('building-outline', 'line-color', '#CBC1AD')

  // Fog / atmosphère pour profondeur — plus lumineux en journée
  try {
    map.setFog({
      color: '#C0D8EC',
      'high-color': '#7AAECC',
      'horizon-blend': 0.04,
      'space-color': '#162030',
      range: [0.8, 12],
    } as Parameters<typeof map.setFog>[0])
  } catch { /* old SDK */ }
}

// ─── Bâtiment highlight ────────────────────────────────────────────────────

function highlightBuilding(
  map: mapboxgl.Map,
  feature: mapboxgl.MapboxGeoJSONFeature,
  score: number
) {
  if (!feature.geometry) return

  // Couleur selon l'ensoleillement
  const hlColor = score >= 4 ? '#FFD060' : score >= 3 ? '#F0C878' : '#DDD0A8'
  const hlOpacity = score >= 4 ? 0.55 : 0.42

  const height = (feature.properties?.height as number | null) ?? 18
  const minHeight = (feature.properties?.min_height as number | null) ?? 0

  const data = {
    type: 'FeatureCollection' as const,
    features: [{
      type: 'Feature' as const,
      geometry: feature.geometry as GeoJSON.Geometry,
      properties: {},
    }],
  }

  const existingSrc = map.getSource('cb-bar-bld') as mapboxgl.GeoJSONSource | undefined
  if (existingSrc) {
    existingSrc.setData(data)
    // Mise à jour couleur
    if (map.getLayer('cb-bar-bld-hl')) {
      map.setPaintProperty('cb-bar-bld-hl', 'fill-extrusion-color', hlColor)
      map.setPaintProperty('cb-bar-bld-hl', 'fill-extrusion-opacity', hlOpacity)
    }
    return
  }

  map.addSource('cb-bar-bld', { type: 'geojson', data })
  map.addLayer({
    id: 'cb-bar-bld-hl',
    source: 'cb-bar-bld',
    type: 'fill-extrusion',
    paint: {
      'fill-extrusion-color': hlColor,
      'fill-extrusion-height': height,
      'fill-extrusion-base': minHeight,
      'fill-extrusion-opacity': hlOpacity,
      'fill-extrusion-vertical-gradient': true,
    },
  })
}

// ─── Trouver le bâtiment le plus proche ───────────────────────────────────

function findNearestBuilding(
  map: mapboxgl.Map,
  lat: number,
  lng: number
): NearestBuilding | null {
  let features: mapboxgl.MapboxGeoJSONFeature[] = []
  try {
    features = map.queryRenderedFeatures({ layers: ['cb-3d-buildings'] })
  } catch { return null }
  if (!features?.length) return null

  const cosLat = Math.cos((lat * Math.PI) / 180)
  let best: NearestBuilding | null = null

  for (const f of features) {
    const g = f.geometry
    if (!g) continue

    let rings: number[][][] = []
    if (g.type === 'Polygon') rings = [g.coordinates[0] as number[][]]
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) {
        if (poly[0]) rings.push(poly[0] as number[][])
      }
    }

    for (const ring of rings) {
      if (!ring.length) continue
      // Centroïde de l'anneau extérieur
      let cx = 0, cy = 0
      for (const [x, y] of ring) { cx += x; cy += y }
      cx /= ring.length; cy /= ring.length

      const dxM = (cx - lng) * 111320 * cosLat
      const dyM = (cy - lat) * 111320
      const dist = Math.sqrt(dxM * dxM + dyM * dyM)
      if (dist < MIN_DIST_M || dist > MAX_DIST_M) continue

      if (!best || dist < best.distM) {
        best = {
          distM: dist,
          bearing: ((Math.atan2(dxM, dyM) * 180) / Math.PI + 360) % 360,
          feature: f,
        }
      }
    }
  }

  return best
}

// ─── Décalage centre ──────────────────────────────────────────────────────

function offsetCenter(lat: number, lng: number, bearingDeg: number, distM: number): [number, number] {
  const rad = (bearingDeg * Math.PI) / 180
  const cosLat = Math.cos((lat * Math.PI) / 180)
  return [
    lng + (Math.sin(rad) * distM) / (111320 * cosLat),
    lat + (Math.cos(rad) * distM) / 111320,
  ]
}

// ─── Éclairage solaire ────────────────────────────────────────────────────

function applySunLighting(map: mapboxgl.Map, lat: number, lng: number, date: Date, score: number) {
  const sun = getSunPosition(date, lat, lng)
  const azNorth = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const altDeg = (sun.altitude * 180) / Math.PI
  const isDay = altDeg > -3

  const set = (id: string, prop: string, val: string | number | unknown[]) => {
    if (map.getLayer(id)) {
      try { map.setPaintProperty(id, prop as Parameters<typeof map.setPaintProperty>[1], val as never) } catch { /* noop */ }
    }
  }

  if (isDay) {
    const t = Math.max(0, Math.min(1, altDeg / 55))
    // Intensité plus haute pour ombres visibles (was max 0.72, now 0.82)
    const intensity = 0.30 + t * 0.52

    // Couleur lumière : dorée au coucher/lever, blanc-chaud en journée
    const color = altDeg < 6 ? '#F2C890' : score >= 4 ? '#FFFBD0' : '#FFF8EC'

    map.setLight({
      anchor: 'map',
      // polar angle : plus bas (horizon) quand soleil est bas → ombres longues
      position: [1.5, azNorth, Math.max(8, 86 - altDeg * 0.9)],
      color,
      intensity,
    })

    set('background', 'background-color', altDeg > 6 ? '#A8CCEA' : '#D4A878')
  } else {
    // Nuit
    map.setLight({ anchor: 'map', position: [1.5, 0, 90], color: '#7090B0', intensity: 0.07 })
    set('background', 'background-color', '#0D1820')
  }
}

// ─── Overlay soleil / lune ────────────────────────────────────────────────

function SunOverlay({
  lat, lng, score, date, bearingRef,
}: {
  lat: number
  lng: number
  score: number
  date?: Date
  bearingRef: React.RefObject<number>
}) {
  const d = date ?? new Date()
  const sun = getSunPosition(d, lat, lng)
  const altDeg = (sun.altitude * 180) / Math.PI
  const azDeg = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const isDay = altDeg > -3
  const isSunny = score >= 4

  // Angle soleil vs caméra
  const cameraBearing = bearingRef.current ?? 180
  const rel = (((azDeg - cameraBearing + 540) % 360) - 180)
  const inFov = Math.abs(rel) < 115

  // position X : centré = rel 0, bord à rel ±115
  const sunX = 50 + (rel / 115) * 42
  // position Y : recalibrée pour pitch 62°
  // altDeg 60 → 8%, 30 → 24%, 10 → 37%, 5 → 42% (horizon ~48%)
  const sunY = Math.max(6, 46 - altDeg * 0.65)

  const cardDir = azDeg < 45 ? 'N' : azDeg < 135 ? 'E' : azDeg < 225 ? 'S' : azDeg < 315 ? 'O' : 'N'

  if (!isDay) {
    return (
      <div className="absolute inset-0 pointer-events-none">
        {/* Ciel nuit */}
        <div className="absolute top-4 right-4 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg"
          style={{ background: 'rgba(13,24,32,0.85)', backdropFilter: 'blur(8px)' }}>
          <span className="text-base">🌙</span>
          <span className="text-[11px] font-outfit font-bold text-[#B0C8E0]">Nuit</span>
        </div>
      </div>
    )
  }

  const sunSize = isSunny ? 76 : 52
  const haloSize = isSunny ? 180 : 110

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Soleil */}
      {inFov && (
        <div
          style={{
            position: 'absolute',
            left: `${sunX}%`,
            top: `${sunY}%`,
            transform: 'translate(-50%, -50%)',
            zIndex: 10,
            transition: 'left 600ms cubic-bezier(0.34,1.1,0.64,1), top 600ms cubic-bezier(0.34,1.1,0.64,1)',
          }}
        >
          {/* Rayons rotatifs */}
          {isSunny && (
            <div style={{
              position: 'absolute',
              inset: -((haloSize - sunSize) / 2 + 10),
              borderRadius: '50%',
              background: `conic-gradient(
                transparent 0deg, rgba(255,210,0,0.18) 6deg, transparent 12deg,
                transparent 32deg, rgba(255,210,0,0.18) 38deg, transparent 44deg,
                transparent 76deg, rgba(255,210,0,0.18) 82deg, transparent 88deg,
                transparent 121deg, rgba(255,210,0,0.18) 127deg, transparent 133deg,
                transparent 166deg, rgba(255,210,0,0.18) 172deg, transparent 178deg,
                transparent 211deg, rgba(255,210,0,0.18) 217deg, transparent 223deg,
                transparent 256deg, rgba(255,210,0,0.18) 262deg, transparent 268deg,
                transparent 301deg, rgba(255,210,0,0.18) 307deg, transparent 313deg,
                transparent 346deg, rgba(255,210,0,0.18) 352deg, transparent 358deg
              )`,
              animation: 'cb-sun-spin 18s linear infinite',
            }} />
          )}

          {/* Halo corona */}
          <div style={{
            position: 'absolute',
            width: haloSize,
            height: haloSize,
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: isSunny
              ? 'radial-gradient(circle, rgba(255,220,0,0.65) 0%, rgba(255,160,0,0.28) 38%, rgba(255,80,0,0.08) 65%, transparent 100%)'
              : 'radial-gradient(circle, rgba(255,230,100,0.45) 0%, rgba(255,200,80,0.15) 50%, transparent 100%)',
            filter: 'blur(1.5px)',
            animation: isSunny ? 'cb-sun-glow 3s ease-in-out infinite' : 'none',
          }} />

          {/* Disque central */}
          <div style={{
            position: 'relative',
            width: sunSize, height: sunSize,
            borderRadius: '50%',
            background: isSunny
              ? 'radial-gradient(circle at 33% 28%, #FFFFF0 0%, #FFF080 18%, #FFCC00 52%, #FF8C00 100%)'
              : 'radial-gradient(circle at 33% 28%, #FFFEF0 0%, #FFF878 25%, #FFE860 60%, #FFCC30 100%)',
            boxShadow: isSunny
              ? '0 0 18px 2px #FFE000, 0 0 45px 5px rgba(255,160,0,0.88), 0 0 90px 15px rgba(255,80,0,0.50)'
              : '0 0 12px 1px #FFE080, 0 0 28px 3px rgba(255,200,80,0.65)',
            transition: 'width 400ms, height 400ms, box-shadow 400ms',
          }} />
        </div>
      )}

      {/* Badge direction soleil (coin bas-gauche) */}
      <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2">
        <div className="rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-lg"
          style={{ background: 'rgba(255,253,247,0.90)', backdropFilter: 'blur(10px)' }}>
          <span className="text-[14px]">{inFov ? '☀' : '☁'}</span>
          <span className="text-[11px] font-outfit font-bold text-nuit">
            {Math.round(altDeg)}° {cardDir}
          </span>
        </div>
        {isSunny && (
          <div className="rounded-full px-2.5 py-1.5 shadow-lg"
            style={{ background: '#FFBE0B' }}>
            <span className="text-[10px] font-outfit font-black text-nuit tracking-wide">☀ SUNNY</span>
          </div>
        )}
      </div>
    </div>
  )
}
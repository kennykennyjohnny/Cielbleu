'use client'

/**
 * Terrace3DView — mini carte Mapbox 3D face à la façade du bar.
 *
 * Bearing : calculé sur "idle" (tuiles garanties chargées) via
 * queryRenderedFeatures sur le layer cb-3d-buildings.
 * On trouve la direction vers le bâtiment le plus proche (1-70m),
 * puis on décale légèrement le centre vers la façade pour que la
 * caméra soit côté rue en train de regarder l'entrée du lieu.
 *
 * Éclairage : setLight() recalculé à chaque changement d'heure (slider).
 * Overlay SVG soleil/lune animé sur la 2D.
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

// Bounding rayon pour la recherche de bâtiment
const MIN_DIST_M = 3
const MAX_DIST_M = 75

// Décalage centre vers la façade (m) : recule la caméra sur la rue
const FACADE_OFFSET_M = 18

export default function Terrace3DView({ lat, lng, score, date }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const bearingRef = useRef<number>(180)
  const dateRef = useRef<Date>(date ?? new Date())
  const scoreRef = useRef<number>(score)
  dateRef.current = date ?? new Date()
  scoreRef.current = score

  // ── Création carte (une fois par lieu) ─────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [lng, lat],
      zoom: 18.6,
      pitch: 74,
      bearing: 180,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
    })

    map.on('style.load', () => {
      styleMap(map, lat, lng)
      applySunLighting(map, lat, lng, dateRef.current, scoreRef.current)

      // Tente de calculer le bearing. Réessaie si les tuiles ne sont pas encore chargées.
      function tryBearing(attempt: number) {
        const bearing = computeFacadeBearing(map, lat, lng)
        if (bearing != null) {
          bearingRef.current = bearing
          const [offLng, offLat] = offsetCenter(lat, lng, bearing, FACADE_OFFSET_M)
          map.jumpTo({ center: [offLng, offLat], bearing })
          // Animation d'entrée douce
          map.easeTo({ zoom: map.getZoom() + 0.15, duration: 1200, easing: (t) => t * (2 - t) })
        } else if (attempt < 3) {
          // Les tuiles bâtiments ne sont pas encore rendues — réessayer après un court délai
          setTimeout(() => tryBearing(attempt + 1), 400 * attempt)
        } else {
          // Fallback : animation d'entrée sans correction de bearing
          map.easeTo({ zoom: map.getZoom() + 0.15, duration: 1200, easing: (t) => t * (2 - t) })
        }
      }

      // On attend "idle" — les tuiles vectorielles bâtiments sont garanties rendues
      map.once('idle', () => tryBearing(1))
    })

    // Pin doré pulsant
    const pinEl = document.createElement('div')
    pinEl.style.cssText = `
      width: 18px; height: 18px; border-radius: 50%;
      background: radial-gradient(circle at 38% 32%, #FFE570 0%, #FFBE0B 60%, #FF9500 100%);
      border: 2.5px solid rgba(255,253,247,0.9);
      box-shadow: 0 0 0 3px rgba(255,190,11,0.35), 0 0 20px rgba(255,190,11,0.6), 0 4px 10px rgba(27,40,56,0.5);
      animation: pin-halo 2.4s ease-in-out infinite;
    `
    new mapboxgl.Marker({ element: pinEl, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map)

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [lat, lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mise à jour éclairage (slider horaire) ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () =>
      applySunLighting(map, lat, lng, dateRef.current, scoreRef.current)
    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
  }, [date, score, lat, lng])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      <SunOverlay
        lat={lat}
        lng={lng}
        score={score}
        date={date}
        bearingRef={bearingRef}
      />
    </div>
  )
}

// ── Style carte ─────────────────────────────────────────────────────────────

function styleMap(map: mapboxgl.Map, lat: number, lng: number) {
  const set = (id: string, prop: string, val: string | number | unknown[]) => {
    if (map.getLayer(id)) {
      try { map.setPaintProperty(id, prop as Parameters<typeof map.setPaintProperty>[1], val as never) } catch { /* ignore */ }
    }
  }

  // Ciel & sol
  set('background', 'background-color', '#B8D8EE')
  set('water', 'fill-color', '#6AAFD1')
  set('waterway', 'line-color', '#6AAFD1')

  // Routes — beige doux
  for (const r of ['road-primary', 'road-secondary-tertiary', 'road-street', 'road-minor']) {
    set(r, 'line-color', '#EDE6D9')
  }
  set('road-motorway', 'line-color', '#EDE6D9')

  // Espaces verts
  for (const g of ['landuse', 'park', 'national-park', 'pitch']) {
    set(g, 'fill-color', '#B8D4A0')
  }

  // Cache tous les labels & POI
  const layers = map.getStyle().layers ?? []
  for (const l of layers) {
    if (l.type === 'symbol' || l.id.includes('poi') || l.id.includes('label') || l.id.includes('transit')) {
      try { map.setLayoutProperty(l.id, 'visibility', 'none') } catch { /* ignore */ }
    }
  }

  // Bâtiments 3D — palette Haussmann chaude (pierre/ardoise)
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
            0,  '#E8DECA',
            12, '#DDD3BC',
            25, '#CDC3AB',
            50, '#B8AB92',
            80, '#A09178',
          ],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 0.97,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      labelLayerId
    )
  }

  // Fog / atmosphère pour profondeur
  try {
    map.setFog({
      color: '#C8DFF0',
      'high-color': '#8CC0DC',
      'horizon-blend': 0.06,
      'space-color': '#1A2A3A',
      range: [0.5, 10],
    } as Parameters<typeof map.setFog>[0])
  } catch { /* setFog may not exist in older sdk versions */ }

  // Sol entre bâtiments de la tuile satellite
  set('building', 'fill-color', '#EBE2D0')
  set('building', 'fill-opacity', 0.7)
  set('building-outline', 'line-color', '#D8CDB8')

  void lat; void lng // pas utilisé ici mais gardé pour signature claire
}

// ── Bearing vers la façade ──────────────────────────────────────────────────
// On cherche le bâtiment le plus proche parmi les features rendus (cb-3d-buildings).
// Le bearing renvoyé = direction depuis le bar vers le bâtiment voisin
// → la caméra Mapbox regardera dans cette direction = on voit la façade.

function computeFacadeBearing(
  map: mapboxgl.Map,
  lat: number,
  lng: number
): number | null {
  let features: mapboxgl.MapboxGeoJSONFeature[] = []
  try {
    features = map.queryRenderedFeatures({ layers: ['cb-3d-buildings'] })
  } catch {
    return null
  }
  if (!features?.length) return null

  const cosLat = Math.cos((lat * Math.PI) / 180)
  let nearestDist = Infinity
  let nearestBearing: number | null = null

  for (const f of features) {
    const g = f.geometry
    if (!g) continue

    let rings: number[][][] = []
    if (g.type === 'Polygon') rings = g.coordinates as number[][][]
    else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates as number[][][][]) {
        if (poly[0]) rings.push(poly[0])
      }
    }

    for (const ring of rings) {
      // Centroïde du ring
      let cx = 0, cy = 0
      for (const [x, y] of ring) { cx += x; cy += y }
      cx /= ring.length; cy /= ring.length

      const dxM = (cx - lng) * 111320 * cosLat
      const dyM = (cy - lat) * 111320
      const dist = Math.sqrt(dxM * dxM + dyM * dyM)
      if (dist < MIN_DIST_M || dist > MAX_DIST_M) continue

      if (dist < nearestDist) {
        nearestDist = dist
        nearestBearing = ((Math.atan2(dxM, dyM) * 180) / Math.PI + 360) % 360
      }
    }
  }

  return nearestBearing
}

// ── Décalage centre ─────────────────────────────────────────────────────────
// Décale [lat,lng] de `distM` mètres dans la direction `bearingDeg`.
// Retourne [newLng, newLat] pour Mapbox.

function offsetCenter(
  lat: number,
  lng: number,
  bearingDeg: number,
  distM: number
): [number, number] {
  const bearingRad = (bearingDeg * Math.PI) / 180
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const deltaLng = (Math.sin(bearingRad) * distM) / (111320 * cosLat)
  const deltaLat = (Math.cos(bearingRad) * distM) / 111320
  return [lng + deltaLng, lat + deltaLat]
}

// ── Éclairage solaire ───────────────────────────────────────────────────────

function applySunLighting(
  map: mapboxgl.Map,
  lat: number,
  lng: number,
  date: Date,
  score: number
) {
  const sun = getSunPosition(date, lat, lng)
  const azNorth = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const altDeg = (sun.altitude * 180) / Math.PI
  const isDay = altDeg > -3 // léger crépuscule civil inclus

  const set = (id: string, prop: string, val: string | number | unknown[]) => {
    if (map.getLayer(id)) {
      try { map.setPaintProperty(id, prop as Parameters<typeof map.setPaintProperty>[1], val as never) } catch { /* ignore */ }
    }
  }

  if (isDay) {
    const t = Math.max(0, Math.min(1, altDeg / 60))
    const intensity = 0.22 + t * 0.50

    // Couleur chaude plein soleil, bleutée à l'aube/crépuscule
    let color = '#FFFDE8'
    if (altDeg < 8) color = '#F0D8B0' // lever/coucher
    else if (score >= 4) color = '#FFE9A0' // beau soleil

    map.setLight({
      anchor: 'map',
      position: [1.5, azNorth, Math.max(10, 88 - altDeg)],
      color,
      intensity,
    })

    // Ciel jour
    set('background', 'background-color', altDeg > 5 ? '#B8D8EE' : '#E8C8A0')
  } else {
    map.setLight({
      anchor: 'map',
      position: [1.5, 0, 90],
      color: '#8898B8',
      intensity: 0.09,
    })
    set('background', 'background-color', '#0F1C2A')
  }
}

// ── Overlay soleil / lune ───────────────────────────────────────────────────

function SunOverlay({
  lat,
  lng,
  score,
  date,
  bearingRef,
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

  const cameraBearing = bearingRef.current ?? 180
  // Angle relatif entre soleil et caméra : -180..180
  const rel = (((azDeg - cameraBearing + 540) % 360) - 180)
  const inFov = Math.abs(rel) < 110

  // Position X : centré quand rel=0, hors cadre quand |rel|>110
  const sunX = 50 + (rel / 110) * 44 // % de la largeur
  // Position Y : haut quand altDeg grand
  const sunY = Math.max(5, 60 - altDeg * 0.85)

  // Boussole
  const cardDir =
    azDeg < 45 ? 'N' : azDeg < 135 ? 'E' : azDeg < 225 ? 'S' : azDeg < 315 ? 'O' : 'N'

  if (!isDay) {
    return (
      <div className="absolute top-4 left-4 z-10 rounded-full bg-[#0F1C2A]/80 backdrop-blur-sm px-3 py-1.5 flex items-center gap-2 pointer-events-none">
        <span className="text-base">🌙</span>
        <span className="text-[11px] font-outfit font-semibold text-[#B8CCE4]">Nuit</span>
      </div>
    )
  }

  return (
    <>
      {/* Soleil animé */}
      {inFov && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            left: `${sunX}%`,
            top: `${sunY}%`,
            transform: 'translate(-50%, -50%)',
            transition: 'left 500ms cubic-bezier(0.34,1.2,0.64,1), top 500ms cubic-bezier(0.34,1.2,0.64,1)',
          }}
        >
          {/* Halo externe */}
          <div
            style={{
              position: 'absolute',
              inset: isSunny ? -28 : -18,
              borderRadius: '50%',
              background: isSunny
                ? 'radial-gradient(circle, rgba(255,190,11,0.45) 0%, rgba(255,140,0,0.18) 50%, transparent 70%)'
                : 'radial-gradient(circle, rgba(255,224,100,0.28) 0%, transparent 70%)',
            }}
          />
          {/* Disque */}
          <div
            style={{
              width: isSunny ? 50 : 36,
              height: isSunny ? 50 : 36,
              borderRadius: '50%',
              background: isSunny
                ? 'radial-gradient(circle at 36% 30%, #FFF5A0 0%, #FFCC00 45%, #FF9500 100%)'
                : 'radial-gradient(circle at 36% 30%, #FFFBE0 0%, #FFE878 55%, #FFD060 100%)',
              boxShadow: isSunny
                ? '0 0 28px rgba(255,200,0,0.9), 0 0 70px rgba(255,140,0,0.6)'
                : '0 0 16px rgba(255,220,80,0.7)',
              transition: 'width 400ms, height 400ms, box-shadow 400ms',
            }}
          />
        </div>
      )}

      {/* Badge altitude + direction */}
      <div className="absolute top-4 left-4 z-10 rounded-full bg-white/85 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5 shadow-md pointer-events-none">
        <span className="text-[13px]">☀</span>
        <span className="text-[11px] font-outfit font-semibold text-nuit">
          {Math.round(altDeg)}° {cardDir}
        </span>
      </div>
    </>
  )
}

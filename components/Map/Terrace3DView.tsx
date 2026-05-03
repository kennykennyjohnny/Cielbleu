'use client'

// Mini map Mapbox 3D — vue façade FIXE du lieu, soleil/ombres dynamiques.
// Le bearing est calculé une fois (toward building cluster) et ne change plus.
// Seul le `setLight` est mis à jour quand la `date` (slider) bouge.

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { getSunPosition } from '@/lib/suncalc'

interface Props {
  lat: number
  lng: number
  score: number
  date?: Date
}

// Rayon utilisé pour estimer la direction des bâtiments depuis le lieu
const FACADE_RADIUS_M = 60

export default function Terrace3DView({ lat, lng, score, date }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const bearingRef = useRef<number>(180)
  const dateRef = useRef<Date>(date ?? new Date())
  dateRef.current = date ?? new Date()
  const scoreRef = useRef<number>(score)
  scoreRef.current = score

  // Création de la map (une seule fois par lieu)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [lng, lat],
      zoom: 18.1,
      pitch: 76,
      bearing: 180, // par défaut, sera ajusté après chargement des bâtiments
      interactive: false,
      attributionControl: false,
    })

    map.on('style.load', () => {
      const setIfExists = (
        id: string,
        prop: string,
        value: string | number | unknown[]
      ) => {
        if (map.getLayer(id)) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            map.setPaintProperty(id, prop as any, value as any)
          } catch {
            // ignore
          }
        }
      }

      // Sky-blue background (visible between buildings & above rooftops)
      setIfExists('background', 'background-color', '#C6DFF2')
      if (containerRef.current) containerRef.current.style.backgroundColor = '#C6DFF2'
      setIfExists('water', 'fill-color', '#7AB8D9')
      setIfExists('road-primary', 'line-color', '#F5F0E8')
      setIfExists('road-secondary-tertiary', 'line-color', '#F5F0E8')
      setIfExists('road-street', 'line-color', '#F0EBE0')
      setIfExists('road-minor', 'line-color', '#EDE8DC')
      setIfExists('landuse', 'fill-color', '#C8DBC0')
      setIfExists('park', 'fill-color', '#C8DBC0')

      // Cache labels & POI pour focus 3D
      const layers = map.getStyle().layers ?? []
      for (const l of layers) {
        if (
          l.type === 'symbol' ||
          l.id.includes('poi') ||
          l.id.includes('label') ||
          l.id.includes('transit')
        ) {
          try {
            map.setLayoutProperty(l.id, 'visibility', 'none')
          } catch {
            // ignore
          }
        }
      }

      if (!map.getLayer('cb-3d-buildings')) {
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
              0,   '#DDE8F0',
              15,  '#C8D8E8',
              30,  '#B8C8DA',
              60,  '#9AAFC4',
              120, '#7A90A8',
            ],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 0.95,
            'fill-extrusion-vertical-gradient': true,
          },
        })
      }

      // Premier passage de lumière
      applySunLighting(map, lat, lng, dateRef.current, scoreRef.current)

      // Détermine le bearing face à la façade dès que les tuiles sont prêtes.
      // Plusieurs essais car querySourceFeatures peut renvoyer vide pendant
      // le premier idle.
      let attempts = 0
      const tryBearing = () => {
        attempts += 1
        const b = computeFacadeBearing(map, lat, lng)
        if (b != null) {
          bearingRef.current = b
          map.easeTo({ bearing: b, duration: 700 })
          return
        }
        if (attempts < 8) {
          setTimeout(tryBearing, 250)
        }
      }
      tryBearing()
    })

    // Pin doré pulsant au centre
    const pinEl = document.createElement('div')
    pinEl.style.cssText = `
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #FFBE0B;
      border: 3px solid #FFFDF7;
      box-shadow:
        0 0 0 2px #FFBE0B,
        0 0 24px rgba(255,190,11,0.7),
        0 6px 12px rgba(27,40,56,0.4);
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
  }, [lat, lng])

  // Date / score change → on met juste à jour la lumière, pas la caméra
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

// --- Bearing toward facade --------------------------------------------------
// Centroïde pondéré (1 / distance) des bâtiments dans un rayon donné.
// Le bearing renvoyé pointe DEPUIS le lieu vers le gros des bâtiments,
// donc avec center=lieu la caméra finit du côté ouvert (rue).

function computeFacadeBearing(
  map: mapboxgl.Map,
  lat: number,
  lng: number
): number | null {
  let features: { geometry: unknown }[] = []
  try {
    features = map.querySourceFeatures('composite', {
      sourceLayer: 'building',
    }) as unknown as { geometry: unknown }[]
  } catch {
    return null
  }
  if (!features || features.length === 0) return null

  let sumX = 0
  let sumY = 0
  let sumW = 0
  const cosLat = Math.cos((lat * Math.PI) / 180)

  for (const f of features) {
    const g = f.geometry as { type?: string; coordinates?: unknown }
    if (!g || !g.coordinates) continue

    let ring: number[][] | null = null
    if (g.type === 'Polygon') {
      ring = (g.coordinates as number[][][])[0] ?? null
    } else if (g.type === 'MultiPolygon') {
      ring = (g.coordinates as number[][][][])[0]?.[0] ?? null
    }
    if (!ring || ring.length === 0) continue

    let cx = 0
    let cy = 0
    for (const [x, y] of ring) {
      cx += x
      cy += y
    }
    cx /= ring.length
    cy /= ring.length

    const dxM = (cx - lng) * 111320 * cosLat
    const dyM = (cy - lat) * 111320
    const dist = Math.sqrt(dxM * dxM + dyM * dyM)
    if (dist > FACADE_RADIUS_M || dist < 2) continue

    const w = 1 / (dist + 5)
    sumX += dxM * w
    sumY += dyM * w
    sumW += w
  }

  if (sumW === 0) return null
  const mx = sumX / sumW
  const my = sumY / sumW
  return ((Math.atan2(mx, my) * 180) / Math.PI + 360) % 360
}

// --- Sun lighting -----------------------------------------------------------

function applySunLighting(
  map: mapboxgl.Map,
  lat: number,
  lng: number,
  date: Date,
  score: number
) {
  const sun = getSunPosition(date, lat, lng)
  const sunAzimuthFromNorth = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const sunAltDeg = (sun.altitude * 180) / Math.PI
  const isDay = sunAltDeg > 0

  if (isDay) {
    const intensity = Math.min(0.72, 0.20 + sunAltDeg / 55)
    // Warm/orange tint for high sun, cooler for low sun
    const lightColor = sunAltDeg > 30
      ? (score >= 4 ? '#FFE9A8' : '#FFF5DC')
      : (sunAltDeg > 5 ? '#FFE0AA' : '#E8D5C0')
    map.setLight({
      anchor: 'map',
      position: [1.5, sunAzimuthFromNorth, Math.max(12, 88 - sunAltDeg)],
      color: lightColor,
      intensity,
    })
    // Brighten sky background during day
    try {
      const layers = map.getStyle().layers ?? []
      if (layers.some(l => l.id === 'background')) {
        map.setPaintProperty('background', 'background-color' as Parameters<typeof map.setPaintProperty>[1], '#C6DFF2')
      }
    } catch { /* ignore */ }
  } else {
    map.setLight({
      anchor: 'map',
      position: [1.5, 0, 80],
      color: '#8AAAC4',
      intensity: 0.10,
    })
    // Darken sky background at night
    try {
      const layers = map.getStyle().layers ?? []
      if (layers.some(l => l.id === 'background')) {
        map.setPaintProperty('background', 'background-color' as Parameters<typeof map.setPaintProperty>[1], '#1A2A3A')
      }
    } catch { /* ignore */ }
  }
}

// --- Sun overlay ------------------------------------------------------------
// Dessine le soleil (ou la lune) à la position relative à la caméra,
// pour que l'utilisateur visualise d'où il éclaire la façade.

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
  const isDay = altDeg > 0
  const isSunny = score >= 4

  // Position relative à la caméra : -180..180
  const cameraBearing = bearingRef.current ?? 180
  const rel = (((azDeg - cameraBearing + 540) % 360) - 180)
  const visible = Math.abs(rel) < 100

  // Boussole textuelle pour le badge
  const cardN = azDeg < 90 || azDeg > 270 ? 'N' : 'S'
  const cardE = azDeg < 180 ? 'E' : 'O'
  const card = `${cardN}-${cardE}`

  if (!isDay) {
    return (
      <div className="absolute top-3 left-3 rounded-full bg-nuit/85 backdrop-blur px-3 py-1.5 text-[11px] font-outfit font-semibold text-creme shadow-md flex items-center gap-1.5 pointer-events-none">
        <span>☾</span>
        Nuit
      </div>
    )
  }

  return (
    <>
      {visible && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: `${50 + (rel / 100) * 38}%`,
            top: `${Math.max(6, 55 - altDeg / 1.5)}%`,
            transform: 'translate(-50%, -50%)',
            transition: 'left 400ms ease, top 400ms ease',
          }}
        >
          {/* Outer glow */}
          <div
            style={{
              position: 'absolute',
              inset: isSunny ? '-24px' : '-14px',
              borderRadius: '50%',
              background: isSunny
                ? 'radial-gradient(circle, rgba(255,190,11,0.50) 0%, rgba(255,149,0,0.20) 50%, transparent 70%)'
                : 'radial-gradient(circle, rgba(255,217,118,0.30) 0%, transparent 70%)',
              pointerEvents: 'none',
            }}
          />
          {/* Sun disc */}
          <div
            style={{
              width: isSunny ? 46 : 34,
              height: isSunny ? 46 : 34,
              borderRadius: '50%',
              background: isSunny
                ? 'radial-gradient(circle at 38% 32%, #FFF0A0 0%, #FFBE0B 48%, #FF9500 100%)'
                : 'radial-gradient(circle at 38% 32%, #FFFDE0 0%, #FFE88A 60%, #FFD976 100%)',
              boxShadow: isSunny
                ? '0 0 22px rgba(255,190,11,0.95), 0 0 60px rgba(255,140,0,0.55)'
                : '0 0 14px rgba(255,220,80,0.65)',
              transition: 'width 300ms, height 300ms',
            }}
          />
        </div>
      )}
      {/* Direction badge */}
      <div className="absolute top-3 left-3 rounded-full bg-white/90 backdrop-blur-sm px-3 py-1.5 text-[11px] font-outfit font-semibold text-nuit shadow-md flex items-center gap-1.5 pointer-events-none">
        <span className="text-[#FFBE0B]">☀</span>
        {Math.round(altDeg)}° · {card}
      </div>
    </>
  )
}

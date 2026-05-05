'use client'

/**
 * Terrace3DView v9 — Vue rue immersive
 *
 * Nouveautés v9 :
 *  - Ombres portées au sol (convex hull géométrie + projection solaire)
 *  - API Mapbox v3 setLights() (cast-shadows: true) + fallback setLight()
 *  - Navigation libre : pan, scroll zoom, touch après orientation
 *  - Bâtiments de fond assombris (0.28) → bâtiment cible valorisé
 *  - Rotation ±88° via requestAnimationFrame (plus fiable)
 *  - Indicateur de chargement + hint navigation
 *  - Pitch 65°, zoom 19.0 → moins d'obstruction par les immeubles voisins
 */

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { getSunPosition } from '@/lib/suncalc'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  lat: number
  lng: number
  score: number
  date?: Date
  name?: string
}

interface PlaceContext {
  building: {
    geo_shape: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
    nb_pl: number | null
    l_plan_h: string | null
    h_et_max: number | null
  } | null
  terrace: {
    nom_enseigne: string | null
    longueur: number | null
    largeur: number | null
    typologie: string | null
  } | null
}

interface OrientResult {
  bearing: number
  distM: number
  feature: mapboxgl.MapboxGeoJSONFeature
}

interface BldData {
  ring: number[][]
  height: number
}

// Distance depuis la façade : on se place côté rue, légèrement en recul
const STREET_OFFSET_M = 32

// ─── Composant principal ─────────────────────────────────────────────────────

export default function Terrace3DView({ lat, lng, score, date, name }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<mapboxgl.Map | null>(null)
  const dateRef       = useRef(date ?? new Date())
  const scoreRef      = useRef(score)
  const bldDataRef    = useRef<BldData | null>(null)

  const [bearing, setBearing]             = useState(0)
  const [resolvedScore, setResolvedScore] = useState(score)
  const [isOriented, setIsOriented]       = useState(false)

  dateRef.current  = date ?? new Date()
  scoreRef.current = score

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [lng, lat],
      zoom: 18.0, pitch: 72, bearing: 0,
      scrollZoom: true, boxZoom: false, doubleClickZoom: false,
      dragRotate: true, dragPan: true, keyboard: false,
      touchZoomRotate: true, touchPitch: true,
      attributionControl: false, fadeDuration: 150,
    })
    map.scrollZoom.setZoomRate(0.06)

    let disposed = false, oriented = false
    const timers: ReturnType<typeof setTimeout>[] = []

    const ctxP = fetch(`/api/place-context?lat=${lat}&lng=${lng}`)
      .then(r => r.ok ? r.json() as Promise<PlaceContext> : null)
      .catch(() => null)

    let clampWired = false

    map.on('style.load', () => {
      if (disposed) return
      styleMap(map)
      setSunLight(map, lat, lng, dateRef.current, scoreRef.current, null)

      // 3D opérationnel dès l'arrivée des tuiles — slider + interactions actives
      map.once('idle', () => {
        if (disposed) return
        setIsOriented(true)
        map.setMinZoom(16.5)
        map.setMaxZoom(20.8)
        const s = 0.008
        map.setMaxBounds([[lng - s, lat - s], [lng + s, lat + s]])
      })

      const finalize = (result: OrientResult, tw = 9, td = 3.5) => {
        if (disposed || oriented) return
        oriented = true

        const baseBearing = result.bearing
        const [cLng, cLat] = offsetCenter(lat, lng, baseBearing, -STREET_OFFSET_M)

        map.flyTo({
          center: [cLng, cLat], bearing: baseBearing,
          zoom: 19.0, pitch: 78, speed: 1.0, curve: 1.3, essential: true,
        })

        trySetPaint(map, 'cb-3d-buildings', 'fill-extrusion-opacity', 0.28)

        setBearing(baseBearing)
        highlightBuilding(map, result.feature, scoreRef.current)
        addTerraceZone(map, lat, lng, baseBearing, scoreRef.current, tw, td)

        const geom = result.feature.geometry
        const ring: number[][] | null =
          geom?.type === 'Polygon'
            ? (geom as GeoJSON.Polygon).coordinates[0] as number[][]
            : geom?.type === 'MultiPolygon'
              ? (geom as GeoJSON.MultiPolygon).coordinates[0][0] as number[][]
              : null
        const h = (result.feature.properties?.height as number | null) ?? 20
        if (ring && ring.length >= 3) {
          const bldData: BldData = { ring, height: h }
          bldDataRef.current = bldData
          setSunLight(map, lat, lng, dateRef.current, scoreRef.current, bldData)
        }

        setResolvedScore(scoreRef.current)

        if (!clampWired) {
          clampWired = true
          let clamping = false
          // ±120° : on peut s'approcher de la façade depuis 120° chaque côté
          map.on('rotate', () => {
            if (clamping) return
            const delta = ((map.getBearing() - baseBearing + 540) % 360) - 180
            if (Math.abs(delta) > 120) {
              clamping = true
              map.jumpTo({ bearing: baseBearing + (delta > 0 ? 120 : -120) })
              requestAnimationFrame(() => { clamping = false })
            }
          })
        }
      }

      ctxP.then(ctx => {
        if (disposed || oriented) return
        const shape = ctx?.building?.geo_shape
        if (!shape) return
        const poly = normalizeToPolygon(shape)
        if (!poly) return
        const b = bearingFromPolygon(poly, lat, lng)
        if (b === null) return
        const nbPl   = ctx.building?.nb_pl ?? 0
        const height = Math.max(8, Math.round(nbPl * 3 + 2))
        const tw     = ctx.terrace?.longueur ?? 9
        const td     = ctx.terrace?.largeur  ?? 3.5

        const geoData: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: poly, properties: { height, min_height: 0 } }],
        }
        if (!map.getSource('cb-api-bld')) {
          map.addSource('cb-api-bld', { type: 'geojson', data: geoData })
          map.addLayer({
            id: 'cb-api-bld-base', source: 'cb-api-bld', type: 'fill-extrusion',
            paint: {
              'fill-extrusion-color': buildingColorFromFloors(nbPl, scoreRef.current),
              'fill-extrusion-height': height, 'fill-extrusion-base': 0,
              'fill-extrusion-opacity': 0.97, 'fill-extrusion-vertical-gradient': true,
              'fill-extrusion-ambient-occlusion-intensity': 0.96,
              'fill-extrusion-ambient-occlusion-radius': 5.0,
            },
          })
        }
        finalize({ bearing: b, distM: 0, feature: makeFeature(poly, height) }, tw, td)
      })

      const tryTiles = () => {
        if (disposed || oriented) return
        const r = findNearestBuilding(map, lat, lng)
        if (r) finalize(r)
      }
      map.on('idle', tryTiles)
      map.on('sourcedata', (e: mapboxgl.MapSourceDataEvent) => {
        if (e.sourceId === 'composite' && e.isSourceLoaded) tryTiles()
      })
      timers.push(
        setTimeout(tryTiles, 700),
        setTimeout(tryTiles, 1600),
        setTimeout(tryTiles, 3500),
      )
    })

    new mapboxgl.Marker({ element: buildPin(), anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)
    mapRef.current = map

    return () => {
      disposed = true
      timers.forEach(clearTimeout)
      map.remove()
      mapRef.current = null
    }
  }, [lat, lng]) // eslint-disable-line

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => setSunLight(map, lat, lng, dateRef.current, scoreRef.current, bldDataRef.current)
    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
  }, [date, score, lat, lng])

  const d          = date ?? new Date()
  const sun        = getSunPosition(d, lat, lng)
  const altDeg     = (sun.altitude * 180) / Math.PI
  const azDeg      = ((sun.azimuth  * 180) / Math.PI + 180) % 360
  const isDay      = altDeg > -3
  const relAngle   = ((azDeg - bearing + 540) % 360) - 180
  const isFrontLit = isDay && Math.abs(relAngle) < 90

  const facadeState = !isDay
    ? 'nuit, terrasse fermée'
    : isFrontLit
      ? `façade ensoleillée, soleil à ${Math.round(altDeg)}° au-dessus de l'horizon`
      : `façade à l'ombre, soleil à ${Math.round(altDeg)}° au-dessus de l'horizon`
  const ariaLabel = `Vue 3D ${name ?? 'de la terrasse'} — ${facadeState}. Utilise les flèches gauche et droite pour pivoter jusqu'à 120° autour du bâtiment.`

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const map = mapRef.current
    if (!map || !isOriented) return
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      const step = e.shiftKey ? 30 : 15
      const dir  = e.key === 'ArrowLeft' ? -1 : 1
      map.easeTo({ bearing: map.getBearing() + dir * step, duration: 280 })
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault(); map.zoomIn({ duration: 200 })
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault(); map.zoomOut({ duration: 200 })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); map.easeTo({ pitch: Math.min(85, map.getPitch() + 5), duration: 200 })
    } else if (e.key === 'ArrowDown') {
      e.preventDefault(); map.easeTo({ pitch: Math.max(40, map.getPitch() - 5), duration: 200 })
    }
  }

  return (
    <div className="relative w-full h-full overflow-hidden"
      role="region" aria-label={ariaLabel} aria-busy={!isOriented}
      tabIndex={0} onKeyDown={handleKeyDown}
      style={{ outline: 'none' }}>
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <SkyGradient altDeg={altDeg} isDay={isDay} />
      </div>
      <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 1 }} />
      {!isDay && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 3, background: 'rgba(8,14,22,0.72)' }} />
      )}
      {isDay && <SunDisc altDeg={altDeg} relAngle={relAngle} score={resolvedScore} />}
      {/* Badge nom du lieu — coiné en bas à gauche pour identifier le bâtiment */}
      {isOriented && name && (
        <div className="absolute bottom-3 left-3 z-10 pointer-events-none max-w-[160px]">
          <div className="rounded-xl px-2.5 py-1.5"
            style={{ background: 'rgba(11,31,58,0.82)', backdropFilter: 'blur(10px)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.30)' }}>
            <span className="font-outfit font-bold text-[11px] leading-tight block truncate"
              style={{ color: '#FFE580' }}>{name}</span>
            <span className="font-outfit text-[9px] block" style={{ color: 'rgba(255,255,255,0.55)' }}>
              ← glisser pour pivoter →
            </span>
          </div>
        </div>
      )}
      {!isOriented && <LoadingOverlay />}
    </div>
  )
}

// ─── UI Overlays ──────────────────────────────────────────────────────────────

function SkyGradient({ altDeg, isDay }: { altDeg: number; isDay: boolean }) {
  let bg = 'linear-gradient(to bottom, #0D1820 0%, #1B2838 100%)'
  if (isDay) {
    if (altDeg > 30)
      bg = 'linear-gradient(to bottom, #2D7DD2 0%, #73B9FF 35%, #B8D8F8 70%, #E8F4FF 100%)'
    else if (altDeg > 10)
      bg = 'linear-gradient(to bottom, #1A5FA8 0%, #4A9FE0 30%, #92CFF0 65%, #D4EEF8 100%)'
    else if (altDeg > 0)
      bg = 'linear-gradient(to bottom, #1B2E52 0%, #2A5090 25%, #F5924A 60%, #FFC080 85%, #FFE4C0 100%)'
    else
      bg = 'linear-gradient(to bottom, #0A1830 0%, #1A3060 50%, #4A2030 80%, #7A3820 100%)'
  }
  return <div className="absolute inset-0" style={{ background: bg, transition: 'background 1.5s ease' }} />
}

function SunDisc({ altDeg, relAngle, score }: { altDeg: number; relAngle: number; score: number }) {
  const inFov  = Math.abs(relAngle) < 128
  const sunX   = 50 + (relAngle / 128) * 44
  const sunY   = Math.max(4, 38 - altDeg * 0.55)
  const sunny  = score >= 4
  const sz     = sunny ? 68 : 44
  const halo   = sunny ? 170 : 100
  if (!inFov) return null
  return (
    <div className="absolute pointer-events-none"
      style={{ left: `${sunX}%`, top: `${sunY}%`, transform: 'translate(-50%,-50%)', zIndex: 2,
        transition: 'left 800ms cubic-bezier(0.34,1.1,0.64,1), top 800ms ease' }}>
      {sunny && (
        <div style={{
          position: 'absolute', width: halo + 40, height: halo + 40,
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)', borderRadius: '50%',
          background: 'conic-gradient(transparent 0deg,rgba(255,220,40,0.22) 8deg,transparent 16deg,transparent 43deg,rgba(255,220,40,0.22) 51deg,transparent 59deg,transparent 88deg,rgba(255,220,40,0.22) 96deg,transparent 104deg,transparent 133deg,rgba(255,220,40,0.22) 141deg,transparent 149deg,transparent 178deg,rgba(255,220,40,0.22) 186deg,transparent 194deg,transparent 223deg,rgba(255,220,40,0.22) 231deg,transparent 239deg,transparent 268deg,rgba(255,220,40,0.22) 276deg,transparent 284deg,transparent 313deg,rgba(255,220,40,0.22) 321deg,transparent 329deg)',
          animation: 'cb-sun-spin 22s linear infinite',
        }} />
      )}
      <div style={{
        position: 'absolute', width: halo, height: halo,
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)', borderRadius: '50%',
        background: sunny
          ? 'radial-gradient(circle,rgba(255,230,0,0.82) 0%,rgba(255,150,0,0.38) 40%,transparent 70%)'
          : 'radial-gradient(circle,rgba(255,220,80,0.55) 0%,rgba(255,200,60,0.18) 55%,transparent 100%)',
        filter: 'blur(3px)', animation: sunny ? 'cb-sun-glow 3s ease-in-out infinite' : 'none',
      }} />
      <div style={{
        position: 'relative', width: sz, height: sz, borderRadius: '50%',
        background: sunny
          ? 'radial-gradient(circle at 34% 30%,#FFFFF0 0%,#FFF060 18%,#FFC800 55%,#FF8000 100%)'
          : 'radial-gradient(circle at 34% 30%,#FFFEF0 0%,#FFF060 25%,#FFD840 60%,#FFC020 100%)',
        boxShadow: sunny
          ? '0 0 18px 3px #FFD800,0 0 50px 10px rgba(255,150,0,0.90),0 0 90px 22px rgba(255,60,0,0.50)'
          : '0 0 12px 2px #FFE070,0 0 30px 5px rgba(255,200,60,0.65)',
      }} />
    </div>
  )
}

function ShadowPill({ isFrontLit, isDay, altDeg }: { isFrontLit: boolean; isDay: boolean; altDeg: number }) {
  const lowSun = isDay && altDeg < 10
  if (!isDay) return (
    <div className="absolute top-3 left-3 z-10 pointer-events-none">
      <div className="rounded-full px-3 py-1.5 flex items-center gap-2"
        style={{ background: 'rgba(8,14,22,0.88)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-[13px]">🌙</span>
        <span className="font-outfit font-bold text-[11px]" style={{ color: '#8abbe0' }}>Nuit</span>
      </div>
    </div>
  )
  if (isFrontLit) return (
    <div className="absolute top-3 left-3 z-10 pointer-events-none">
      <div className="rounded-full px-3 py-1.5 flex items-center gap-2"
        style={{ background: lowSun ? 'rgba(255,140,0,0.92)' : 'rgba(255,183,3,0.92)',
          backdropFilter: 'blur(10px)', boxShadow: '0 4px 18px rgba(255,160,0,0.45)',
          border: '1px solid rgba(255,255,255,0.25)' }}>
        <span className="text-[13px]">☀️</span>
        <span className="font-outfit font-black text-[11px]" style={{ color: '#0b1f3a' }}>
          {lowSun ? 'Soleil rasant' : 'Terrasse ensoleillée'}
        </span>
      </div>
    </div>
  )
  return (
    <div className="absolute top-3 left-3 z-10 pointer-events-none">
      <div className="rounded-full px-3 py-1.5 flex items-center gap-2"
        style={{ background: 'rgba(20,40,70,0.88)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="text-[13px]">🌑</span>
        <span className="font-outfit font-bold text-[11px]" style={{ color: '#8abbe0' }}>Terrasse à l&apos;ombre</span>
      </div>
    </div>
  )
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
      style={{ background: 'rgba(237,229,214,0.88)', backdropFilter: 'blur(8px)' }}>
      <div className="text-center space-y-2">
        <div className="text-3xl" style={{ animation: 'pin-halo 1.6s ease-in-out infinite' }}>🗺️</div>
        <p className="font-outfit text-[13px] font-medium" style={{ color: '#4A5568' }}>
          Chargement de la vue 3D…
        </p>
      </div>
    </div>
  )
}

function NavigationHint() {
  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
      <div className="rounded-full px-3 py-1.5"
        style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(10px)',
          boxShadow: '0 2px 12px rgba(11,31,58,0.12)' }}>
        <span className="font-outfit text-[10px]" style={{ color: '#4A5568' }}>
          ↔ Pivoter · ← → clavier · 🔍 Zoomer
        </span>
      </div>
    </div>
  )
}

// ─── Marqueur ─────────────────────────────────────────────────────────────────

function buildPin(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;pointer-events:none;'
  el.innerHTML = '<div style="width:14px;height:14px;border-radius:50%;background:#FFB703;border:3px solid rgba(255,255,255,0.96);box-shadow:0 0 0 3px rgba(255,183,3,0.38),0 3px 10px rgba(11,31,58,0.38);"></div><div style="width:2px;height:12px;background:linear-gradient(to bottom,#FFB703,transparent);margin-top:-1px;"></div>'
  return el
}

// ─── Style Mapbox ─────────────────────────────────────────────────────────────

function styleMap(map: mapboxgl.Map) {
  const set = (id: string, prop: string, val: unknown) => trySetPaint(map, id, prop, val)
  set('background', 'background-color', '#EDE5D6')
  set('water', 'fill-color', '#A8C8DC')
  set('waterway', 'line-color', '#A8C8DC')
  for (const r of ['road-primary','road-secondary-tertiary','road-street','road-minor',
                   'road-motorway','road-path','road-pedestrian'])
    set(r, 'line-color', '#F2E8D4')
  for (const g of ['landuse','park','national-park','pitch','grass'])
    set(g, 'fill-color', '#C4DCA0')
  for (const l of map.getStyle().layers ?? [])
    if (l.type === 'symbol' || l.id.includes('poi') || l.id.includes('label') || l.id.includes('transit'))
      try { map.setLayoutProperty(l.id, 'visibility', 'none') } catch { /* noop */ }

  if (!map.getLayer('cb-3d-buildings')) {
    // Insérer AVANT le premier layer symbol pour que les labels passent devant
    const lblLayer = map.getStyle().layers?.find(
      l => l.type === 'symbol' && (l.layout as Record<string, unknown>)?.['text-field']
    )?.id
    map.addLayer({
      id: 'cb-3d-buildings', source: 'composite', 'source-layer': 'building',
      filter: ['==', ['get', 'extrude'], 'true'], type: 'fill-extrusion', minzoom: 14,
      paint: {
        // Palette haussmannienne contrastée — pierre de taille sombre en haut
        'fill-extrusion-color': [
          'interpolate', ['linear'], ['get', 'height'],
          0,  '#C8C0B0',
          8,  '#BEB4A4',
          16, '#B0A694',
          30, '#A09680',
          50, '#887860',
          80, '#706050',
        ],
        'fill-extrusion-height':  ['get', 'height'],
        'fill-extrusion-base':    ['get', 'min_height'],
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': true,
        'fill-extrusion-ambient-occlusion-intensity': 0.92,
        'fill-extrusion-ambient-occlusion-radius': 5.0,
      },
    }, lblLayer)
  }
  set('building', 'fill-color', '#E0D8CA')
  set('building', 'fill-opacity', 0.45)
  try {
    map.setFog({
      color: '#EAE2D2', 'high-color': '#D4C8B4',
      'horizon-blend': 0.04, 'space-color': '#101828', range: [0.8, 14],
    } as Parameters<typeof map.setFog>[0])
  } catch { /* noop */ }
}

// ─── Éclairage solaire (v3 setLights + fallback setLight) ────────────────────

function setSunLight(
  map: mapboxgl.Map,
  lat: number, lng: number,
  date: Date, score: number,
  bldData: BldData | null,
) {
  const sun     = getSunPosition(date, lat, lng)
  const azNorth = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const altDeg  = (sun.altitude * 180) / Math.PI
  const isDay   = altDeg > -3
  const polar   = Math.min(85, Math.max(25, 90 - altDeg))

  if (isDay) {
    const lightColor = altDeg < 5  ? '#FFB060'
      : altDeg < 15 ? '#FFD890'
      : score >= 4  ? '#FFFCE0' : '#FFF8F0'
    const intensity = Math.min(1.0, Math.max(0.4, 0.55 + altDeg / 75))
    const ambInt    = Math.max(0.10, 0.30 - altDeg / 100)
    const shadowInt = Math.min(0.92, Math.max(0.0, 0.35 + altDeg / 55))

    if (!tryLightsV3(map, [
      { id: 'cb-amb', type: 'ambient',     properties: { color: '#EDD8B8', intensity: ambInt } },
      { id: 'cb-sun', type: 'directional', properties: {
        color: lightColor, intensity, direction: [azNorth, polar],
        'cast-shadows': altDeg > 4, 'shadow-intensity': shadowInt,
      }},
    ])) {
      map.setLight({ anchor: 'map', position: [1.5, azNorth, polar], color: lightColor, intensity: 1.0 })
    }
    trySetPaint(map, 'background', 'background-color', altDeg > 8 ? '#EDE5D6' : '#C88050')
  } else {
    if (!tryLightsV3(map, [
      { id: 'cb-amb', type: 'ambient',     properties: { color: '#1A2840', intensity: 0.09 } },
      { id: 'cb-sun', type: 'directional', properties: { color: '#2A3C58', intensity: 0.03, direction: [0, 88], 'cast-shadows': false } },
    ])) {
      map.setLight({ anchor: 'map', position: [1.5, 0, 88], color: '#2A3C58', intensity: 0.04 })
    }
    trySetPaint(map, 'background', 'background-color', '#0A1420')
  }

  if (bldData && altDeg > 2) addGroundShadow(map, bldData.ring, azNorth, altDeg, bldData.height)
  else removeGroundShadow(map)
}

function tryLightsV3(map: mapboxgl.Map, lights: unknown[]): boolean {
  const fn = (map as unknown as { setLights?: (l: unknown[]) => void }).setLights
  if (typeof fn !== 'function') return false
  try { fn.call(map, lights); return true } catch { return false }
}

function trySetPaint(map: mapboxgl.Map, id: string, prop: string, val: unknown) {
  if (map.getLayer(id)) try { map.setPaintProperty(id, prop as never, val as never) } catch { /* noop */ }
}

// ─── Ombre portée au sol ─────────────────────────────────────────────────────

function addGroundShadow(
  map: mapboxgl.Map, ring: number[][], sunAzDeg: number, sunAltDeg: number, height: number,
) {
  if (sunAltDeg < 2 || height < 1 || ring.length < 3) { removeGroundShadow(map); return }
  const cosLat    = Math.cos((ring[0][1] * Math.PI) / 180)
  const shdAzRad  = ((sunAzDeg + 180) % 360) * Math.PI / 180
  const shadowLen = Math.min(height / Math.tan(sunAltDeg * Math.PI / 180), 100)
  const dE = Math.sin(shdAzRad) * shadowLen, dN = Math.cos(shdAzRad) * shadowLen
  const projected: [number, number][] = ring.map(([x, y]) => [
    x + dE / (111320 * cosLat), y + dN / 111320,
  ])
  const hull = convexHull([...ring.map(v => [v[0], v[1]] as [number, number]), ...projected])
  if (hull.length < 3) return
  hull.push(hull[0])
  const opacity = Math.min(0.50, Math.max(0.10, 0.18 + 0.45 * Math.cos(sunAltDeg * Math.PI / 180)))
  const geoData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [hull] }, properties: {} }],
  }
  const src = map.getSource('cb-shadow-src') as mapboxgl.GeoJSONSource | undefined
  if (src) { src.setData(geoData); trySetPaint(map, 'cb-shadow', 'fill-opacity', opacity); return }
  map.addSource('cb-shadow-src', { type: 'geojson', data: geoData })
  const before = map.getLayer('cb-3d-buildings') ? 'cb-3d-buildings' : undefined
  map.addLayer({
    id: 'cb-shadow', type: 'fill', source: 'cb-shadow-src',
    paint: { 'fill-color': '#0B1F3A', 'fill-opacity': opacity, 'fill-antialias': true },
  }, before)
}

function removeGroundShadow(map: mapboxgl.Map) {
  try { if (map.getLayer('cb-shadow'))      map.removeLayer('cb-shadow')      } catch { /* noop */ }
  try { if (map.getSource('cb-shadow-src')) map.removeSource('cb-shadow-src') } catch { /* noop */ }
}

function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return [...pts]
  const s = [...pts].sort((a, b) => a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1])
  const c = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0]-o[0])*(b[1]-o[1]) - (a[1]-o[1])*(b[0]-o[0])
  const lo: [number, number][] = []
  for (const p of s) { while (lo.length >= 2 && c(lo[lo.length-2], lo[lo.length-1], p) <= 0) lo.pop(); lo.push(p) }
  const up: [number, number][] = []
  for (const p of [...s].reverse()) { while (up.length >= 2 && c(up[up.length-2], up[up.length-1], p) <= 0) up.pop(); up.push(p) }
  lo.pop(); up.pop()
  return [...lo, ...up]
}

// ─── Highlight bâtiment ───────────────────────────────────────────────────────

function highlightBuilding(map: mapboxgl.Map, feature: mapboxgl.MapboxGeoJSONFeature, score: number) {
  if (!feature.geometry) return
  const height  = (feature.properties?.height     as number | null) ?? 20
  const minH    = (feature.properties?.min_height as number | null) ?? 0
  // Couleur très chaude et lumineuse pour identifier clairement LE bâtiment
  const hlColor = score >= 4 ? '#FFEC6A' : score >= 2 ? '#F5E098' : '#E8D8A8'
  const geo: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: feature.geometry as GeoJSON.Geometry, properties: {} }],
  }
  const src = map.getSource('cb-bar-bld') as mapboxgl.GeoJSONSource | undefined
  if (src) { src.setData(geo); trySetPaint(map, 'cb-bar-bld-hl', 'fill-extrusion-color', hlColor); return }
  map.addSource('cb-bar-bld', { type: 'geojson', data: geo })
  map.addLayer({
    id: 'cb-bar-bld-hl', source: 'cb-bar-bld', type: 'fill-extrusion',
    paint: {
      'fill-extrusion-color': hlColor, 'fill-extrusion-height': height, 'fill-extrusion-base': minH,
      'fill-extrusion-opacity': 1.0,
      'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-ambient-occlusion-intensity': 0.50,
      'fill-extrusion-ambient-occlusion-radius': 4.0,
    },
  })
  // Anneau lumineux autour du bâtiment cible
  map.addLayer({
    id: 'cb-bar-glow', source: 'cb-bar-bld', type: 'line',
    paint: {
      'line-color': score >= 4 ? '#E8A000' : '#A09060',
      'line-width': ['interpolate', ['linear'], ['zoom'], 16, 2.5, 19, 5.0],
      'line-blur': 4,
      'line-opacity': 0.95,
    },
  })
}

function addTerraceZone(
  map: mapboxgl.Map, lat: number, lng: number, cameraBearing: number,
  score: number, terraceW = 9, terraceD = 3.5,
) {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const rad    = (cameraBearing * Math.PI) / 180
  const fwdE = Math.sin(rad), fwdN = Math.cos(rad), rgtE = Math.cos(rad), rgtN = -Math.sin(rad)
  const toLL = (dE: number, dN: number): [number, number] => [lng + dE / (111320 * cosLat), lat + dN / 111320]
  const W = terraceW / 2, D = terraceD
  const corners: [number, number][] = [
    toLL( rgtE*W,          rgtN*W),
    toLL(-rgtE*W,         -rgtN*W),
    toLL(-fwdE*D-rgtE*W, -fwdN*D-rgtN*W),
    toLL(-fwdE*D+rgtE*W, -fwdN*D+rgtN*W),
    toLL( rgtE*W,          rgtN*W),
  ]
  const fc   = score >= 4 ? '#FFD444' : '#78A8C8'
  const fo   = score >= 4 ? 0.68 : 0.42
  const lc   = score >= 4 ? '#B88000' : '#3A6080'
  const geo: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [corners] }, properties: {} }],
  }
  if (map.getSource('cb-terrace')) { ;(map.getSource('cb-terrace') as mapboxgl.GeoJSONSource).setData(geo); return }
  map.addSource('cb-terrace', { type: 'geojson', data: geo })
  map.addLayer({ id: 'cb-terrace-fill', source: 'cb-terrace', type: 'fill', paint: { 'fill-color': fc, 'fill-opacity': fo } })
  map.addLayer({ id: 'cb-terrace-outline', source: 'cb-terrace', type: 'line', paint: { 'line-color': lc, 'line-width': 2, 'line-dasharray': [4, 2] } })
}

// ─── Géométrie ─────────────────────────────────────────────────────────────────

function bearingFromPolygon(poly: GeoJSON.Polygon, lat: number, lng: number): number | null {
  const ring = poly.coordinates[0] as number[][]
  if (!ring || ring.length < 3) return null
  const cosLat = Math.cos((lat * Math.PI) / 180)
  let bestDist = Infinity, bestBearing: number | null = null
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i], [bx, by] = ring[i + 1]
    const mx = ((ax + bx) / 2 - lng) * 111320 * cosLat, my = ((ay + by) / 2 - lat) * 111320
    const d  = Math.sqrt(mx*mx + my*my)
    if (d < 1 || d > 100) continue
    const ex = (bx-ax)*111320*cosLat, ey = (by-ay)*111320, el = Math.sqrt(ex*ex+ey*ey)
    if (el < 0.5) continue
    const n1x = ey/el, n1y = -ex/el, dot = n1x*(-mx)+n1y*(-my)
    const nx = dot > 0 ? n1x : -n1x, ny = dot > 0 ? n1y : -n1y
    const cb = ((Math.atan2(-nx,-ny)*180/Math.PI)+360)%360
    if (d < bestDist) { bestDist = d; bestBearing = cb }
  }
  return bestBearing
}

function buildingColorFromFloors(nbPl: number | null, score: number): string {
  if (score >= 4) return '#FAE880'
  const n = nbPl ?? 5
  if (n <= 3) return '#EDE6DC'; if (n <= 5) return '#E4DDD2'
  if (n <= 7) return '#D8D0C4'; return '#CCCABE'
}

function normalizeToPolygon(
  shape: GeoJSON.Polygon | GeoJSON.MultiPolygon | { type?: string; coordinates?: unknown },
): GeoJSON.Polygon | null {
  if (!shape?.type) return null
  if (shape.type === 'Polygon') return shape as GeoJSON.Polygon
  if (shape.type === 'MultiPolygon') {
    const coords = (shape as GeoJSON.MultiPolygon).coordinates
    if (!coords?.length) return null
    let best = coords[0][0]
    for (const poly of coords) { if (poly[0].length > best.length) best = poly[0] }
    return { type: 'Polygon', coordinates: [best] }
  }
  return null
}

function makeFeature(poly: GeoJSON.Polygon, height: number): mapboxgl.MapboxGeoJSONFeature {
  return {
    type: 'Feature', geometry: poly as GeoJSON.Geometry, properties: { height, min_height: 0 },
    id: 0, layer: { id: 'cb-api-bld-base', type: 'fill-extrusion' } as mapboxgl.AnyLayer,
    source: 'cb-api-bld', sourceLayer: 'building', state: {},
  } as unknown as mapboxgl.MapboxGeoJSONFeature
}

function findNearestBuilding(map: mapboxgl.Map, lat: number, lng: number): OrientResult | null {
  let features: mapboxgl.MapboxGeoJSONFeature[] = []
  try { features = map.querySourceFeatures('composite', { sourceLayer: 'building', filter: ['==', ['get', 'extrude'], 'true'] }) } catch { /* noop */ }
  if (!features.length && map.getLayer('cb-3d-buildings')) {
    try { const p = map.project([lng, lat]); features = map.queryRenderedFeatures([[p.x-350,p.y-350],[p.x+350,p.y+350]], { layers: ['cb-3d-buildings'] }) } catch { return null }
  }
  if (!features.length) return null
  const cosLat = Math.cos((lat * Math.PI) / 180)
  let best: OrientResult | null = null
  for (const f of features) {
    const g = f.geometry
    if (!g) continue
    const rings: number[][][] =
      g.type === 'Polygon' ? [(g as GeoJSON.Polygon).coordinates[0] as number[][]]
      : g.type === 'MultiPolygon' ? (g as GeoJSON.MultiPolygon).coordinates.map(p => p[0] as number[][]) : []
    for (const ring of rings) {
      if (ring.length < 4) continue
      const cLng = ring.reduce((s,c)=>s+c[0],0)/ring.length, cLat = ring.reduce((s,c)=>s+c[1],0)/ring.length
      if (Math.abs(cLng-lng) > 0.003 || Math.abs(cLat-lat) > 0.003) continue
      let bed = Infinity, bb = 0
      for (let i = 0; i < ring.length-1; i++) {
        const [ax,ay]=ring[i],[bx,by]=ring[i+1]
        const mx=((ax+bx)/2-lng)*111320*cosLat, my=((ay+by)/2-lat)*111320
        const d=Math.sqrt(mx*mx+my*my)
        if (d<1||d>80) continue
        const ex=(bx-ax)*111320*cosLat,ey=(by-ay)*111320,el=Math.sqrt(ex*ex+ey*ey)
        if (el<0.5) continue
        const n1x=ey/el,n1y=-ex/el,dot=n1x*(-mx)+n1y*(-my)
        const nx=dot>0?n1x:-n1x,ny=dot>0?n1y:-n1y
        const cb=((Math.atan2(-nx,-ny)*180/Math.PI)+360)%360
        if (d<bed){bed=d;bb=cb}
      }
      if (bed<Infinity && bed<(best?.distM??Infinity)) best={bearing:bb,distM:bed,feature:f}
    }
  }
  return best
}

function offsetCenter(lat: number, lng: number, bearingDeg: number, distM: number): [number, number] {
  const rad=bearingDeg*Math.PI/180, cosLat=Math.cos(lat*Math.PI/180)
  return [lng+(Math.sin(rad)*distM)/(111320*cosLat), lat+(Math.cos(rad)*distM)/111320]
}

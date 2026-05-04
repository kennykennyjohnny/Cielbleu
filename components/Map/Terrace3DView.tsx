'use client'

/**
 * Terrace3DView v5 — "Vous êtes dans la rue, face au bar."
 *
 * v5 :
 *  - Pitch 78° + zoom 20 = vue rue, on lève les yeux vers la façade
 *  - Fond de ciel CSS dynamique (bleu jour / orange coucher / nuit étoilée)
 *  - SunShadowBanner : grande bande lisible (éclairée = dorée, ombre = bleue nuit)
 *  - buildingColor : doré-vif si score élevé, foncé pour voisins → contraste fort
 *  - Terrasse : dorée si ensoleillée, bleu-acier si à l'ombre
 *  - SunDisc dans le ciel à la bonne position
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

const STREET_OFFSET_M = 32 // 32 m en rue = on voit toute la façade

interface NearestBuilding {
  bearing: number
  distM: number
  feature: mapboxgl.MapboxGeoJSONFeature
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Terrace3DView({ lat, lng, score, date }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<mapboxgl.Map | null>(null)
  const dateRef      = useRef<Date>(date ?? new Date())
  const scoreRef     = useRef<number>(score)
  const [bearing, setBearing]             = useState<number>(180)
  const [resolvedScore, setResolvedScore] = useState<number>(score)

  dateRef.current  = date ?? new Date()
  scoreRef.current = score

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [lng, lat],
      zoom: 19.6,
      pitch: 76,
      bearing: 180,
      scrollZoom: false, boxZoom: false, doubleClickZoom: false,
      dragRotate: false, keyboard: false,
      touchZoomRotate: false, touchPitch: false,
      attributionControl: false, fadeDuration: 0,
    })

    map.on('style.load', () => {
      styleMap(map)
      applySunLighting(map, lat, lng, dateRef.current, scoreRef.current)
      map.once('idle', () => triggerBearing(1))

      function triggerBearing(attempt: number) {
        const result = findNearestBuilding(map, lat, lng)
        if (result) {
          const [cLng, cLat] = offsetCenter(lat, lng, result.bearing, -STREET_OFFSET_M)
          map.jumpTo({ center: [cLng, cLat], bearing: result.bearing })
          setBearing(result.bearing)
          highlightBuilding(map, result.feature, scoreRef.current)
          addTerraceZone(map, lat, lng, result.bearing, scoreRef.current)
          setResolvedScore(scoreRef.current)
        } else if (attempt < 9) {
          // Retry: give the tile renderer more time on first attempts, then slow down
          setTimeout(() => triggerBearing(attempt + 1), attempt <= 3 ? 300 : 700)
        }
      }
    })

    const pinEl = buildPin()
    new mapboxgl.Marker({ element: pinEl, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map)

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [lat, lng]) // eslint-disable-line

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => applySunLighting(map, lat, lng, dateRef.current, scoreRef.current)
    if (map.isStyleLoaded()) apply()
    else map.once('style.load', apply)
  }, [date, score, lat, lng])

  const d        = date ?? new Date()
  const sun      = getSunPosition(d, lat, lng)
  const altDeg   = (sun.altitude * 180) / Math.PI
  const azDeg    = ((sun.azimuth  * 180) / Math.PI + 180) % 360
  const isDay    = altDeg > -3
  const relAngle = (((azDeg - bearing + 540) % 360) - 180)
  const isFrontLit = isDay && Math.abs(relAngle) < 90

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <SkyGradient altDeg={altDeg} isDay={isDay} />
      </div>
      <div ref={containerRef} className="absolute inset-0" style={{ zIndex: 1 }} />
      {!isDay && (
        <div className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 3, background: 'rgba(8,14,22,0.72)' }} />
      )}
      {isDay && <SunDisc altDeg={altDeg} relAngle={relAngle} score={resolvedScore} />}
      {/* Shadow indicator: compact pill top-left (not a full banner — keeps 3D visible) */}
      <ShadowPill isFrontLit={isFrontLit} isDay={isDay} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Overlay Components
// ─────────────────────────────────────────────────────────────────────────────

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
  const inFov   = Math.abs(relAngle) < 130
  const sunX    = 50 + (relAngle / 130) * 44
  const sunY    = Math.max(4, 38 - altDeg * 0.55)
  const isSunny = score >= 4
  const sunSize = isSunny ? 72 : 48
  const haloSz  = isSunny ? 180 : 110
  if (!inFov) return null
  return (
    <div className="absolute pointer-events-none"
      style={{
        left: `${sunX}%`, top: `${sunY}%`,
        transform: 'translate(-50%,-50%)',
        zIndex: 2,
        transition: 'left 800ms cubic-bezier(0.34,1.1,0.64,1), top 800ms ease',
      }}>
      {isSunny && (
        <div style={{
          position: 'absolute', width: haloSz + 40, height: haloSz + 40,
          top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
          borderRadius: '50%',
          background: `conic-gradient(
            transparent 0deg,rgba(255,220,40,0.22) 8deg,transparent 16deg,
            transparent 43deg,rgba(255,220,40,0.22) 51deg,transparent 59deg,
            transparent 88deg,rgba(255,220,40,0.22) 96deg,transparent 104deg,
            transparent 133deg,rgba(255,220,40,0.22) 141deg,transparent 149deg,
            transparent 178deg,rgba(255,220,40,0.22) 186deg,transparent 194deg,
            transparent 223deg,rgba(255,220,40,0.22) 231deg,transparent 239deg,
            transparent 268deg,rgba(255,220,40,0.22) 276deg,transparent 284deg,
            transparent 313deg,rgba(255,220,40,0.22) 321deg,transparent 329deg
          )`,
          animation: 'cb-sun-spin 22s linear infinite',
        }} />
      )}
      <div style={{
        position: 'absolute', width: haloSz, height: haloSz,
        top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        borderRadius: '50%',
        background: isSunny
          ? 'radial-gradient(circle,rgba(255,230,0,0.82) 0%,rgba(255,150,0,0.38) 40%,rgba(255,80,0,0.10) 65%,transparent 100%)'
          : 'radial-gradient(circle,rgba(255,220,80,0.55) 0%,rgba(255,200,60,0.18) 55%,transparent 100%)',
        filter: 'blur(3px)',
        animation: isSunny ? 'cb-sun-glow 3s ease-in-out infinite' : 'none',
      }} />
      <div style={{
        position: 'relative', width: sunSize, height: sunSize, borderRadius: '50%',
        background: isSunny
          ? 'radial-gradient(circle at 34% 30%,#FFFFF0 0%,#FFF060 18%,#FFC800 55%,#FF8000 100%)'
          : 'radial-gradient(circle at 34% 30%,#FFFEF0 0%,#FFF060 25%,#FFD840 60%,#FFC020 100%)',
        boxShadow: isSunny
          ? '0 0 18px 3px #FFD800,0 0 50px 10px rgba(255,150,0,0.90),0 0 90px 22px rgba(255,60,0,0.50)'
          : '0 0 12px 2px #FFE070,0 0 30px 5px rgba(255,200,60,0.65)',
      }} />
    </div>
  )
}

function ShadowPill({ isFrontLit, isDay }: { isFrontLit: boolean; isDay: boolean }) {
  if (!isDay) return (
    <div className="absolute top-3 left-3 z-10 pointer-events-none">
      <div className="rounded-full px-2.5 py-1.5 flex items-center gap-1.5"
        style={{ background:'rgba(8,14,22,0.82)', backdropFilter:'blur(12px)' }}>
        <span className="text-[13px]">🌙</span>
        <span className="font-outfit font-bold text-[11px]" style={{ color:'#8abbe0' }}>Nuit</span>
      </div>
    </div>
  )
  if (isFrontLit) return (
    <div className="absolute top-3 left-3 z-10 pointer-events-none">
      <div className="rounded-full px-2.5 py-1.5 flex items-center gap-1.5"
        style={{ background:'rgba(255,183,3,0.90)', backdropFilter:'blur(10px)',
          boxShadow:'0 4px 16px rgba(255,160,0,0.40)' }}>
        <span className="text-[13px]" style={{ animation:'pin-halo 2s ease-in-out infinite' }}>☀️</span>
        <span className="font-outfit font-black text-[11px]" style={{ color:'#0b1f3a' }}>Façade éclairée</span>
      </div>
    </div>
  )
  return (
    <div className="absolute top-3 left-3 z-10 pointer-events-none">
      <div className="rounded-full px-2.5 py-1.5 flex items-center gap-1.5"
        style={{ background:'rgba(20,40,70,0.82)', backdropFilter:'blur(12px)' }}>
        <span className="text-[13px]">🌑</span>
        <span className="font-outfit font-bold text-[11px]" style={{ color:'#8abbe0' }}>Façade à l&apos;ombre</span>
      </div>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────
// Marqueur
// ─────────────────────────────────────────────────────────────────────────────

// Simple gold dot pin — identifies which building is the bar without clutter
function buildPin(): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:default;pointer-events:none;'
  el.innerHTML = `
    <div style="
      width:14px;height:14px;border-radius:50%;
      background:#FFB703;
      border:3px solid rgba(255,255,255,0.96);
      box-shadow:0 0 0 3px rgba(255,183,3,0.38),0 3px 10px rgba(11,31,58,0.38);
    "></div>
    <div style="width:2px;height:12px;background:linear-gradient(to bottom,#FFB703,transparent);margin-top:-1px;"></div>
  `
  return el
}

// ─────────────────────────────────────────────────────────────────────────────
// Style Mapbox
// ─────────────────────────────────────────────────────────────────────────────

function styleMap(map: mapboxgl.Map) {
  const set = (id: string, prop: string, val: unknown) => {
    if (map.getLayer(id)) try { map.setPaintProperty(id, prop as never, val as never) } catch { /* noop */ }
  }
  // ── Google Maps-style warm stone palette ──────────────────────────────
  set('background','background-color','#EDE5D6')  // warm pavement
  set('water','fill-color','#A8C8DC')
  set('waterway','line-color','#A8C8DC')
  for (const r of ['road-primary','road-secondary-tertiary','road-street','road-minor','road-motorway','road-path','road-pedestrian'])
    set(r,'line-color','#F2E8D4')  // cream roads like Google Maps
  for (const g of ['landuse','park','national-park','pitch','grass'])
    set(g,'fill-color','#C4DCA0')  // muted green

  for (const l of map.getStyle().layers ?? []) {
    if (l.type === 'symbol' || l.id.includes('poi') || l.id.includes('label') || l.id.includes('transit'))
      try { map.setLayoutProperty(l.id,'visibility','none') } catch { /* noop */ }
  }

  if (!map.getLayer('cb-3d-buildings')) {
    const labelLayer = map.getStyle().layers?.find(
      l => l.type === 'symbol' && (l.layout as Record<string,unknown>)?.['text-field']
    )?.id
    map.addLayer({
      id: 'cb-3d-buildings', source: 'composite', 'source-layer': 'building',
      filter: ['==',['get','extrude'],'true'], type: 'fill-extrusion', minzoom: 14,
      paint: {
        // Light warm stone, graduated by height — like Haussmann limestone
        'fill-extrusion-color': [
          'interpolate',['linear'],['get','height'],
          0,'#E4DDD2',   // ground: warm limestone
          15,'#DDD5C8',  // lower floors
          30,'#D6CEBC',  // mid floors
          60,'#CEC6B2',  // upper floors
          90,'#C6BCA8',  // rooftop
        ],
        'fill-extrusion-height':  ['get','height'],
        'fill-extrusion-base':    ['get','min_height'],
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': true,   // crucial for realistic look
        'fill-extrusion-ambient-occlusion-intensity': 0.88,
        'fill-extrusion-ambient-occlusion-radius':    4.0,
      },
    }, labelLayer)
  }
  set('building','fill-color','#E0D8CA')
  set('building','fill-opacity',0.50)
  set('building-outline','line-color','#CABFB0')
  try {
    map.setFog({
      // Warm hazy atmosphere (not cold blue)
      color:'#E8E0D0','high-color':'#D0C0A8',
      'horizon-blend':0.04,'space-color':'#101828',range:[0.8,14],
    } as Parameters<typeof map.setFog>[0])
  } catch { /* old SDK */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Highlight bâtiment + zone terrasse
// ─────────────────────────────────────────────────────────────────────────────

function highlightBuilding(map: mapboxgl.Map, feature: mapboxgl.MapboxGeoJSONFeature, score: number) {
  if (!feature.geometry) return
  const height   = (feature.properties?.height     as number | null) ?? 20
  const minH     = (feature.properties?.min_height as number | null) ?? 0
  // Target building: warm gold if sunny, ivory if mid, same stone if dark — stays readable on light neighbors
  const hlColor   = score >= 4 ? '#FAEA90' : score >= 2 ? '#F4E8C0' : '#E0D8C4'
  const hlOpacity = score >= 4 ? 0.95 : 0.90
  const glowColor = score >= 4 ? '#D4A800' : '#A89860'
  const geoData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: feature.geometry as GeoJSON.Geometry, properties: {} }],
  }
  const existingSrc = map.getSource('cb-bar-bld') as mapboxgl.GeoJSONSource | undefined
  if (existingSrc) {
    existingSrc.setData(geoData)
    if (map.getLayer('cb-bar-bld-hl')) {
      map.setPaintProperty('cb-bar-bld-hl','fill-extrusion-color',hlColor)
      map.setPaintProperty('cb-bar-bld-hl','fill-extrusion-opacity',hlOpacity)
    }
    if (map.getLayer('cb-bar-glow')) map.setPaintProperty('cb-bar-glow','line-color',glowColor)
    return
  }
  map.addSource('cb-bar-bld',{type:'geojson',data:geoData})
  map.addLayer({
    id:'cb-bar-bld-hl', source:'cb-bar-bld', type:'fill-extrusion',
    paint: {
      'fill-extrusion-color':hlColor, 'fill-extrusion-height':height,
      'fill-extrusion-base':minH, 'fill-extrusion-opacity':hlOpacity,
      'fill-extrusion-vertical-gradient':false,
    },
  })
  map.addLayer({
    id:'cb-bar-glow', source:'cb-bar-bld', type:'line',
    paint:{'line-color':glowColor,'line-width':4,'line-blur':3,'line-opacity':0.90},
  })
}

function addTerraceZone(map: mapboxgl.Map, lat: number, lng: number, cameraBearing: number, score: number) {
  const W = 9, D = 4
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const rad    = (cameraBearing * Math.PI) / 180
  const fwdE = Math.sin(rad), fwdN = Math.cos(rad)
  const rgtE = Math.cos(rad), rgtN = -Math.sin(rad)
  const toLL = (dE: number, dN: number): [number,number] => [
    lng + dE / (111320 * cosLat), lat + dN / 111320,
  ]
  const corners: [number,number][] = [
    toLL( rgtE*W/2,               rgtN*W/2),
    toLL(-rgtE*W/2,              -rgtN*W/2),
    toLL(-fwdE*D - rgtE*W/2, -fwdN*D - rgtN*W/2),
    toLL(-fwdE*D + rgtE*W/2, -fwdN*D + rgtN*W/2),
    toLL( rgtE*W/2,               rgtN*W/2),
  ]
  const fillColor   = score >= 4 ? '#FFD860' : '#7AAAC8'
  const fillOpacity = score >= 4 ? 0.62 : 0.42
  const lineColor   = score >= 4 ? '#C08800' : '#3A6080'
  const geoData: GeoJSON.FeatureCollection = {
    type:'FeatureCollection',
    features:[{type:'Feature',geometry:{type:'Polygon',coordinates:[corners]},properties:{}}],
  }
  if (map.getSource('cb-terrace')) {
    ;(map.getSource('cb-terrace') as mapboxgl.GeoJSONSource).setData(geoData)
    return
  }
  map.addSource('cb-terrace',{type:'geojson',data:geoData})
  map.addLayer({id:'cb-terrace-fill',source:'cb-terrace',type:'fill',
    paint:{'fill-color':fillColor,'fill-opacity':fillOpacity}})
  map.addLayer({id:'cb-terrace-outline',source:'cb-terrace',type:'line',
    paint:{'line-color':lineColor,'line-width':2,'line-dasharray':[4,2.5]}})
}

// ─────────────────────────────────────────────────────────────────────────────
// Éclairage solaire
// ─────────────────────────────────────────────────────────────────────────────

function applySunLighting(map: mapboxgl.Map, lat: number, lng: number, date: Date, score: number) {
  const sun     = getSunPosition(date, lat, lng)
  const azNorth = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const altDeg  = (sun.altitude * 180) / Math.PI
  const isDay   = altDeg > -3
  const set = (id: string, prop: string, val: unknown) => {
    if (map.getLayer(id)) try { map.setPaintProperty(id, prop as never, val as never) } catch { /* noop */ }
  }
  if (isDay) {
    // More horizontal sun → stronger shadow contrast between building faces (like Google Maps)
    const polar = Math.min(80, Math.max(40, 90 - altDeg * 0.60))
    const color = altDeg < 6 ? '#F0B850' : score >= 4 ? '#FFFCE0' : '#FFF8F0'
    map.setLight({ anchor:'map', position:[1.5, azNorth, polar], color, intensity: 1.5 })
    set('background','background-color', altDeg > 8 ? '#EDE5D6' : '#D09060')
  } else {
    map.setLight({ anchor:'map', position:[1.5, 0, 88], color:'#304860', intensity: 0.04 })
    set('background','background-color','#0A1420')
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Géométrie
// ─────────────────────────────────────────────────────────────────────────────

function findNearestBuilding(map: mapboxgl.Map, lat: number, lng: number): NearestBuilding | null {
  let features: mapboxgl.MapboxGeoJSONFeature[] = []
  try {
    const pinPx = map.project([lng, lat])
    const pad   = 340  // wider query to find buildings even if bar is near edge of tile
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
    const rings: number[][][] = g.type === 'Polygon'
      ? [(g as GeoJSON.Polygon).coordinates[0] as number[][]]
      : g.type === 'MultiPolygon'
        ? (g as GeoJSON.MultiPolygon).coordinates.map(p => p[0] as number[][])
        : []

    for (const ring of rings) {
      if (ring.length < 4) continue
      let bestEdgeDist = Infinity
      let bestBearing  = 0

      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, ay] = ring[i]
        const [bx, by] = ring[i + 1]
        const mx  = ((ax + bx) / 2 - lng) * 111320 * cosLat
        const my  = ((ay + by) / 2 - lat) * 111320
        const d   = Math.sqrt(mx * mx + my * my)
        if (d < 1 || d > 55) continue
        const ex  = (bx - ax) * 111320 * cosLat
        const ey  = (by - ay) * 111320
        const el  = Math.sqrt(ex * ex + ey * ey)
        if (el < 0.5) continue
        const n1x = ey / el, n1y = -ex / el
        const dot = n1x * (-mx) + n1y * (-my)
        const nx  = dot > 0 ? n1x : -n1x
        const ny  = dot > 0 ? n1y : -n1y
        const cb  = ((Math.atan2(-nx, -ny) * 180 / Math.PI) + 360) % 360
        if (d < bestEdgeDist) { bestEdgeDist = d; bestBearing = cb }
      }
      if (bestEdgeDist < Infinity && bestEdgeDist < (best?.distM ?? Infinity))
        best = { bearing: bestBearing, distM: bestEdgeDist, feature: f }
    }
  }
  return best
}

function offsetCenter(lat: number, lng: number, bearingDeg: number, distM: number): [number, number] {
  const rad    = (bearingDeg * Math.PI) / 180
  const cosLat = Math.cos((lat * Math.PI) / 180)
  return [
    lng + (Math.sin(rad) * distM) / (111320 * cosLat),
    lat + (Math.cos(rad) * distM) / 111320,
  ]
}
'use client'

/**
 * MapView v3 - GeoJSON source + Mapbox GL native layers (cluster).
 * Gère des milliers de lieux sans jank DOM.
 * Pins colorés par score (0-5), regroupés en clusters au dézoom.
 */

import { useEffect, useRef, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import mapboxgl from 'mapbox-gl'
import type { Place } from '@/types'

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
function applyStyle(map: mapboxgl.Map) {
  const set = (id: string, prop: string, val: unknown) => {
    if (map.getLayer(id)) try { map.setPaintProperty(id, prop as never, val as never) } catch { /* noop */ }
  }
  // Carte papier-crème CielBleu : fond chaud, eau bleu ciel, bâtiments calcaire
  set('background', 'background-color', '#fffcf3')          // paper
  set('water',      'fill-color',       '#c7e8ff')          // sky-200
  set('waterway',   'line-color',       '#8fd3ff')          // sky-300
  set('building',   'fill-color',       '#e9e1d4')          // limestone
  set('building',   'fill-opacity',     0.72)
  set('building-outline', 'line-color', '#d8d2c8')
  for (const id of ['landuse', 'national-park', 'park', 'pitch']) set(id, 'fill-color', '#e6efd9')
  for (const id of ['road-primary', 'road-secondary-tertiary', 'road-street', 'road-trunk', 'road-motorway']) {
    set(id, 'line-color', '#ffffff')
  }
  set('road-minor', 'line-color', '#fff8ea')

  // Masque POI et labels parasites
  for (const l of map.getStyle().layers ?? []) {
    if (l.id.includes('poi') || l.id.includes('transit-label') || l.id.startsWith('road-label') || l.id.startsWith('road-number')) {
      try { map.setLayoutProperty(l.id, 'visibility', 'none') } catch { /* noop */ }
    }
  }
  set('settlement-major-label', 'text-color',      '#0b1f3a')
  set('settlement-minor-label', 'text-color',      '#6f7a8a')
  set('settlement-major-label', 'text-halo-color', '#fffcf3')
  set('settlement-minor-label', 'text-halo-color', '#fffcf3')
}

// ── Composant ──────────────────────────────────────────────────────────────

interface Props {
  places: Place[]
  onPlaceSelect: (place: Place | null) => void
}

interface AmeniteInfo {
  type: 'fontaine' | 'sanisette'
  props: Record<string, unknown>
}

export default function MapView({ places, onPlaceSelect }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<mapboxgl.Map | null>(null)
  const placesRef     = useRef<Place[]>(places)
  const onSelectRef   = useRef(onPlaceSelect)
  placesRef.current   = places
  onSelectRef.current = onPlaceSelect

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

  // ── Init carte (une fois) ──────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: PARIS_CENTER,
      zoom: 12.4,
      minZoom: 11,
      maxZoom: 19,
      attributionControl: false,
      pitch: 0,
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

      // Source GeoJSON avec clustering natif Mapbox
      map.addSource('places', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
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

      // ── Fontaines à boire (points bleus, zoom ≥ 14) ─────────────────────
      map.addSource('fontaines', { type: 'geojson', data: '/api/geo/fontaines' })
      map.addLayer({
        id: 'fontaines-layer', type: 'circle', source: 'fontaines',
        filter: ['==', ['get', 'dispo'], 'OUI'],
        minzoom: 13,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 16, 4.5],
          'circle-color': '#3A86FF',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.70],
        },
      })

      // ── Sanisettes (points verts, zoom ≥ 14) ────────────────────────────
      map.addSource('sanisettes', { type: 'geojson', data: '/api/geo/sanisettes' })
      map.addLayer({
        id: 'sanisettes-layer', type: 'circle', source: 'sanisettes',
        filter: ['==', ['get', 'statut'], 'En service'],
        minzoom: 13,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 16, 4.5],
          'circle-color': '#52B788',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.62],
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
        if (f) setAmenite({ type: 'fontaine', props: f.properties ?? {} })
      })
      map.on('click', 'sanisettes-layer', (e) => {
        e.originalEvent.stopPropagation()
        const f = e.features?.[0]
        if (f) setAmenite({ type: 'sanisette', props: f.properties ?? {} })
      })

      // Labels EAU / WC au zoom 16+
      map.addLayer({
        id: 'fontaines-label', type: 'symbol', source: 'fontaines',
        filter: ['==', ['get', 'dispo'], 'OUI'], minzoom: 16,
        layout: { 'text-field': 'EAU', 'text-size': 8,
          'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-allow-overlap': false },
        paint: { 'text-color': '#3A86FF',
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 15.5, 0, 16.5, 0.8] as mapboxgl.Expression,
          'text-halo-color': '#ffffff', 'text-halo-width': 1 },
      })
      map.addLayer({
        id: 'sanisettes-label', type: 'symbol', source: 'sanisettes',
        filter: ['==', ['get', 'statut'], 'En service'], minzoom: 16,
        layout: { 'text-field': 'WC', 'text-size': 8,
          'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-allow-overlap': false },
        paint: { 'text-color': '#52B788',
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 15.5, 0, 16.5, 0.8] as mapboxgl.Expression,
          'text-halo-color': '#ffffff', 'text-halo-width': 1 },
      })
    })

    // Clic fond → déselection
    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ['places-pins', 'clusters', 'fontaines-layer', 'sanisettes-layer'],
      })
      if (!hits.length) { onSelectRef.current(null); setAmenite(null) }
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, []) // eslint-disable-line

  // ── Mise à jour GeoJSON quand les places changent ─────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => {
      (map.getSource('places') as mapboxgl.GeoJSONSource | undefined)?.setData(geojson)
    }
    if (map.isStyleLoaded()) update()
    else map.once('style.load', update)
  }, [geojson])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="absolute inset-0" />
      {amenite && <FicheAmenite amenite={amenite} onClose={() => setAmenite(null)} />}
    </div>
  )
}

// ─── FicheAmenite ─────────────────────────────────────────────────────────────

function FicheAmenite({ amenite, onClose }: { amenite: AmeniteInfo; onClose: () => void }) {
  const p          = amenite.props
  const isFontaine = amenite.type === 'fontaine'
  const status     = isFontaine
    ? (p.dispo === 'OUI' ? 'Disponible' : 'Indisponible')
    : (String(p.statut ?? '') === 'En service' ? 'En service' : 'Hors service')
  const statusOk = status === 'Disponible' || status === 'En service'
  const potable  = isFontaine && p.potable ? (String(p.potable) === 'OUI' ? 'Eau potable' : null) : null
  const pmr      = !isFontaine && p.acces_pmr ? (String(p.acces_pmr).toLowerCase() === 'oui' ? 'Accessible PMR' : null) : null
  const horaire  = !isFontaine && p.horaire_ouverture ? String(p.horaire_ouverture) : null
  const model    = isFontaine && p.modele ? String(p.modele) : null

  return (
    <div className="absolute bottom-4 left-4 z-20 pointer-events-auto" style={{ maxWidth: 320 }}>
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,253,247,0.97)', backdropFilter: 'blur(20px)',
          boxShadow: '0 8px 32px rgba(11,31,58,0.18), 0 2px 8px rgba(11,31,58,0.10)' }}>
        <div className="px-4 pt-4 pb-3 flex items-center gap-3"
          style={{ borderBottom: '1px solid rgba(11,31,58,0.08)' }}>
          <span className="text-2xl">{isFontaine ? '💧' : '🚻'}</span>
          <div className="flex-1 min-w-0">
            <p className="font-playfair text-[15px] font-bold" style={{ color: '#0b1f3a' }}>
              {isFontaine ? 'Fontaine à boire' : 'Sanisette'}
            </p>
          </div>
          <button onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[13px]"
            style={{ background: 'rgba(11,31,58,0.08)', color: '#1B2838' }}
            aria-label="Fermer">✕</button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          <Chip color={statusOk ? '#3D9A70' : '#E05252'}>{status}</Chip>
          {potable && <Chip color="#3A86FF">💧 {potable}</Chip>}
          {pmr     && <Chip color="#7B61FF">♿ {pmr}</Chip>}
          {horaire && <Chip color="#F77F00">🕐 {horaire}</Chip>}
          {model   && <Chip color="#8D99AE">{model}</Chip>}
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
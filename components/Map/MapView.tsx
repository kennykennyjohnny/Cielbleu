'use client'

/**
 * MapView v3 - GeoJSON source + Mapbox GL native layers (cluster).
 * Gère des milliers de lieux sans jank DOM.
 * Pins colorés par score (0-5), regroupés en clusters au dézoom.
 */

import { useEffect, useRef, useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Place } from '@/types'

const PARIS_CENTER: [number, number] = [2.3522, 48.8566]

// Couleurs fill/light par score (0=nuit, 5=plein soleil)
const PIN_FILL  = ['#253448', '#8E9EB0', '#C8A030', '#FFBE0B', '#FF9500', '#FF6A00']
const PIN_LIGHT = ['#4A6080', '#BCC8D8', '#F0D060', '#FFEE90', '#FFD060', '#FFA050']

// ── Génère une image de pin (30×44px) pour un score donné ─────────────────
function drawPinImage(score: number): { width: number; height: number; data: Uint8Array } {
  const W = 30, H = 44
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!
  const CX = W / 2, CY = 13, CR = 11

  const fill  = PIN_FILL [score] ?? PIN_FILL [3]
  const light = PIN_LIGHT[score] ?? PIN_LIGHT[3]

  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.52)'
  ctx.shadowBlur = 8; ctx.shadowOffsetX = 0.5; ctx.shadowOffsetY = 4

  // Disque avec dégradé radial
  const g = ctx.createRadialGradient(CX - 3, CY - 3, 1.5, CX, CY, CR + 1)
  g.addColorStop(0, light); g.addColorStop(0.75, fill); g.addColorStop(1, fill)
  ctx.beginPath(); ctx.arc(CX, CY, CR, 0, Math.PI * 2)
  ctx.fillStyle = g; ctx.fill()

  // Pointer triangulaire
  ctx.beginPath()
  ctx.moveTo(CX - 5, CY + CR - 3)
  ctx.lineTo(CX,     H - 4)
  ctx.lineTo(CX + 5, CY + CR - 3)
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill()
  ctx.restore()

  // Anneau blanc
  ctx.beginPath(); ctx.arc(CX, CY, CR, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,253,247,0.95)'; ctx.lineWidth = 2.0; ctx.stroke()

  return { width: W, height: H, data: new Uint8Array(ctx.getImageData(0, 0, W, H).data.buffer) }
}

// ── Style CielBleu ─────────────────────────────────────────────────────────
function applyStyle(map: mapboxgl.Map) {
  const set = (id: string, prop: string, val: unknown) => {
    if (map.getLayer(id)) try { map.setPaintProperty(id, prop as never, val as never) } catch { /* noop */ }
  }
  set('background', 'background-color', '#FFFDF7')
  set('water',      'fill-color',       '#BFDBFE')
  set('waterway',   'line-color',       '#BFDBFE')
  set('building',   'fill-color',       '#F0EAD8')
  set('building',   'fill-opacity',     0.85)
  set('building-outline', 'line-color', '#E2D9C0')
  for (const id of ['landuse', 'national-park', 'park', 'pitch']) set(id, 'fill-color', '#DDEBC8')
  for (const id of ['road-primary', 'road-secondary-tertiary', 'road-street', 'road-trunk', 'road-motorway']) {
    set(id, 'line-color', '#FFFFFF')
  }
  set('road-minor', 'line-color', '#FAF7EE')

  // Masque POI et labels parasites
  for (const l of map.getStyle().layers ?? []) {
    if (l.id.includes('poi') || l.id.includes('transit-label') || l.id.startsWith('road-label') || l.id.startsWith('road-number')) {
      try { map.setLayoutProperty(l.id, 'visibility', 'none') } catch { /* noop */ }
    }
  }
  set('settlement-major-label', 'text-color',      '#1B2838')
  set('settlement-minor-label', 'text-color',      '#5A6B82')
  set('settlement-major-label', 'text-halo-color', '#FFFDF7')
  set('settlement-minor-label', 'text-halo-color', '#FFFDF7')
}

// ── Composant ──────────────────────────────────────────────────────────────

interface Props {
  places: Place[]
  onPlaceSelect: (place: Place | null) => void
}

export default function MapView({ places, onPlaceSelect }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const mapRef        = useRef<mapboxgl.Map | null>(null)
  const placesRef     = useRef<Place[]>(places)
  const onSelectRef   = useRef(onPlaceSelect)
  placesRef.current   = places
  onSelectRef.current = onPlaceSelect

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
          'circle-radius': ['step', ['get', 'point_count'], 22, 30, 28, 200, 35],
          'circle-color': 'rgba(0,0,0,0.13)',
          'circle-translate': [2, 4],
        },
      })

      // Clusters colorés
      map.addLayer({
        id: 'clusters', type: 'circle', source: 'places',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': ['step', ['get', 'point_count'], '#FFBE0B', 30, '#FF9500', 200, '#FF6B6B'],
          'circle-radius': ['step', ['get', 'point_count'], 20, 30, 26, 200, 33],
          'circle-stroke-width': 3.5,
          'circle-stroke-color': '#FFFDF7',
          'circle-opacity': 0.95,
        },
      })

      // Compteur de cluster
      map.addLayer({
        id: 'cluster-count', type: 'symbol', source: 'places',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 12,
          'text-font': ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
        },
        paint: { 'text-color': '#1B2838' },
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
    })

    // Clic fond → déselection
    map.on('click', (e) => {
      const hits = map.queryRenderedFeatures(e.point, { layers: ['places-pins', 'clusters'] })
      if (!hits.length) onSelectRef.current(null)
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

  return <div ref={containerRef} className="w-full h-full" />
}
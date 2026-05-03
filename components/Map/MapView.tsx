'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { createSunPinElement } from './SunPin'
import type { Place } from '@/types'

const PARIS_CENTER: [number, number] = [2.3522, 48.8566]
const DEFAULT_ZOOM = 12.4
const MIN_ZOOM = 11
const MAX_ZOOM = 19

function applyCielBleuStyle(map: mapboxgl.Map) {
  const setIfExists = (
    layerId: string,
    prop: string,
    value: string | number | unknown[]
  ) => {
    if (map.getLayer(layerId)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        map.setPaintProperty(layerId, prop as any, value as any)
      } catch {
        // ignore
      }
    }
  }

  setIfExists('background', 'background-color', '#FFFDF7')
  setIfExists('land', 'background-color', '#FFFDF7')
  setIfExists('water', 'fill-color', '#BFDBFE')
  setIfExists('waterway', 'line-color', '#BFDBFE')
  setIfExists('building', 'fill-color', '#F0EAD8')
  setIfExists('building', 'fill-opacity', 0.85)
  setIfExists('building-outline', 'line-color', '#E2D9C0')
  setIfExists('landuse', 'fill-color', '#DDEBC8')
  setIfExists('national-park', 'fill-color', '#DDEBC8')
  setIfExists('park', 'fill-color', '#DDEBC8')
  setIfExists('pitch', 'fill-color', '#DDEBC8')

  // Routes blanches (atténuées)
  for (const id of [
    'road-primary', 'road-secondary-tertiary', 'road-street',
    'road-trunk', 'road-motorway',
  ]) setIfExists(id, 'line-color', '#FFFFFF')
  setIfExists('road-minor', 'line-color', '#FAF7EE')

  // Cacher POI / labels parasites
  const layers = map.getStyle().layers ?? []
  for (const layer of layers) {
    const id = layer.id
    if (
      id.includes('poi') ||
      id.includes('transit-label') ||
      id.includes('airport-label') ||
      id.startsWith('road-label') ||
      id.startsWith('road-number')
    ) {
      try { map.setLayoutProperty(id, 'visibility', 'none') } catch {}
    }
  }

  setIfExists('settlement-major-label', 'text-color', '#1B2838')
  setIfExists('settlement-minor-label', 'text-color', '#5A6B82')
  setIfExists('settlement-subdivision-label', 'text-color', '#5A6B82')
  setIfExists('settlement-major-label', 'text-halo-color', '#FFFDF7')
  setIfExists('settlement-minor-label', 'text-halo-color', '#FFFDF7')

  // Bâtiments 3D — visible uniquement quand on tilt (pitch > 20)
  if (!map.getLayer('cb-3d-buildings')) {
    const labelLayerId = layers.find(
      (l) => l.type === 'symbol' && (l.layout as { 'text-field'?: unknown })?.['text-field']
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
            0, '#EFE6CF',
            25, '#E0D4B0',
            60, '#C8B888',
            120, '#A89770',
          ],
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-vertical-gradient': true,
        },
      },
      labelLayerId
    )
  }
}

interface MapViewProps {
  places: Place[]
  onPlaceSelect: (place: Place | null) => void
}

export default function MapView({ places, onPlaceSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const onPlaceSelectRef = useRef(onPlaceSelect)
  onPlaceSelectRef.current = onPlaceSelect

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: PARIS_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      pitch: 0,
      maxBounds: [[2.10, 48.74], [2.55, 49.00]],
    })

    map.on('style.load', () => applyCielBleuStyle(map))
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')
    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'bottom-right'
    )

    map.on('click', () => onPlaceSelectRef.current(null))
    mapRef.current = map

    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentIds = new Set(markersRef.current.keys())
    const newIds = new Set(places.map((p) => p.id))

    currentIds.forEach((id) => {
      if (!newIds.has(id)) {
        markersRef.current.get(id)?.remove()
        markersRef.current.delete(id)
      }
    })

    places.forEach((place) => {
      if (markersRef.current.has(place.id)) return
      const el = createSunPinElement(place.currentScore ?? 3, () =>
        onPlaceSelectRef.current(place)
      )
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([place.lng, place.lat])
        .addTo(map)
      markersRef.current.set(place.id, marker)
    })
  }, [places])

  return <div ref={containerRef} className="w-full h-full" />
}

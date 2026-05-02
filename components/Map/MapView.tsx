'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { createSunPinElement } from './SunPin'
import type { Place } from '@/types'

const PARIS_CENTER: [number, number] = [2.3522, 48.8566]
const DEFAULT_ZOOM = 12.6
const MIN_ZOOM = 11
const MAX_ZOOM = 18.5

// Surcharge couleurs Mapbox light-v11 → palette CielBleu
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
        // ignore — propriété pas applicable à ce type de layer
      }
    }
  }

  // Fond + terre
  setIfExists('background', 'background-color', '#FFFDF7')
  setIfExists('land', 'background-color', '#FFFDF7')

  // Eau (Seine + canaux + bassins)
  setIfExists('water', 'fill-color', '#BFDBFE')
  setIfExists('waterway', 'line-color', '#BFDBFE')

  // Bâtiments
  setIfExists('building', 'fill-color', '#F0EAD8')
  setIfExists('building', 'fill-opacity', 0.85)
  setIfExists('building-outline', 'line-color', '#E2D9C0')

  // Espaces verts
  setIfExists('landuse', 'fill-color', '#DDEBC8')
  setIfExists('national-park', 'fill-color', '#DDEBC8')
  setIfExists('park', 'fill-color', '#DDEBC8')
  setIfExists('pitch', 'fill-color', '#DDEBC8')

  // Routes — atténuées pour laisser place aux pins
  setIfExists('road-primary', 'line-color', '#FFFFFF')
  setIfExists('road-secondary-tertiary', 'line-color', '#FFFFFF')
  setIfExists('road-street', 'line-color', '#FFFFFF')
  setIfExists('road-minor', 'line-color', '#FAF7EE')
  setIfExists('road-trunk', 'line-color', '#FFFFFF')
  setIfExists('road-motorway', 'line-color', '#FFFFFF')

  // Cacher tous les POI / labels parasites Mapbox (on a nos pins)
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
      try {
        map.setLayoutProperty(id, 'visibility', 'none')
      } catch {
        // ignore
      }
    }
  }

  // Labels de quartiers / arrondissements : typo + couleur
  setIfExists('settlement-major-label', 'text-color', '#1B2838')
  setIfExists('settlement-minor-label', 'text-color', '#5A6B82')
  setIfExists('settlement-subdivision-label', 'text-color', '#5A6B82')
  setIfExists('settlement-major-label', 'text-halo-color', '#FFFDF7')
  setIfExists('settlement-minor-label', 'text-halo-color', '#FFFDF7')
}

interface MapViewProps {
  places: Place[]
  selectedPlace: Place | null
  onPlaceSelect: (place: Place | null) => void
}

export default function MapView({ places, selectedPlace, onPlaceSelect }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const onPlaceSelectRef = useRef(onPlaceSelect)
  onPlaceSelectRef.current = onPlaceSelect

  // Initialisation de la carte
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
      maxBounds: [
        [2.10, 48.74], // SW
        [2.55, 49.00], // NE
      ],
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

  // Mise à jour des markers quand les lieux changent
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

  // Centrer sur le lieu sélectionné
  useEffect(() => {
    if (!selectedPlace || !mapRef.current) return

    mapRef.current.easeTo({
      center: [selectedPlace.lng, selectedPlace.lat],
      zoom: Math.max(mapRef.current.getZoom(), 15),
      duration: 500,
      offset: [0, -140],
    })
  }, [selectedPlace])

  return <div ref={containerRef} className="w-full h-full" />
}

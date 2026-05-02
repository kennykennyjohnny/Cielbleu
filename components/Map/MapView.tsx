'use client'

import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { createSunPinElement } from './SunPin'
import type { Place } from '@/types'

const PARIS_CENTER: [number, number] = [2.3522, 48.8566]
const DEFAULT_ZOOM = 13.5

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
      attributionControl: false,
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    map.addControl(
      new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      'bottom-right'
    )

    // Clic fond carte → désélectionner
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

    // Supprimer les markers absents du nouveau set
    currentIds.forEach((id) => {
      if (!newIds.has(id)) {
        markersRef.current.get(id)?.remove()
        markersRef.current.delete(id)
      }
    })

    // Ajouter les nouveaux markers
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
      duration: 400,
      offset: [0, -120], // décaler vers le haut pour laisser place à la preview
    })
  }, [selectedPlace])

  return <div ref={containerRef} className="w-full h-full" />
}

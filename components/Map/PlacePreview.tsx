'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Place } from '@/types'

const SCORE_LABEL: Record<number, string> = {
  0: 'Nuit',
  1: 'Ombre totale',
  2: 'Surtout à l\'ombre',
  3: 'Mi-soleil',
  4: 'Bien ensoleillé',
  5: 'Plein soleil ☀',
}

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
  cafe: 'Café',
  park: 'Parc',
}

interface PlacePreviewProps {
  place: Place
  onClose: () => void
}

export default function PlacePreview({ place, onClose }: PlacePreviewProps) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Déclencher l'animation slide-up
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [place.id])

  const score = place.currentScore ?? 3
  const suns = Array.from({ length: 5 }, (_, i) => (i < score ? '☀' : '○')).join('')
  const isSunny = score >= 4
  const photo = place.photos?.[0]

  return (
    <>
      {/* Zone cliquable pour fermer */}
      <div className="absolute inset-0 z-30" onClick={onClose} />

      {/* Card */}
      <div
        className={[
          'absolute bottom-0 left-0 right-0 z-40',
          'transition-transform duration-300 ease-out',
          visible ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        <div className="mx-3 mb-4 rounded-3xl bg-white shadow-2xl overflow-hidden">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-0">
            <div className="w-10 h-1 rounded-full bg-gray-200" />
          </div>

          {/* Photo hero */}
          {photo && (
            <div className="mx-4 mt-3 h-36 rounded-2xl overflow-hidden bg-gray-100">
              <img
                src={photo}
                alt={place.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Contenu */}
          <div className="px-4 pt-3 pb-4">
            {/* Nom + badge type */}
            <div className="flex items-start justify-between gap-2 mb-1">
              <h2 className="font-outfit font-semibold text-lg text-nuit leading-snug flex-1">
                {place.name}
              </h2>
              <span className="shrink-0 mt-0.5 rounded-full bg-creme px-2.5 py-0.5 text-xs font-outfit font-medium text-gris border border-gray-100">
                {TYPE_LABEL[place.type] ?? place.type}
              </span>
            </div>

            {/* Adresse */}
            <p className="text-sm text-gris font-outfit mb-3 leading-snug">{place.address}</p>

            {/* Score soleil */}
            <div className="flex items-center gap-2 mb-4">
              <span
                className="text-base tracking-wider"
                style={{ color: isSunny ? '#FFBE0B' : '#8D99AE' }}
              >
                {suns}
              </span>
              <span
                className="text-sm font-outfit font-semibold"
                style={{ color: isSunny ? '#FFBE0B' : '#8D99AE' }}
              >
                {SCORE_LABEL[score] ?? ''}
              </span>
            </div>

            {/* Boutons */}
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/place/${place.id}`)}
                className="flex-1 rounded-2xl bg-soleil py-3 text-sm font-outfit font-semibold text-nuit active:scale-95 transition-transform"
              >
                Voir la terrasse
              </button>
              {place.google_maps_url && (
                <a
                  href={place.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center rounded-2xl bg-creme px-5 py-3 text-sm font-outfit font-semibold text-ciel border border-gray-100 active:scale-95 transition-transform"
                >
                  Y aller
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

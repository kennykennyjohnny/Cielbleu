'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Navigation, X } from 'lucide-react'
import type { Place } from '@/types'

const SCORE_LABEL: Record<number, string> = {
  0: 'Tombée de la nuit',
  1: 'À l’ombre',
  2: 'Surtout à l’ombre',
  3: 'Mi-soleil mi-ombre',
  4: 'Bien ensoleillé',
  5: 'Plein soleil',
}

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
  cafe: 'Café',
  park: 'Parc',
}

const SCORE_COLOR: Record<number, { bg: string; text: string; ring: string }> = {
  0: { bg: 'bg-nuit', text: 'text-creme', ring: 'ring-nuit/20' },
  1: { bg: 'bg-gris/20', text: 'text-gris', ring: 'ring-gris/20' },
  2: { bg: 'bg-gris/20', text: 'text-gris', ring: 'ring-gris/20' },
  3: { bg: 'bg-soleil/20', text: 'text-[#B57500]', ring: 'ring-soleil/30' },
  4: { bg: 'bg-soleil/30', text: 'text-[#B57500]', ring: 'ring-soleil/40' },
  5: { bg: 'bg-soleil', text: 'text-nuit', ring: 'ring-soleil/60' },
}

interface PlacePreviewProps {
  place: Place
  onClose: () => void
}

export default function PlacePreview({ place, onClose }: PlacePreviewProps) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [place.id])

  const score = place.currentScore ?? 3
  const palette = SCORE_COLOR[score] ?? SCORE_COLOR[3]
  const photo = place.photos?.[0]
  const rating = place.google_rating
  const priceLevel = place.price_level

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          'absolute inset-0 z-30 transition-opacity duration-300',
          visible ? 'bg-nuit/10 backdrop-blur-[1px]' : 'bg-nuit/0',
        ].join(' ')}
        onClick={onClose}
      />

      {/* Card */}
      <div
        className={[
          'absolute bottom-0 left-0 right-0 z-40 px-3 pb-4',
          'transition-transform duration-[420ms]',
          visible ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        <div className="relative mx-auto max-w-md rounded-[28px] bg-white shadow-[0_-12px_40px_rgba(27,40,56,0.18)] overflow-hidden">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1.5">
            <div className="w-10 h-1 rounded-full bg-nuit/15" />
          </div>

          {/* Bouton fermer */}
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="absolute top-4 right-4 z-10 rounded-full bg-white/90 backdrop-blur w-8 h-8 flex items-center justify-center shadow-md text-nuit/70 active:scale-90 transition-transform"
          >
            <X size={16} strokeWidth={2.4} />
          </button>

          {/* Hero — photo OU illustration soleil */}
          <div className="mx-4 mt-2 h-40 rounded-2xl overflow-hidden relative">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt={place.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <SunIllustration score={score} />
            )}

            {/* Badge type en haut-gauche */}
            <span className="absolute top-3 left-3 rounded-full bg-white/95 backdrop-blur px-3 py-1 text-[11px] font-outfit font-semibold text-nuit shadow-sm uppercase tracking-wider">
              {TYPE_LABEL[place.type] ?? place.type}
            </span>
          </div>

          {/* Contenu */}
          <div className="px-5 pt-4 pb-5">
            {/* Nom */}
            <h2 className="font-playfair text-2xl font-bold text-nuit leading-tight mb-1">
              {place.name}
            </h2>
            <p className="text-sm text-gris font-outfit leading-snug mb-3">
              {place.address}
            </p>

            {/* Rating + price + score row */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {rating !== undefined && rating !== null && (
                <span className="flex items-center gap-1 text-sm font-outfit font-medium text-nuit">
                  <Star size={14} fill="#FFBE0B" stroke="#FFBE0B" />
                  {rating.toFixed(1)}
                </span>
              )}
              {priceLevel !== undefined && priceLevel !== null && priceLevel > 0 && (
                <span className="text-sm font-outfit font-medium text-gris">
                  {'€'.repeat(priceLevel)}
                  <span className="text-nuit/15">{'€'.repeat(4 - priceLevel)}</span>
                </span>
              )}
              {place.arrondissement !== undefined && place.arrondissement !== null && (
                <span className="text-sm font-outfit text-gris">
                  · {place.arrondissement}
                  <sup>{place.arrondissement === 1 ? 'er' : 'e'}</sup>
                </span>
              )}
            </div>

            {/* Score block — la pièce maitresse */}
            <div
              className={`rounded-2xl ${palette.bg} px-4 py-3.5 mb-4 ring-1 ${palette.ring} flex items-center gap-3`}
            >
              <div className={`text-3xl font-playfair font-bold leading-none ${palette.text}`}>
                {score}
                <span className="text-base font-outfit font-medium opacity-60">/5</span>
              </div>
              <div className="flex-1">
                <p className={`text-[11px] uppercase tracking-widest font-outfit font-semibold ${palette.text} opacity-80`}>
                  Maintenant
                </p>
                <p className={`text-sm font-outfit font-semibold ${palette.text} leading-tight`}>
                  {SCORE_LABEL[score]}
                </p>
              </div>
              {/* Mini barres ☀ */}
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={`w-1.5 rounded-full transition-all ${
                      i <= score ? `${palette.text} opacity-90` : 'opacity-20'
                    }`}
                    style={{
                      height: `${10 + i * 2}px`,
                      backgroundColor: i <= score ? 'currentColor' : '#1B2838',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/place/${place.id}`)}
                className="flex-1 rounded-2xl bg-nuit py-3.5 text-sm font-outfit font-semibold text-creme active:scale-[0.97] transition-transform shadow-md"
              >
                Voir la terrasse
              </button>
              {place.google_maps_url && (
                <a
                  href={place.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-creme px-5 py-3.5 text-sm font-outfit font-semibold text-nuit border border-nuit/8 active:scale-[0.97] transition-transform"
                >
                  <Navigation size={15} strokeWidth={2.2} />
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

// Illustration vectorielle quand pas de photo : ciel + soleil + silhouette ville
function SunIllustration({ score }: { score: number }) {
  const sunBright = score >= 4
  const isNight = score === 0

  if (isNight) {
    return (
      <div className="w-full h-full bg-gradient-to-b from-[#1B2838] via-[#2C3E54] to-[#3A4A5C] relative overflow-hidden">
        {/* étoiles */}
        {[18, 35, 60, 75, 90].map((x, i) => (
          <span
            key={i}
            className="absolute text-creme text-xs"
            style={{ left: `${x}%`, top: `${15 + (i % 3) * 12}%`, opacity: 0.7 }}
          >
            ✦
          </span>
        ))}
        {/* lune */}
        <div className="absolute top-6 right-8 w-12 h-12 rounded-full bg-creme shadow-[0_0_24px_rgba(255,253,247,0.4)]" />
        {/* skyline */}
        <CitySilhouette tone="dark" />
      </div>
    )
  }

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{
        background: sunBright
          ? 'linear-gradient(180deg, #FFE48A 0%, #FFD976 35%, #FFE9C8 70%, #FFFDF7 100%)'
          : 'linear-gradient(180deg, #C8DDFF 0%, #E2EBFA 50%, #FFFDF7 100%)',
      }}
    >
      {/* Soleil */}
      <div
        className="absolute top-5 right-8 w-14 h-14 rounded-full"
        style={{
          background: sunBright
            ? 'radial-gradient(circle, #FFBE0B 0%, #FF9500 80%)'
            : 'radial-gradient(circle, #FFFDF7 0%, #E2E5EB 90%)',
          boxShadow: sunBright
            ? '0 0 36px rgba(255,190,11,0.7), 0 0 80px rgba(255,149,0,0.4)'
            : '0 0 20px rgba(255,253,247,0.6)',
        }}
      />
      {/* Petit nuage si score 2-3 */}
      {(score === 2 || score === 3) && (
        <div className="absolute top-10 left-10 flex">
          <div className="w-10 h-5 rounded-full bg-white/85" />
          <div className="w-7 h-7 rounded-full bg-white/85 -ml-3 -mt-2" />
        </div>
      )}
      {/* skyline */}
      <CitySilhouette tone="light" />
    </div>
  )
}

function CitySilhouette({ tone }: { tone: 'light' | 'dark' }) {
  const fill = tone === 'dark' ? '#0F1620' : '#E8DFC8'
  return (
    <svg
      viewBox="0 0 400 80"
      className="absolute bottom-0 left-0 right-0 w-full"
      preserveAspectRatio="none"
      style={{ height: '38%' }}
    >
      <path
        d={`M0 80 L0 50 L20 50 L20 35 L40 35 L40 55 L60 55 L60 25 L75 25 L78 18 L82 18 L85 25 L100 25 L100 50 L130 50
            L130 30 L150 30 L150 22 L160 22 L160 30 L180 30 L180 45 L210 45 L210 25 L230 25
            L230 12 L240 12 L243 6 L247 6 L250 12 L260 12 L260 35 L290 35 L290 50 L320 50
            L320 28 L345 28 L345 40 L370 40 L370 50 L400 50 L400 80 Z`}
        fill={fill}
      />
    </svg>
  )
}

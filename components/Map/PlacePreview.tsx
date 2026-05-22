'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Star, Navigation, X, ChevronUp, Sunrise, Sunset, Share2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Place } from '@/types'

// 3D map = client only, dynamic
const Terrace3DView = dynamic(() => import('./Terrace3DView'), { ssr: false })

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

const SCORE_THEME: Record<number, { bg: string; text: string }> = {
  0: { bg: 'bg-nuit', text: 'text-creme' },
  1: { bg: 'bg-gris/15', text: 'text-gris' },
  2: { bg: 'bg-gris/20', text: 'text-gris' },
  3: { bg: 'bg-soleil/20', text: 'text-[#B57500]' },
  4: { bg: 'bg-soleil/35', text: 'text-[#B57500]' },
  5: { bg: 'bg-soleil', text: 'text-nuit' },
}

interface PlacePreviewProps {
  place: Place
  onClose: () => void
}

// Convertit une valeur de slider (en demi-heures depuis 06:00) en time_slot "HH:MM"
function slotFromHalfHour(h: number): { slot: string; label: string; date: Date } {
  const hour = Math.floor(h)
  const minute = h % 1 === 0 ? 0 : 30
  const slot = `${String(hour).padStart(2, '0')}:${minute === 0 ? '00' : '30'}`
  const label = `${hour}h${minute === 0 ? '' : '30'}`
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return { slot, label, date: d }
}

export default function PlacePreview({ place, onClose }: PlacePreviewProps) {
  const router = useRouter()
  const [visible, setVisible] = useState(false)

  // Slider horaire : valeur en heures (avec demis), 6.0 → 23.5
  const initialHour = useMemo(() => {
    const now = new Date()
    const h = now.getHours() + (now.getMinutes() < 30 ? 0 : 0.5)
    return Math.max(6, Math.min(23.5, h))
  }, [])
  const [hour, setHour] = useState<number>(initialHour)

  // Lazy-load des scores du mois courant pour cette place (48 lignes)
  const [scoresThisMonth, setScoresThisMonth] = useState<Record<string, number> | null>(null)
  useEffect(() => {
    let cancelled = false
    const month = new Date().getMonth() + 1
    supabase
      .from('sun_scores')
      .select('time_slot, score')
      .eq('place_id', place.id)
      .eq('month', month)
      .then(({ data }) => {
        if (cancelled) return
        const map: Record<string, number> = {}
        for (const r of data ?? []) map[r.time_slot] = r.score
        setScoresThisMonth(map)
      })
    return () => {
      cancelled = true
    }
  }, [place.id])

  // Swipe-to-dismiss
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startY: number; currentY: number; dragging: boolean }>({
    startY: 0,
    currentY: 0,
    dragging: false,
  })

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [place.id])

  // Score affiché : lookup live dans les scores du mois (chargés à l'ouverture)
  const { slot, label: hourLabel, date: displayedDate } = slotFromHalfHour(hour)
  const score = scoresThisMonth?.[slot] ?? place.currentScore ?? 3

  const theme = SCORE_THEME[score] ?? SCORE_THEME[3]
  const rating = place.google_rating
  const priceLevel = place.price_level

  // Indique si l'heure choisie est l'heure actuelle
  const isNow = useMemo(() => {
    const now = new Date()
    const nowHour = now.getHours() + (now.getMinutes() < 30 ? 0 : 0.5)
    return Math.abs(hour - nowHour) < 0.25
  }, [hour])

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    dragState.current = { startY: e.touches[0].clientY, currentY: 0, dragging: true }
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragState.current.dragging || !sheetRef.current) return
    const deltaY = e.touches[0].clientY - dragState.current.startY
    if (deltaY < 0) return
    dragState.current.currentY = deltaY
    sheetRef.current.style.transform = `translateY(${deltaY}px)`
    sheetRef.current.style.transition = 'none'
  }
  const handleTouchEnd = () => {
    if (!sheetRef.current) return
    const { currentY } = dragState.current
    sheetRef.current.style.transition = ''
    if (currentY > 120) {
      setVisible(false)
      setTimeout(onClose, 280)
    } else {
      sheetRef.current.style.transform = ''
    }
    dragState.current.dragging = false
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={[
          'absolute inset-0 z-30 transition-opacity duration-300',
          visible ? 'bg-nuit/30 backdrop-blur-[2px]' : 'bg-nuit/0',
        ].join(' ')}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={[
          'absolute bottom-0 left-0 right-0 z-40',
          'transition-transform duration-[420ms]',
          visible ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
        style={{ transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        <div className="mx-auto w-full sm:max-w-md sm:mb-3 sm:px-3">
          <div className="rounded-t-[28px] sm:rounded-[28px] bg-white shadow-[0_-12px_40px_rgba(27,40,56,0.20)] overflow-hidden flex flex-col max-h-[92dvh]">

            {/* Drag handle */}
            <div
              className="flex justify-center pt-3 pb-1.5 shrink-0 touch-none"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="w-12 h-1.5 rounded-full bg-nuit/15" />
            </div>

            {/* Bouton fermer */}
            <button
              onClick={onClose}
              aria-label="Fermer"
              className="absolute top-4 right-4 z-20 rounded-full bg-white/95 backdrop-blur w-11 h-11 flex items-center justify-center shadow-md text-nuit/80 active:scale-90 transition-transform"
            >
              <X size={20} strokeWidth={2.4} />
            </button>

            {/* Hero — vraie 3D Mapbox, vue façade, soleil dynamique */}
            <div className="relative h-56 sm:h-64 mx-3 mt-1 rounded-2xl overflow-hidden shrink-0 bg-creme">
              <Terrace3DView
                lat={place.lat}
                lng={place.lng}
                score={score}
                date={displayedDate}
              />

              {/* Badge type */}
              <span className="absolute bottom-3 left-3 rounded-full bg-white/95 backdrop-blur px-3 py-1.5 text-[11px] font-outfit font-semibold text-nuit shadow-md uppercase tracking-wider">
                {TYPE_LABEL[place.type] ?? place.type}
              </span>

              {/* Heure du slider — bottom-right pour ne pas taper le bouton X */}
              <span
                className={[
                  'absolute bottom-3 right-3 rounded-full backdrop-blur px-3 py-1.5 text-[11px] font-outfit font-semibold shadow-md whitespace-nowrap',
                  isNow ? 'bg-ciel text-white' : 'bg-white/95 text-nuit',
                ].join(' ')}
              >
                {isNow ? '· Maintenant' : hourLabel}
              </span>
            </div>

            {/* Contenu scrollable */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-6">
              <h2 className="font-playfair text-[26px] leading-tight font-bold text-nuit">
                {place.name}
              </h2>
              <p className="text-[13px] text-gris font-outfit leading-snug mt-1">
                {place.address}
              </p>

              {/* Rating + price + arr */}
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {rating != null && (
                  <span className="flex items-center gap-1 text-sm font-outfit font-medium text-nuit">
                    <Star size={15} fill="#FFBE0B" stroke="#FFBE0B" />
                    {rating.toFixed(1)}
                  </span>
                )}
                {priceLevel != null && priceLevel > 0 && (
                  <span className="text-sm font-outfit font-medium text-gris">
                    {'€'.repeat(priceLevel)}
                    <span className="text-nuit/15">{'€'.repeat(4 - priceLevel)}</span>
                  </span>
                )}
                {place.arrondissement != null && (
                  <span className="text-sm font-outfit text-gris">
                    · {place.arrondissement}
                    <sup>{place.arrondissement === 1 ? 'er' : 'e'}</sup>
                  </span>
                )}
              </div>

              {/* Score block + slider — uniquement si scores calculés pour ce lieu */}
              {scoresThisMonth !== null && Object.keys(scoresThisMonth).length > 0 ? (
                <>
              {/* Score block */}
              <div className={`mt-4 rounded-2xl ${theme.bg} px-5 py-4 flex items-center gap-4 transition-colors duration-300`}>
                <div className={`text-4xl font-playfair font-bold leading-none ${theme.text}`}>
                  {score}
                  <span className="text-base font-outfit font-medium opacity-60">/5</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] uppercase tracking-widest font-outfit font-bold ${theme.text} opacity-70`}>
                    {isNow ? 'Maintenant' : `À ${hourLabel}`}
                  </p>
                  <p className={`text-sm font-outfit font-semibold ${theme.text} leading-tight truncate`}>
                    {SCORE_LABEL[score]}
                  </p>
                </div>
                <div className="flex gap-0.5 items-end shrink-0">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 rounded-full"
                      style={{
                        height: `${10 + i * 2.5}px`,
                        backgroundColor: i <= score ? 'currentColor' : 'transparent',
                        border: i > score ? '1px solid currentColor' : 'none',
                        opacity: i <= score ? 0.9 : 0.2,
                        color: theme.text.replace('text-', 'var(--color-'),
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Slider horaire */}
              <div className="mt-5">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-widest font-outfit font-bold text-gris mb-2">
                  <span className="flex items-center gap-1">
                    <Sunrise size={12} />
                    6h
                  </span>
                  <span className="text-nuit/70">Glisse pour voir le soleil dans la journée</span>
                  <span className="flex items-center gap-1">
                    23h
                    <Sunset size={12} />
                  </span>
                </div>
                <div className="relative">
                  {/* Track gradient (matin → midi → soir → nuit) */}
                  <div
                    className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full pointer-events-none"
                    style={{
                      background:
                        'linear-gradient(to right, #5B6FA8 0%, #FFD976 22%, #FFBE0B 50%, #FF9500 75%, #2C3E54 100%)',
                    }}
                  />
                  <input
                    type="range"
                    min={6}
                    max={23.5}
                    step={0.5}
                    value={hour}
                    onChange={(e) => setHour(parseFloat(e.target.value))}
                    className="cb-hour-slider relative w-full appearance-none bg-transparent cursor-pointer"
                    aria-label="Heure de la journée"
                  />
                </div>

                {/* Quick jumps */}
                <div className="flex justify-between mt-3 text-[11px] font-outfit text-gris">
                  {[8, 12, 16, 20].map((h) => (
                    <button
                      key={h}
                      onClick={() => setHour(h)}
                      className={[
                        'rounded-full px-2.5 py-1 transition-colors',
                        Math.floor(hour) === h
                          ? 'bg-nuit text-creme font-semibold'
                          : 'bg-creme text-nuit/70 hover:bg-creme/80',
                      ].join(' ')}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </div>
                </>
              ) : scoresThisMonth === null ? null : (
                /* Pas de score calculé pour ce lieu */
                <div className="mt-4 rounded-2xl bg-nuit/5 px-4 py-3 text-center">
                  <p className="text-[12px] font-outfit font-semibold text-nuit/50">
                    Score soleil non encore calculé pour ce lieu
                  </p>
                </div>
              )}

              {/* CTA principal */}
              <button
                onClick={() => router.push(`/place/${place.id}`)}
                className="mt-5 w-full flex items-center justify-center gap-2 rounded-2xl bg-nuit py-4 text-[15px] font-outfit font-semibold text-creme shadow-md active:scale-[0.97] transition-transform"
              >
                Voir la fiche complète
                <ChevronUp size={18} strokeWidth={2.4} className="rotate-90" />
              </button>

              {/* CTA secondaire */}
              {place.google_maps_url && (
                <a
                  href={place.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl bg-creme py-4 text-[15px] font-outfit font-semibold text-nuit border border-nuit/8 active:scale-[0.97] transition-transform"
                >
                  <Navigation size={16} strokeWidth={2.2} />
                  Y aller maintenant
                </a>
              )}

              {/* CTA partager */}
              <button
                onClick={async () => {
                  const url = `https://hopsoleil.fr/place/${place.id}`
                  if (navigator?.share) { try { await navigator.share({ title: place.name, url }); return } catch { /* cancelled */ } }
                  if (navigator?.clipboard) { await navigator.clipboard.writeText(url) }
                }}
                className="mt-2 w-full flex items-center justify-center gap-2 rounded-2xl bg-creme py-3.5 text-[14px] font-outfit font-semibold text-nuit/70 border border-nuit/8 active:scale-[0.97] transition-transform"
              >
                <Share2 size={15} strokeWidth={2.2} />
                Partager cette terrasse
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

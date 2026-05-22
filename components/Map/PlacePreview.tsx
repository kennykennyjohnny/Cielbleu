'use client'

import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { Star, X, Sunrise, Sunset, Share2, Heart, Navigation2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Place } from '@/types'

// 3D map = client only, dynamic
const Terrace3DView = dynamic(() => import('./Terrace3DView'), { ssr: false })

// ── Snap levels ─────────────────────────────────────────────────────────────
// snap=1 : peek   (~116px visible = handle + titre + adresse)
// snap=2 : medium (~430px visible = actions + type + score + slider)
// snap=3 : plein  (92dvh = tout + vue 3D)
const SNAP_Y: Record<1 | 2 | 3, string> = {
  1: 'calc(92dvh - 116px)',
  2: 'calc(max(92dvh - 430px, 26dvh))',
  3: '0px',
}

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
  // ── Snap / transform ───────────────────────────────────────────────────────
  const [snap, setSnap] = useState<1 | 2 | 3>(2)
  const [transformY, setTransformY] = useState('translateY(100%)')
  const snapRef = useRef<1 | 2 | 3>(2)

  // ── Auth + favorites ───────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)

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

  // Swipe / snap
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ startY: 0, currentY: 0, dragging: false })

  // ── Entry animation ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = requestAnimationFrame(() => setTransformY(`translateY(${SNAP_Y[2]})`))
    return () => cancelAnimationFrame(id)
  }, [place.id])

  // ── Auth ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null))
  }, [])

  // ── Favorite check ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) { setIsFavorite(false); setFavoriteId(null); return }
    let cancelled = false
    supabase.from('favorites').select('id').eq('user_id', userId).eq('place_id', place.id).single()
      .then(({ data }) => { if (!cancelled && data) { setIsFavorite(true); setFavoriteId(data.id) } })
    return () => { cancelled = true }
  }, [userId, place.id])

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

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleToggleFavorite = useCallback(async () => {
    if (!userId) return
    if (isFavorite && favoriteId) {
      await supabase.from('favorites').delete().eq('id', favoriteId)
      setIsFavorite(false); setFavoriteId(null)
    } else {
      const { data } = await supabase.from('favorites').insert({ user_id: userId, place_id: place.id }).select('id').single()
      if (data) { setIsFavorite(true); setFavoriteId(data.id) }
    }
  }, [userId, isFavorite, favoriteId, place.id])

  const handleShare = useCallback(async () => {
    const url = `https://hopsoleil.fr/place/${place.id}`
    if (navigator?.share) { try { await navigator.share({ title: place.name, url }); return } catch { /* cancelled */ } }
    if (navigator?.clipboard) { await navigator.clipboard.writeText(url) }
  }, [place.id, place.name])

  // ── Snap helpers ─────────────────────────────────────────────────────────
  const snapTo = useCallback((target: 1 | 2 | 3) => {
    snapRef.current = target
    setSnap(target)
    setTransformY(`translateY(${SNAP_Y[target]})`)
  }, [])

  const handleClose = useCallback(() => {
    const el = sheetRef.current
    if (el) {
      el.style.transition = 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)'
      el.style.transform = 'translateY(100%)'
    }
    setTimeout(onClose, 320)
  }, [onClose])

  // ── Touch / drag on handle ───────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    dragState.current = { startY: e.touches[0].clientY, currentY: 0, dragging: true }
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!dragState.current.dragging || !sheetRef.current) return
    const deltaY = e.touches[0].clientY - dragState.current.startY
    dragState.current.currentY = deltaY
    sheetRef.current.style.transition = 'none'
    sheetRef.current.style.transform =
      `translateY(calc(${SNAP_Y[snapRef.current]} + ${Math.max(-80, deltaY)}px))`
  }
  const handleTouchEnd = () => {
    dragState.current.dragging = false
    const delta = dragState.current.currentY
    const current = snapRef.current
    if (delta < -60) {
      snapTo(Math.min(3, current + 1) as 1 | 2 | 3)
    } else if (delta > 80) {
      if (current === 1) { handleClose() }
      else { snapTo((current - 1) as 1 | 2 | 3) }
    } else {
      snapTo(current) // retour snap courant — React réapplique la transition
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-30 bg-nuit/25 backdrop-blur-[2px]"
        onClick={handleClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 z-40"
        style={{
          transform: transformY,
          transition: 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div className="mx-auto w-full sm:max-w-md sm:mb-3 sm:px-3">
          <div
            className="rounded-t-[28px] sm:rounded-[28px] bg-white shadow-[0_-12px_40px_rgba(27,40,56,0.20)] flex flex-col overflow-hidden"
            style={{ height: '92dvh' }}
          >
            {/* ── Drag handle ──────────────────────────────────────────── */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Glisser pour changer la taille"
              className="flex justify-center pt-3 pb-2 shrink-0 touch-none select-none cursor-grab"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div className="w-12 h-1.5 rounded-full bg-nuit/15" />
            </div>

            {/* Bouton fermer */}
            <button
              onClick={handleClose}
              aria-label="Fermer"
              className="absolute top-4 right-4 z-20 rounded-full bg-white/95 backdrop-blur w-11 h-11 flex items-center justify-center shadow-md text-nuit/80 active:scale-90 transition-transform touch-manipulation"
            >
              <X size={20} strokeWidth={2.4} />
            </button>

            {/* ── ZONE PEEK — toujours visible (~116px) ────────────────── */}
            <div className="px-5 shrink-0">
              <h2 className="font-playfair text-[22px] leading-tight font-bold text-nuit pr-14 truncate">
                {place.name}
              </h2>
              <p className="text-[12px] text-gris font-outfit mt-0.5 pr-14 truncate">
                {place.address}
              </p>

              {/* ── Action row : ❤️ Partager Y aller ────────────────────── */}
              <div
                className="flex items-stretch gap-2 mt-3 pb-4"
                role="toolbar"
                aria-label="Actions rapides"
              >
                <button
                  onClick={handleToggleFavorite}
                  aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  aria-pressed={isFavorite}
                  className={[
                    'flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl',
                    'text-[11px] font-outfit font-semibold transition-colors touch-manipulation',
                    isFavorite
                      ? 'bg-[rgba(255,107,107,0.12)] text-corail'
                      : 'bg-nuit/5 text-nuit/60',
                  ].join(' ')}
                >
                  <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} strokeWidth={2} />
                  <span>Favoris</span>
                </button>

                <button
                  onClick={handleShare}
                  aria-label="Partager cette terrasse"
                  className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-nuit/5 text-nuit/60 text-[11px] font-outfit font-semibold touch-manipulation active:bg-nuit/10 transition-colors"
                >
                  <Share2 size={18} strokeWidth={2} />
                  <span>Partager</span>
                </button>

                {place.google_maps_url ? (
                  <a
                    href={place.google_maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Ouvrir l'itinéraire dans Maps"
                    className="flex-1 flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl bg-nuit/5 text-nuit/60 text-[11px] font-outfit font-semibold touch-manipulation active:bg-nuit/10 transition-colors"
                  >
                    <Navigation2 size={18} strokeWidth={2} />
                    <span>Y aller</span>
                  </a>
                ) : (
                  <div className="flex-1" />
                )}
              </div>
            </div>

            {/* Séparateur */}
            <div className="h-px bg-nuit/8 mx-5 shrink-0" />

            {/* ── CONTENU SCROLLABLE ───────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-8">

              {/* Type + rating + price + arrondissement */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-full bg-nuit/8 px-3 py-1 text-[11px] font-outfit font-semibold text-nuit uppercase tracking-wide">
                  {TYPE_LABEL[place.type] ?? place.type}
                </span>
                {rating != null && (
                  <span className="flex items-center gap-1 text-sm font-outfit font-medium text-nuit">
                    <Star size={14} fill="#FFBE0B" stroke="#FFBE0B" />
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

              {/* Score block + slider */}
              {scoresThisMonth !== null && Object.keys(scoresThisMonth).length > 0 ? (
                <>
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
                      <span className="flex items-center gap-1"><Sunrise size={12} />6h</span>
                      <span className="text-nuit/60">Glisse pour explorer la journée</span>
                      <span className="flex items-center gap-1">23h<Sunset size={12} /></span>
                    </div>
                    <div className="relative">
                      <div
                        className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full pointer-events-none"
                        style={{ background: 'linear-gradient(to right, #5B6FA8 0%, #FFD976 22%, #FFBE0B 50%, #FF9500 75%, #2C3E54 100%)' }}
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
                    <div className="flex justify-between mt-3 text-[12px] font-outfit">
                      {[8, 12, 16, 20].map((h) => (
                        <button
                          key={h}
                          onClick={() => setHour(h)}
                          className={[
                            'rounded-full px-3 py-1.5 transition-colors touch-manipulation font-medium',
                            Math.floor(hour) === h
                              ? 'bg-nuit text-creme font-semibold'
                              : 'bg-nuit/5 text-nuit/60',
                          ].join(' ')}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : scoresThisMonth === null ? null : (
                <div className="mt-4 rounded-2xl bg-nuit/5 px-4 py-3 text-center">
                  <p className="text-[12px] font-outfit font-semibold text-nuit/50">
                    Score soleil non encore calculé pour ce lieu
                  </p>
                </div>
              )}

              {/* Vue 3D — uniquement en mode plein écran */}
              {snap === 3 && (
                <div
                  className="mt-6 rounded-2xl overflow-hidden"
                  style={{ height: '220px', background: 'var(--color-creme)' }}
                >
                  <Terrace3DView lat={place.lat} lng={place.lng} score={score} date={displayedDate} />
                </div>
              )}
            </div>

            {/* Indicateurs de niveau (dots) */}
            <div className="flex justify-center gap-1.5 py-3 shrink-0" aria-hidden="true">
              {([1, 2, 3] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => snapTo(level)}
                  aria-label={`Niveau ${level}`}
                  className={[
                    'rounded-full transition-all duration-200 touch-manipulation',
                    snap === level ? 'w-5 h-1.5 bg-nuit/35' : 'w-1.5 h-1.5 bg-nuit/15',
                  ].join(' ')}
                />
              ))}
            </div>

          </div>
        </div>
      </div>
    </>
  )
}

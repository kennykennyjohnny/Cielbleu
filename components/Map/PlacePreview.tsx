'use client'

import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import dynamic from 'next/dynamic'
import { Star, X, Share2, Heart } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { Place } from '@/types'

// 3D map = client only, dynamic
const Terrace3DView = dynamic(() => import('./Terrace3DView'), { ssr: false })

// ── Snap levels ─────────────────────────────────────────────────────────────
// snap=1 : peek   (~116px visible = handle + titre + adresse)
// snap=2 : medium (~430px visible = actions + type + score)
// snap=3 : plein  (92dvh = tout + vue 3D)
const SNAP_Y: Record<1 | 2 | 3, string> = {
  1: 'calc(92dvh - 160px)', // peek : handle + titre + adresse + action row + badges
  2: 'calc(max(92dvh - 420px, 28dvh))', // medium : + score + details
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
  hour: number
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

function extractPhotoRef(url: string): string | null {
  try { return new URL(url).searchParams.get('photo_reference') } catch { return null }
}

export default function PlacePreview({ place, hour, onClose }: PlacePreviewProps) {
  // ── Snap / transform ───────────────────────────────────────────────────────
  const [snap, setSnap] = useState<1 | 2 | 3>(2)
  const [transformY, setTransformY] = useState('translateY(100%)')
  const snapRef = useRef<1 | 2 | 3>(2)

  // ── Auth + favorites ───────────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)

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

  const [reviews, setReviews] = useState<{ id: string; comment: string | null; created_at: string; display_name: string; photos: string[] }[]>([])

  const photoRefs = useMemo(() => {
    if (!place.photos?.length) return []
    return place.photos.map(extractPhotoRef).filter((r): r is string => r !== null)
  }, [place.photos])

  const reviewPhotoItems = useMemo(() => {
    return reviews.flatMap((review) =>
      review.photos.map((photoUrl, index) => ({
        id: `review-${review.id}-${index}`,
        url: photoUrl,
        caption: review.comment ? `${review.display_name}: ${review.comment}` : `${review.display_name} — Photo HopSoleil`,
      }))
    )
  }, [reviews])

  const galleryItems = useMemo(() => [
    ...photoRefs.map((ref, i) => ({
      id: `google-${i}`,
      url: `/api/photo?ref=${encodeURIComponent(ref)}&w=900`,
      caption: 'Photo Google Maps',
    })),
    ...reviewPhotoItems,
  ], [photoRefs, reviewPhotoItems])

  useEffect(() => {
    let cancelled = false
    async function loadReviews() {
      const { data, error } = await supabase
        .from('reviews')
        .select('id, comment, created_at, user_id, photos')
        .eq('place_id', place.id)
        .order('created_at', { ascending: false })
        .limit(6)
      if (cancelled || error || !data) return

      const filtered = data.filter((review) => {
        const hasComment = typeof review.comment === 'string' && review.comment.trim().length > 0
        const hasPhotos = Array.isArray(review.photos) && review.photos.length > 0
        return hasComment || hasPhotos
      })

      const userIds = [...new Set(filtered.filter((r) => typeof r.user_id === 'string').map((r) => r.user_id as string))]
      const profileMap: Record<string, string> = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds)
        for (const profile of profiles ?? []) {
          if (profile?.id) profileMap[profile.id] = profile.display_name ?? 'Soleiliste'
        }
      }

      if (cancelled) return
      setReviews(filtered.map((review) => ({
        id: review.id,
        comment: review.comment,
        created_at: review.created_at,
        display_name: typeof review.user_id === 'string' ? (profileMap[review.user_id] ?? 'Soleiliste') : 'Anonyme',
        photos: Array.isArray(review.photos) ? review.photos : [],
      })))
    }

    loadReviews()
    return () => { cancelled = true }
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

  // Ouvre Google Maps natif sur iOS (Universal Links) et Android (App Links)
  // window.location.href est indispensable — target="_blank" bloque les Universal Links iOS
  const handleOpenMaps = useCallback(() => {
    const q = encodeURIComponent(`${place.lat},${place.lng}`)
    const pid = place.google_place_id ? `&query_place_id=${place.google_place_id}` : ''
    window.location.href = `https://www.google.com/maps/search/?api=1&query=${q}${pid}`
  }, [place.lat, place.lng, place.google_place_id])

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
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="absolute bottom-0 left-0 right-0 z-40"
        style={{
          transform: transformY,
          transition: 'transform 400ms cubic-bezier(0.32, 0.72, 0, 1)',
          maxHeight: '92dvh',
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
              className="absolute top-4 right-4 z-20 rounded-full bg-white/95 w-11 h-11 flex items-center justify-center shadow-md text-nuit/80 active:scale-90 transition-transform touch-manipulation"
            >
              <X size={20} strokeWidth={2.4} />
            </button>

            {/* ── ZONE PEEK — toujours visible ────────────────────────── */}
            <div className="px-4 shrink-0">
              <h2 className="font-playfair text-[20px] leading-tight font-bold text-nuit pr-12 truncate">
                {place.name}
              </h2>
              <p className="text-[12px] text-gris font-outfit mt-0.5 pr-12 truncate">
                {place.address}
              </p>

              {/* ── Action row compact : ❤️ | Partager | Maps ───────────── */}
              <div
                className="flex items-center gap-2 mt-2.5"
                role="toolbar"
                aria-label="Actions rapides"
              >
                <button
                  onClick={handleToggleFavorite}
                  aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  aria-pressed={isFavorite}
                  className={[
                    'flex-1 flex items-center justify-center gap-2 py-2 rounded-xl border transition-colors touch-manipulation min-h-[42px]',
                    'text-sm font-outfit font-semibold',
                    isFavorite
                      ? 'bg-[rgba(237,99,99,0.16)] border-[rgba(237,99,99,0.26)] text-corail'
                      : 'bg-white border-nuit/10 text-nuit/80',
                  ].join(' ')}
                  style={{ boxShadow: isFavorite ? '0 8px 20px rgba(237,99,99,0.12)' : 'none' }}
                >
                  <Heart size={16} fill={isFavorite ? '#D22D3D' : 'none'} stroke={isFavorite ? '#D22D3D' : '#1F3A5F'} strokeWidth={2} />
                  <span>Favoris</span>
                </button>

                <button
                  onClick={handleShare}
                  aria-label="Partager cette terrasse"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-surface-1 border border-nuit/10 text-nuit/80 text-sm font-outfit font-semibold touch-manipulation active:bg-nuit/5 transition-colors min-h-[42px]"
                >
                  <Share2 size={15} strokeWidth={2} />
                  <span>Partager</span>
                </button>

                <button
                  onClick={handleOpenMaps}
                  aria-label="Ouvrir dans Google Maps"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-nuit text-creme text-sm font-outfit font-semibold touch-manipulation active:bg-nuit/90 transition-colors min-h-[42px]"
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335"/>
                    <circle cx="12" cy="9" r="2.5" fill="white"/>
                  </svg>
                  <span>Maps</span>
                </button>
              </div>

              {/* ── Type + rating + price + arrondissement (peek) ────────── */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pb-3 text-[11px]">
                {place.has_terrace !== false && (
                  <span className="rounded-full bg-[rgba(34,197,94,0.12)] px-2.5 py-1 font-semibold text-[#15803d] uppercase tracking-[0.18em]">
                    Terrasse
                  </span>
                )}
                <span className="rounded-full bg-nuit/8 px-2.5 py-1 font-semibold text-nuit uppercase tracking-[0.18em]">
                  {TYPE_LABEL[place.type] ?? place.type}
                </span>
                {rating != null && (
                  <span className="flex items-center gap-1 rounded-full bg-surface-1 px-2.5 py-1 font-semibold text-nuit">
                    <Star size={12} fill="#FFBE0B" stroke="#FFBE0B" />
                    {rating.toFixed(1)}
                  </span>
                )}
                {priceLevel != null && priceLevel > 0 && (
                  <span className="rounded-full bg-surface-1 px-2.5 py-1 font-semibold text-nuit">
                    {'€'.repeat(priceLevel)}<span className="opacity-40">{'€'.repeat(4 - priceLevel)}</span>
                  </span>
                )}
                {place.arrondissement != null && (
                  <span className="rounded-full bg-surface-1 px-2.5 py-1 font-semibold text-nuit uppercase tracking-[0.18em]">
                    {place.arrondissement}<sup>{place.arrondissement === 1 ? 'er' : 'e'}</sup>
                  </span>
                )}
              </div>
            </div>

            {/* Séparateur */}
            <div className="h-px bg-nuit/8 mx-4 shrink-0" />

            {/* ── CONTENU SCROLLABLE ───────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-8" style={{ minHeight: 0 }}>

              {scoresThisMonth !== null && Object.keys(scoresThisMonth).length > 0 ? (
                <div className={`mt-4 rounded-3xl px-5 py-4 flex items-center gap-4 ${theme.bg} transition-colors duration-300`}>
                  <div className={`text-4xl font-playfair font-bold leading-none ${theme.text}`}>
                    {score}
                    <span className="text-base font-outfit font-medium opacity-70">/5</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] uppercase tracking-[0.22em] font-semibold ${theme.text} opacity-70`}>
                      {isNow ? 'Maintenant' : `À ${hourLabel}`}
                    </p>
                    <p className={`mt-1 text-sm font-semibold leading-tight ${theme.text}`}>
                      {SCORE_LABEL[score]}
                    </p>
                    <p className="mt-2 text-[12px] text-nuit/70">
                      {place.has_terrace !== false ? 'Terrasse disponible' : 'Terrasse non confirmée'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    {rating != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-nuit shadow-sm">
                        <Star size={14} fill="#FFBE0B" stroke="#FFBE0B" />
                        {rating.toFixed(1)}
                      </span>
                    )}
                    {place.arrondissement != null && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gris">
                        {place.arrondissement}{place.arrondissement === 1 ? 'er' : 'e'}
                      </span>
                    )}
                  </div>
                </div>
              ) : scoresThisMonth === null ? (
                <div className="mt-4 rounded-3xl bg-white/95 border border-nuit/10 px-4 py-3 text-center">
                  <p className="text-[12px] font-outfit font-semibold text-nuit/60">
                    Charge les données de soleil…
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-3xl bg-[#fff8e8] px-4 py-3 text-center border border-[#f2d9a6]">
                  <p className="text-[12px] font-outfit font-semibold text-[#6b5318]">
                    Score soleil non encore calculé pour ce lieu
                  </p>
                </div>
              )}

              <div className="mt-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-gris font-semibold">Photos</p>
                    <p className="mt-1 text-sm font-semibold text-nuit">{galleryItems.length} images</p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-nuit/50">
                    Glisse
                  </span>
                </div>
                {galleryItems.length > 0 ? (
                  <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
                    {galleryItems.slice(0, 5).map((photo) => (
                      <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"
                        className="block shrink-0 overflow-hidden rounded-[22px] bg-[#f8f1e6]"
                        style={{ minWidth: 120, minHeight: 120 }}>
                        <img src={photo.url} alt={photo.caption} className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-3xl bg-white border border-nuit/10 p-4">
                    <p className="text-sm text-nuit/75">Aucune photo disponible pour l’instant.</p>
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-3">
                <div className="rounded-3xl bg-white p-4 ring-1 ring-nuit/10 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-gris font-semibold">Adresse</p>
                      <p className="mt-2 text-sm font-semibold text-nuit leading-tight">{place.address}</p>
                    </div>
                    <button onClick={handleOpenMaps}
                      className="rounded-full bg-nuit px-3 py-2 text-[12px] font-semibold text-creme transition hover:bg-nuit/95">
                      Itinéraire
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-4 ring-1 ring-nuit/10 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-gris font-semibold">Avis récents</p>
                      <p className="mt-2 text-sm font-semibold text-nuit">{reviews.length} avis</p>
                    </div>
                    {reviews.length > 0 ? (
                      <a href={`/place/${place.id}`} className="text-[12px] font-semibold uppercase tracking-[0.22em] text-nuit/60">
                        Voir tout
                      </a>
                    ) : null}
                  </div>

                  {reviews.length > 0 ? (
                    <div className="mt-4 space-y-3">
                      {reviews.slice(0, 2).map((review) => (
                        <div key={review.id} className="rounded-3xl bg-surface-1 p-3 border border-nuit/10">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold text-nuit">{review.display_name}</span>
                            <span className="text-[10px] text-gris">{new Date(review.created_at).toLocaleDateString('fr-FR')}</span>
                          </div>
                          {review.comment ? (
                            <p className="mt-2 text-sm leading-6 text-nuit/85">{review.comment}</p>
                          ) : (
                            <p className="mt-2 text-sm leading-6 text-nuit/70">Photo uniquement</p>
                          )}
                          {review.photos.length > 0 && (
                            <div className="mt-3 grid grid-cols-2 gap-2">
                              {review.photos.slice(0, 2).map((photo, index) => (
                                <a key={index} href={photo} target="_blank" rel="noreferrer"
                                  className="overflow-hidden rounded-2xl bg-[#f8f1e6]" style={{ minHeight: 86 }}>
                                  <img src={photo} alt={`Avis photo ${index + 1}`} className="h-full w-full object-cover" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-nuit/70">Aucun avis publié pour le moment.</p>
                  )}
                </div>
              </div>

              {snap === 3 && (
                <div className="mt-6 rounded-2xl overflow-hidden" style={{ height: '220px', background: 'var(--color-creme)' }}>
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

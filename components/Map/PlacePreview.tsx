'use client'

import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import { X, Share2, Heart, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { todayHoursLabel } from '@/lib/openingHours'
import type { Place } from '@/types'

// ── Snap levels (10 niveaux) ──────────────────────────────────────────────────
// N = pixels visibles depuis le bas. max() protège les petits écrans.
// Entrée par défaut au niveau 3 (~320px visible).
const SNAP_Y: Record<1|2|3|4|5|6|7|8|9|10, string> = {
  1:  'calc(92dvh - 160px)',                   // peek minimal
  2:  'calc(max(92dvh - 240px, 22dvh))',       // + adresse
  3:  'calc(max(92dvh - 320px, 18dvh))',       // + score — défaut entrée
  4:  'calc(max(92dvh - 400px, 14dvh))',       // + stats
  5:  'calc(max(92dvh - 475px, 11dvh))',       // + horaires
  6:  'calc(max(92dvh - 545px,  8dvh))',       // + début avis
  7:  'calc(max(92dvh - 615px,  5dvh))',       // + avis complets
  8:  'calc(max(92dvh - 685px,  3dvh))',       // + photos
  9:  'calc(max(92dvh - 750px,  2dvh))',       // + community
  10: '0px',                                   // plein écran
}

// ── Style constants (palette CielBleu — identique PlacePageClient) ────────────
const EYEBROW: React.CSSProperties = {
  margin: 0, color: '#6f7a8a', fontSize: 11, fontWeight: 800,
  textTransform: 'uppercase', letterSpacing: '0.12em',
}
const MINI_BADGE: React.CSSProperties = {
  minHeight: 26, padding: '0 10px', borderRadius: 999,
  background: '#fff', color: '#102a4c',
  fontSize: 11, fontWeight: 800,
  display: 'inline-flex', alignItems: 'center', gap: 5,
  border: '1px solid rgba(20,32,51,0.10)',
}
const STAT_CARD: React.CSSProperties = {
  minHeight: 64, padding: '11px 12px', borderRadius: 16,
  background: 'rgba(255,255,255,0.78)',
  border: '1px solid rgba(20,32,51,0.09)',
  cursor: 'pointer',
}

const SCORE_LABEL: Record<number, string> = {
  0: 'Tombée de la nuit',
  1: "À l'ombre",
  2: "Surtout à l'ombre",
  3: 'Mi-soleil mi-ombre',
  4: 'Bien ensoleillé',
  5: 'Plein soleil',
}
const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar', restaurant: 'Restaurant', cafe: 'Café', park: 'Parc',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function slotFromHalfHour(h: number): { slot: string; label: string; date: Date } {
  const hour = Math.floor(h)
  const minute = h % 1 === 0 ? 0 : 30
  const slot = `${String(hour).padStart(2, '0')}:${minute === 0 ? '00' : '30'}`
  const label = `${hour}h${minute === 0 ? '' : '30'}`
  const d = new Date(); d.setHours(hour, minute, 0, 0)
  return { slot, label, date: d }
}
function fmtSlotStart(slot: string) {
  const [h, m] = slot.split(':').map(Number)
  return `${h}h${m === 0 ? '' : '30'}`
}
function fmtSlotEnd(slot: string) {
  const [h, m] = slot.split(':').map(Number)
  let eH = h, eM = m + 30
  if (eM >= 60) { eM = 0; eH++ }
  return `${eH}h${eM === 0 ? '' : '30'}`
}
function computeSunWindow(scores: Record<string, number>): { fromSlot: string; toSlot: string } | null {
  const entries = Object.entries(scores)
    .filter(([s]) => { const [hh] = s.split(':').map(Number); return hh >= 7 && hh <= 22 })
    .sort(([a], [b]) => a.localeCompare(b))
  let best = { start: -1, end: -1, len: 0 }, cur = { start: -1, len: 0 }
  for (let i = 0; i < entries.length; i++) {
    if (entries[i][1] >= 4) {
      if (cur.start < 0) cur.start = i
      cur.len++
      if (cur.len > best.len) best = { start: cur.start, end: i, len: cur.len }
    } else { cur = { start: -1, len: 0 } }
  }
  if (best.len === 0 || best.start < 0) return null
  return { fromSlot: entries[best.start][0], toSlot: entries[best.end][0] }
}
function extractPhotoRef(url: string): string | null {
  try { return new URL(url).searchParams.get('photo_reference') } catch { return null }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface PlacePreviewProps {
  place: Place
  hour: number
  onClose: () => void
  userId?: string | null
  onOpenProfile?: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function PlacePreview({ place, hour, onClose, userId = null, onOpenProfile }: PlacePreviewProps) {

  // ── Snap ─────────────────────────────────────────────────────────────────
  type SnapLevel = 1|2|3|4|5|6|7|8|9|10
  const [snap, setSnap] = useState<SnapLevel>(3)
  const [transformY, setTransformY] = useState('translateY(100%)')
  const snapRef = useRef<SnapLevel>(3)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ startY: 0, currentY: 0, dragging: false, startTime: 0 })

  // ── Data ──────────────────────────────────────────────────────────────────
  const [scoresThisMonth, setScoresThisMonth] = useState<Record<string, number> | null>(null)
  const [isFavorite, setIsFavorite] = useState(false)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)
  const [likeCount, setLikeCount] = useState(0)
  const [reviews, setReviews] = useState<{
    id: string; comment: string | null; created_at: string;
    display_name: string; user_id?: string | null; photos: string[]
  }[]>([])
  const [sunVote, setSunVote] = useState<'sunny' | 'shady' | null>(null)
  const [sunnyVoteCount, setSunnyVoteCount] = useState<number | null>(null)
  const [voteToast, setVoteToast] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [commentSent, setCommentSent] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [reviewPhotos, setReviewPhotos] = useState<File[]>([])
  const [reviewPhotoUrls, setReviewPhotoUrls] = useState<string[]>([])
  const [lightboxPhoto, setLightboxPhoto] = useState<{ url: string; caption?: string } | null>(null)
  const [shareToast, setShareToast] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const deviceId = useMemo<string>(() => {
    if (typeof window === 'undefined') return 'ssr'
    const key = 'hs_device_id'
    let id = localStorage.getItem(key)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }
    return id
  }, [])

  // ── Entry animation ───────────────────────────────────────────────────────
  useEffect(() => {
    const id = requestAnimationFrame(() => setTransformY(`translateY(${SNAP_Y[3]})`))
    return () => cancelAnimationFrame(id)
  }, [place.id])

  // ── Load scores ───────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const month = new Date().getMonth() + 1
    supabase.from('sun_scores').select('time_slot, score')
      .eq('place_id', place.id).eq('month', month)
      .then(({ data }) => {
        if (cancelled) return
        const map: Record<string, number> = {}
        for (const r of data ?? []) map[r.time_slot] = r.score
        setScoresThisMonth(map)
      })
    return () => { cancelled = true }
  }, [place.id])

  // ── Load reviews ──────────────────────────────────────────────────────────
  const loadReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from('reviews').select('id, comment, created_at, user_id, photos')
      .eq('place_id', place.id).order('created_at', { ascending: false }).limit(10)
    if (error || !data) return
    const filtered = data.filter(r =>
      (typeof r.comment === 'string' && r.comment.trim() !== '') ||
      (Array.isArray(r.photos) && r.photos.length > 0)
    )
    const userIds = [...new Set(filtered.filter(r => r.user_id).map(r => r.user_id as string))]
    const profileMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', userIds)
      for (const p of profiles ?? []) profileMap[p.id] = p.display_name ?? 'Soleiliste'
    }
    setReviews(filtered.map(r => ({
      id: r.id, comment: r.comment, created_at: r.created_at,
      display_name: r.user_id ? (profileMap[r.user_id] ?? 'Soleiliste') : 'Anonyme',
      user_id: r.user_id ?? null,
      photos: Array.isArray(r.photos) ? r.photos : [],
    })))
  }, [place.id])

  useEffect(() => { loadReviews() }, [loadReviews])

  // ── Favorites + votes ─────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('place_like_counts').select('like_count').eq('place_id', place.id).single()
      .then(({ data }) => { if (data) setLikeCount(data.like_count) })
  }, [place.id])

  useEffect(() => {
    if (!userId) { setIsFavorite(false); setFavoriteId(null); return }
    let cancelled = false
    supabase.from('favorites').select('id').eq('user_id', userId).eq('place_id', place.id).single()
      .then(({ data }) => { if (!cancelled && data) { setIsFavorite(true); setFavoriteId(data.id) } })
    return () => { cancelled = true }
  }, [userId, place.id])

  useEffect(() => {
    let cancelled = false
    supabase.from('sun_votes').select('id', { count: 'exact', head: true })
      .eq('place_id', place.id).eq('is_sunny', true)
      .then(({ count }) => { if (!cancelled && count != null) setSunnyVoteCount(count) })
    const q = supabase.from('sun_votes').select('is_sunny').eq('place_id', place.id)
    const qf = userId ? q.eq('user_id', userId) : q.eq('device_id', deviceId)
    qf.order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (!cancelled && data?.[0]) setSunVote(data[0].is_sunny ? 'sunny' : 'shady') })
    return () => { cancelled = true }
  }, [place.id, userId, deviceId])

  // ── Computed ──────────────────────────────────────────────────────────────
  const { slot, label: hourLabel } = slotFromHalfHour(hour)
  const score = scoresThisMonth?.[slot] ?? place.currentScore ?? 3
  const isSunny = score >= 4
  const sunWindow = useMemo(() => scoresThisMonth ? computeSunWindow(scoresThisMonth) : null, [scoresThisMonth])
  const ordinal = place.arrondissement === 1 ? 'er' : 'e'
  const todayHours = todayHoursLabel(place.opening_hours as Record<string, unknown> | null | undefined, new Date().getDay())
  const isClosed = todayHours ? /fermé/i.test(todayHours) : false
  const isNow = useMemo(() => {
    const now = new Date()
    return Math.abs(hour - (now.getHours() + (now.getMinutes() < 30 ? 0 : 0.5))) < 0.25
  }, [hour])

  const photoRefs = useMemo(() =>
    (place.photos ?? []).map(extractPhotoRef).filter((r): r is string => r !== null)
  , [place.photos])

  const galleryItems = useMemo(() => [
    ...photoRefs.map((ref, i) => ({ id: `g-${i}`, url: `/api/photo?ref=${encodeURIComponent(ref)}&w=900`, type: 'google' as const, caption: 'Photo Google Maps' })),
    ...reviews.flatMap(r => r.photos.map((u, pi) => ({
      id: `r-${r.id}-${pi}`, url: u, type: 'review' as const,
      caption: r.comment ? `${r.display_name}: ${r.comment}` : `${r.display_name} — Photo CielBleu`,
    }))),
  ], [photoRefs, reviews])

  const gmapsUrl = place.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${place.google_place_id}`
    : `https://maps.google.com/?q=${place.lat},${place.lng}(${encodeURIComponent(place.name)})`
  const gmapsDirUrl = `https://maps.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`
  const streetViewUrl = `https://maps.google.com/?cbll=${place.lat},${place.lng}&cbp=12,0,0,0,0&layer=c`

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleToggleFavorite = useCallback(async () => {
    if (!userId) { onOpenProfile?.(); return }
    if (isFavorite && favoriteId) {
      await supabase.from('favorites').delete().eq('id', favoriteId)
      setIsFavorite(false); setFavoriteId(null); setLikeCount(c => Math.max(0, c - 1))
    } else {
      const { data } = await supabase.from('favorites').insert({ user_id: userId, place_id: place.id }).select('id').single()
      if (data) { setIsFavorite(true); setFavoriteId(data.id); setLikeCount(c => c + 1) }
    }
  }, [userId, isFavorite, favoriteId, place.id, onOpenProfile])

  const handleShare = useCallback(async () => {
    const url = `https://cielbleu.fr/place/${place.id}`
    if (navigator?.share) { try { await navigator.share({ title: 'CielBleu — ' + place.name, url }); return } catch { /* cancelled */ } }
    if (navigator?.clipboard) { try { await navigator.clipboard.writeText(url); setShareToast(true); setTimeout(() => setShareToast(false), 2200) } catch { /* noop */ } }
  }, [place.id, place.name])

  const handleSunVote = useCallback(async (sunny: boolean) => {
    setSunVote(sunny ? 'sunny' : 'shady')
    await supabase.from('sun_votes').insert({ place_id: place.id, user_id: userId ?? null, device_id: deviceId, is_sunny: sunny, time_slot: slot })
    if (sunny) setSunnyVoteCount(c => (c ?? 0) + 1)
    setVoteToast(true); setTimeout(() => setVoteToast(false), 2000)
  }, [place.id, userId, deviceId, slot])

  const handleCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    if (!commentText.trim() && reviewPhotos.length === 0) { setCommentError('Ajoute un avis ou une photo.'); return }
    setCommentSending(true); setCommentError(null)
    const uploadedUrls: string[] = []
    for (const file of reviewPhotos) {
      const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { error: upErr } = await supabase.storage
        .from('review-photos').upload(path, file, { contentType: file.type })
      if (upErr) {
        setCommentSending(false)
        setCommentError(`Erreur upload photo : ${upErr.message}`)
        return
      }
      uploadedUrls.push(supabase.storage.from('review-photos').getPublicUrl(path).data.publicUrl)
    }
    const { error } = await supabase.from('reviews').insert({
      place_id: place.id, user_id: userId, device_id: deviceId,
      rating: 4, comment: commentText.trim() || null, is_anonymous: false, photos: uploadedUrls,
    })
    setCommentSending(false)
    if (error) { setCommentError('Erreur lors de la publication. Réessaie.'); return }
    setCommentSent(true); setCommentText('')
    reviewPhotoUrls.forEach(u => URL.revokeObjectURL(u))
    setReviewPhotos([]); setReviewPhotoUrls([])
    setTimeout(() => setCommentSent(false), 3000)
    loadReviews()
  }, [userId, commentText, place.id, deviceId, reviewPhotos, reviewPhotoUrls, loadReviews])

  // ── Snap helpers ──────────────────────────────────────────────────────────
  const snapTo = useCallback((target: SnapLevel) => {
    snapRef.current = target; setSnap(target)
    setTransformY(`translateY(${SNAP_Y[target]})`)
  }, [])

  const handleClose = useCallback(() => {
    const el = sheetRef.current
    if (el) { el.style.transition = 'transform 320ms cubic-bezier(0.32,0.72,0,1)'; el.style.transform = 'translateY(100%)' }
    setTimeout(onClose, 320)
  }, [onClose])

  const handleTouchStart = (e: React.TouchEvent) => {
    dragState.current = { startY: e.touches[0].clientY, currentY: 0, dragging: false, startTime: Date.now() }
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!sheetRef.current) return
    const deltaY = e.touches[0].clientY - dragState.current.startY
    // Seuil de 6px avant de considérer ça comme un drag (permet les taps sur boutons)
    if (!dragState.current.dragging && Math.abs(deltaY) < 6) return
    dragState.current.dragging = true
    dragState.current.currentY = deltaY
    sheetRef.current.style.transition = 'none'
    sheetRef.current.style.transform = `translateY(calc(${SNAP_Y[snapRef.current]} + ${Math.max(-80, deltaY)}px))`
  }
  const handleTouchEnd = useCallback(() => {
    if (!dragState.current.dragging) return
    dragState.current.dragging = false
    const delta = dragState.current.currentY
    const elapsed = Math.max(16, Date.now() - dragState.current.startTime)
    const velocity = delta / elapsed // px/ms : + = vers le bas = moins visible

    const cur = snapRef.current
    const vH = typeof window !== 'undefined' ? window.innerHeight * 0.92 : 800
    const px: Record<SnapLevel, number> = {
      1: 160, 2: 240, 3: 320, 4: 400, 5: 475,
      6: 545, 7: 615, 8: 685, 9: 750, 10: vH,
    }

    // Swipe rapide vers le bas depuis snap 1 → fermer
    if (cur === 1 && (velocity > 0.5 || delta > 110)) { handleClose(); return }

    // Pixels visibles actuels + projection par momentum (200 ms)
    const visibleNow = (px[cur] ?? 320) - delta
    const projected  = visibleNow - velocity * 200

    let nearest = cur
    let minDist = Infinity
    for (const [k, val] of Object.entries(px) as [string, number][]) {
      const dist = Math.abs(val - projected)
      if (dist < minDist) { minDist = dist; nearest = parseInt(k) as SnapLevel }
    }
    snapTo(nearest)
  }, [handleClose, snapTo])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Détails : ${place.name}`}
        className="absolute bottom-0 left-0 right-0 z-40"
        style={{ transform: transformY, transition: 'transform 400ms cubic-bezier(0.32,0.72,0,1)', maxHeight: '92dvh', fontFamily: 'var(--font-outfit)' }}
      >
        <div className="mx-auto w-full sm:max-w-md sm:mb-3 sm:px-3">
          <div
            className="rounded-t-[28px] sm:rounded-[28px] shadow-[0_-12px_40px_rgba(27,40,56,0.22)] flex flex-col overflow-hidden"
            style={{ height: '92dvh', background: 'rgba(255,252,243,0.97)', backdropFilter: 'blur(18px)' }}
          >

            {/* ── ZONE DRAGGABLE — handle + peek + action bar ───────────────────
                 touch-action:none sur le wrapper = toute la zone initie le drag.
                 Les boutons internes gardent leurs clicks (threshold 6px avant drag).   */}
            <div
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ flexShrink: 0, touchAction: 'none', userSelect: 'none', cursor: 'grab' }}
            >
              {/* Drag handle */}
              <div
                role="button" tabIndex={0} aria-label="Glisser pour agrandir ou réduire"
                className="flex items-center justify-center pt-3 pb-2 select-none"
                onKeyDown={e => {
                  if (e.key === 'ArrowUp') snapTo(Math.min(10, snap + 1) as SnapLevel)
                  if (e.key === 'ArrowDown') snap === 1 ? handleClose() : snapTo((snap - 1) as SnapLevel)
                }}
              >
                <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(11,31,58,0.18)' }} />
              </div>

              {/* Close button */}
              <button
                onClick={handleClose}
                aria-label="Fermer"
                className="absolute top-3 right-4 z-20"
                style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'rgba(20,32,51,0.08)', color: '#0b1f3a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}
              >
                <X size={16} strokeWidth={2.5} />
              </button>

              {/* ── PEEK ZONE ── */}
              <div style={{ padding: '0 16px 12px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8, paddingRight: 40 }}>
                  {isSunny && sunWindow && (
                    <span style={{ ...MINI_BADGE, background: '#fff1b8', color: '#5c3d00' }}>
                      ☀ Soleil {fmtSlotStart(sunWindow.fromSlot)} → {fmtSlotEnd(sunWindow.toSlot)}
                    </span>
                  )}
                  {place.has_terrace !== false && (
                    <span style={{ ...MINI_BADGE, background: 'rgba(79,143,101,0.10)', color: '#3d8554' }}>● Terrasse</span>
                  )}
                  <span style={MINI_BADGE}>
                    {TYPE_LABEL[place.type] ?? place.type}
                    {place.arrondissement != null && ` · ${place.arrondissement}${ordinal}`}
                  </span>
                </div>
                <h2 style={{ margin: 0, fontFamily: 'var(--font-playfair)', fontWeight: 700, fontSize: 'clamp(20px,6vw,26px)', lineHeight: 1.05, letterSpacing: '-0.03em', color: '#0b1f3a', paddingRight: 44 }}>
                  {place.name}
                </h2>
                {place.address && (
                  <p style={{ margin: '5px 0 0', color: '#6f7a8a', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
                    {place.address}
                  </p>
                )}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(20,32,51,0.08)', margin: '0 16px' }} />

              {/* ── BARRE D'ACTIONS ── */}
              <div style={{ padding: '7px 12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 38px 38px', gap: 7 }}>
                  <button
                    onClick={() => window.open(gmapsUrl, '_blank')}

                    aria-label="Ouvrir dans Google Maps"
                    style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, background: '#1F3A5F', color: '#fff', fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 12, border: 'none', cursor: 'pointer', touchAction: 'manipulation', boxShadow: '0 4px 12px rgba(31,58,95,0.22)' }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335"/>
                      <circle cx="12" cy="9" r="2.5" fill="white"/>
                    </svg>
                    Google Maps
                  </button>
                  <button
                    onClick={() => window.open(gmapsDirUrl, '_blank')}

                    aria-label="Y aller"
                    style={{ height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 12, background: '#EDC145', color: '#1F3A5F', fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 12, border: 'none', cursor: 'pointer', touchAction: 'manipulation', boxShadow: '0 4px 12px rgba(237,193,69,0.26)' }}>
                    📍&nbsp;Y aller
                  </button>
                  <button
                    onClick={handleToggleFavorite}

                    aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'} aria-pressed={isFavorite}
                    style={{ height: 38, borderRadius: 12, border: `1px solid ${isFavorite ? 'rgba(237,99,99,0.25)' : 'rgba(20,32,51,0.12)'}`, background: isFavorite ? 'rgba(255,99,99,0.16)' : 'rgba(255,255,255,0.96)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 1, touchAction: 'manipulation' }}>
                    <Heart size={14} fill={isFavorite ? '#D22D3D' : 'none'} stroke={isFavorite ? '#D22D3D' : '#1F3A5F'} strokeWidth={2.2} />
                    {likeCount > 0 && <span style={{ fontSize: 8, fontWeight: 800, color: isFavorite ? '#D22D3D' : '#1F3A5F', lineHeight: 1 }}>{likeCount}</span>}
                  </button>
                  <button
                    onClick={handleShare}

                    aria-label="Partager ce lieu"
                    style={{ height: 38, borderRadius: 12, border: '1px solid rgba(20,32,51,0.12)', background: 'rgba(255,255,255,0.96)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0b1f3a', touchAction: 'manipulation' }}>
                    <Share2 size={13} strokeWidth={2.2} />
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(20,32,51,0.08)', margin: '0 16px' }} />
            </div>{/* fin drag zone */}

            {/* ── SCROLLABLE CONTENT ────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'contain', minHeight: 0 }}>
              <div style={{ padding: '14px 16px 120px' }}>

                {/* ── SCORE BLOCK ── */}
                <div style={{
                  borderRadius: 20, padding: '14px 16px', marginBottom: 14,
                  background: score >= 4 ? '#FFF1B8' : score >= 3 ? 'rgba(255,190,11,0.10)' : 'rgba(141,153,174,0.10)',
                  border: `1px solid ${score >= 4 ? 'rgba(237,193,69,0.40)' : 'rgba(141,153,174,0.18)'}`,
                  display: 'flex', alignItems: 'center', gap: 14,
                }}>
                  <div style={{ fontSize: 38, fontFamily: 'var(--font-playfair)', fontWeight: 700, lineHeight: 1, color: score >= 4 ? '#5c3d00' : score >= 3 ? '#B57500' : '#6f7a8a' }}>
                    {scoresThisMonth !== null ? score : '…'}
                    {scoresThisMonth !== null && <span style={{ fontSize: 15, fontWeight: 600, opacity: 0.55 }}>/5</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 900, letterSpacing: '0.20em', textTransform: 'uppercase', color: score >= 4 ? '#5c3d00' : '#6f7a8a' }}>
                      {isNow ? 'Maintenant' : `À ${hourLabel}`}
                    </p>
                    <p style={{ margin: '3px 0 0', fontSize: 14, fontWeight: 700, color: score >= 4 ? '#3d2800' : score >= 3 ? '#8a5a00' : '#4a5568', lineHeight: 1.3 }}>
                      {SCORE_LABEL[score] ?? '—'}
                    </p>
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6f7a8a', fontWeight: 500 }}>
                      {place.has_terrace !== false ? 'Terrasse disponible' : 'Terrasse non confirmée'}
                    </p>
                  </div>
                </div>

                {/* ── 3-COL STATS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                  <button type="button" onClick={() => { window.location.href = gmapsUrl }}
                    style={{ ...STAT_CARD, textAlign: 'left', width: '100%', border: '1px solid rgba(20,32,51,0.09)' }}>
                    <strong style={{ display: 'block', color: '#0b1f3a', fontSize: 18, lineHeight: 1, fontWeight: 900 }}>
                      {place.google_rating != null ? place.google_rating.toFixed(1) : '—'}
                    </strong>
                    <span style={{ display: 'block', marginTop: 6, color: '#6f7a8a', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Note</span>
                  </button>
                  <button type="button" onClick={() => { window.location.href = gmapsUrl }}
                    style={{ ...STAT_CARD, textAlign: 'left', width: '100%', border: '1px solid rgba(20,32,51,0.09)' }}>
                    <strong style={{ display: 'block', color: '#0b1f3a', fontSize: 18, lineHeight: 1, fontWeight: 900 }}>
                      {place.price_level ? '€'.repeat(place.price_level) : '—'}
                    </strong>
                    <span style={{ display: 'block', marginTop: 6, color: '#6f7a8a', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Prix</span>
                  </button>
                  <div style={{ ...STAT_CARD, cursor: 'default' }}>
                    <strong style={{ display: 'block', color: '#0b1f3a', fontSize: 18, lineHeight: 1, fontWeight: 900 }}>
                      {score}/5
                    </strong>
                    <span style={{ display: 'block', marginTop: 6, color: '#6f7a8a', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Soleil</span>
                  </div>
                </div>

                {/* ── HORAIRES ── */}
                <div style={{ borderTop: '1px solid rgba(20,32,51,0.09)', paddingTop: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 9 }}>
                  <Clock size={14} strokeWidth={2.2} style={{ color: isClosed ? '#FF6B6B' : '#3A86FF', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ ...EYEBROW, display: 'block', marginBottom: 2 }}>Horaires aujourd&apos;hui</span>
                    {todayHours ? (
                      <span style={{ fontSize: 13, fontWeight: 700, color: isClosed ? '#FF6B6B' : '#1B2838' }}>{todayHours}</span>
                    ) : (
                      <button type="button" onClick={() => { window.location.href = gmapsUrl }}
                        style={{ fontSize: 13, fontWeight: 700, color: '#1F3A5F', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                        Voir sur Google Maps →
                      </button>
                    )}
                  </div>
                </div>

                {/* ── AVIS ── */}
                {reviews.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(20,32,51,0.09)', paddingTop: 14, marginBottom: 14 }}>
                    <p style={{ ...EYEBROW, marginBottom: 12 }}>Avis des visiteurs · {reviews.length}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {reviews.slice(0, 3).map(r => {
                        const initiale = (r.display_name ?? 'A').charAt(0).toUpperCase()
                        return (
                          <div key={r.id} style={{ borderRadius: 16, padding: '12px 14px', background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(20,32,51,0.08)', boxShadow: '0 2px 8px rgba(31,58,95,0.05)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <div style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0, background: 'rgba(237,193,69,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#b87c00' }}>{initiale}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#1F3A5F', display: 'block', lineHeight: 1.2 }}>{r.display_name}</span>
                                <span style={{ fontSize: 10, color: 'rgba(31,58,95,0.40)', fontWeight: 600 }}>{new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
                              </div>
                              <span style={{ fontSize: 13, color: '#EDC145', flexShrink: 0 }}>☀</span>
                              {userId && r.user_id === userId && (
                                <button onClick={async () => { await supabase.from('reviews').delete().eq('id', r.id).eq('user_id', userId!); setReviews(p => p.filter(x => x.id !== r.id)) }}
                                  aria-label="Supprimer mon avis"
                                  style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 6, color: 'rgba(224,82,82,0.65)', fontSize: 15, lineHeight: 1 }}>×</button>
                              )}
                            </div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1F3A5F', lineHeight: 1.55, borderLeft: '3px solid rgba(237,193,69,0.55)', paddingLeft: 10 }}>
                              {r.comment ?? 'Photo partagée depuis CielBleu'}
                            </p>
                            {r.photos.length > 0 && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                                {r.photos.slice(0, 3).map((u, pi) => (
                                  <button key={pi} type="button"
                                    onClick={() => setLightboxPhoto({ url: u, caption: r.comment ? `${r.display_name}: ${r.comment}` : `${r.display_name} — CielBleu` })}
                                    style={{ width: 76, height: 60, borderRadius: 8, overflow: 'hidden', border: 'none', padding: 0, background: 'none', cursor: 'pointer' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={u} alt="Avis photo" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* ── PHOTOS ── */}
                {galleryItems.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(20,32,51,0.09)', paddingTop: 14, marginBottom: 14 }}>
                    <p style={{ ...EYEBROW, marginBottom: 10 }}>Photos</p>
                    <div className="scrollbar-none" style={{ display: 'flex', gap: 8, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 4 }}>
                      {galleryItems.map((item, i) => (
                        <button key={item.id} type="button"
                          onClick={() => setLightboxPhoto({ url: item.url, caption: item.caption })}
                          style={{ flexShrink: 0, borderRadius: 14, overflow: 'hidden', width: i === 0 ? 200 : 140, height: i === 0 ? 130 : 96, scrollSnapAlign: 'start', boxShadow: '0 4px 14px rgba(11,31,58,0.12)', border: 'none', padding: 0, background: 'none', cursor: 'pointer', position: 'relative' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.url} alt={item.caption ?? place.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading={i === 0 ? 'eager' : 'lazy'} />
                          <div style={{ position: 'absolute', left: 8, bottom: 8, padding: '3px 7px', borderRadius: 999, background: 'rgba(0,0,0,0.52)', color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                            {item.type === 'review' ? 'CielBleu' : 'Google'}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── MAPS + STREET VIEW ── */}
                {place.lat && place.lng && (
                  <div style={{ borderTop: '1px solid rgba(20,32,51,0.09)', paddingTop: 14, marginBottom: 14 }}>
                    <p style={{ ...EYEBROW, marginBottom: 10 }}>Voir le lieu</p>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <button type="button" onClick={() => { window.location.href = gmapsUrl }}
                        style={{ borderRadius: 16, overflow: 'hidden', background: 'linear-gradient(135deg,#e8f0fe 0%,#c2d3fa 100%)', border: '1px solid rgba(66,133,244,0.25)', boxShadow: '0 4px 14px rgba(66,133,244,0.14)', padding: 0, cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                          <span style={{ fontSize: 22, flexShrink: 0 }}>🗺️</span>
                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <p style={{ margin: 0, fontWeight: 900, fontSize: 13, color: '#1a3fa7' }}>Ouvrir dans Google Maps</p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#3d6be4', fontWeight: 600 }}>Horaires · Avis · Itinéraire</p>
                          </div>
                          <span style={{ fontSize: 16, color: '#1a3fa7', flexShrink: 0 }}>→</span>
                        </div>
                      </button>
                      <button type="button" onClick={() => { window.location.href = streetViewUrl }}
                        style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 14px rgba(5,150,105,0.12)', border: '1px solid rgba(5,150,105,0.20)', position: 'relative', background: 'none', padding: 0, cursor: 'pointer' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/streetview?lat=${place.lat}&lng=${place.lng}&w=560&h=160&fov=90`}
                          alt={`Street View — ${place.name}`}
                          style={{ width: '100%', height: 110, objectFit: 'cover', display: 'block' }} loading="lazy" />
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top,rgba(4,30,16,0.68) 0%,transparent 100%)', padding: '18px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 900, fontSize: 12, color: '#fff' }}>🧍 Street View</p>
                            <p style={{ margin: '1px 0 0', fontSize: 10, color: 'rgba(255,255,255,0.78)', fontWeight: 600 }}>Voir la terrasse depuis la rue</p>
                          </div>
                          <span style={{ fontSize: 16, color: '#fff' }}>→</span>
                        </div>
                      </button>
                    </div>
                  </div>
                )}

                {/* ── ESPACE COMMUNAUTAIRE ── */}
                <div style={{ borderTop: '1px solid rgba(20,32,51,0.09)', paddingTop: 14, marginBottom: 14 }}>
                  <p style={{ ...EYEBROW, marginBottom: 14 }}>
                    {reviews.length > 0 ? 'Ajoute ton avis' : 'Sois le premier à donner ton avis'}
                  </p>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <button onClick={() => handleSunVote(true)} aria-pressed={sunVote === 'sunny'}
                      style={{ flex: 1, height: 44, borderRadius: 14, cursor: 'pointer', fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 13, background: sunVote === 'sunny' ? '#EDC145' : 'rgba(31,58,95,0.06)', color: sunVote === 'sunny' ? '#1F3A5F' : 'rgba(31,58,95,0.55)', boxShadow: sunVote === 'sunny' ? '0 6px 16px rgba(237,193,69,0.35)' : 'none', border: sunVote === 'sunny' ? '1.5px solid rgba(237,193,69,0.60)' : '1.5px solid transparent', transition: 'all 150ms', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      ☀️ Ensoleillé
                      {sunnyVoteCount != null && sunnyVoteCount > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.72, background: 'rgba(31,58,95,0.12)', borderRadius: 999, padding: '1px 6px', lineHeight: 1.5 }}>{sunnyVoteCount}</span>
                      )}
                    </button>
                    <button onClick={() => handleSunVote(false)} aria-pressed={sunVote === 'shady'}
                      style={{ flex: 1, height: 44, borderRadius: 14, cursor: 'pointer', fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 13, background: sunVote === 'shady' ? 'rgba(31,58,95,0.18)' : 'rgba(31,58,95,0.06)', color: sunVote === 'shady' ? '#1F3A5F' : 'rgba(31,58,95,0.55)', border: sunVote === 'shady' ? '1.5px solid rgba(31,58,95,0.30)' : '1.5px solid transparent', transition: 'all 150ms' }}>
                      🌑 À l&apos;ombre
                    </button>
                  </div>
                  {userId ? (
                    commentSent ? (
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#34A853', textAlign: 'center', padding: '8px 0' }}>Merci pour ton avis ! ☀️</p>
                    ) : (
                      <form onSubmit={handleCommentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                          placeholder="Partage ton expérience sur cette terrasse…"
                          rows={3} maxLength={400}
                          style={{ width: '100%', borderRadius: 14, padding: '11px 13px', border: '1.5px solid rgba(31,58,95,0.12)', background: 'rgba(31,58,95,0.04)', fontFamily: 'var(--font-outfit)', fontSize: 13, fontWeight: 600, color: '#1F3A5F', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                          {reviewPhotoUrls.map((u, i) => (
                            <div key={i} style={{ position: 'relative', width: 60, height: 60, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={u} alt={`Photo ${i+1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              <button type="button" onClick={() => { URL.revokeObjectURL(u); setReviewPhotos(p => p.filter((_, j) => j !== i)); setReviewPhotoUrls(p => p.filter((_, j) => j !== i)) }}
                                style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(11,31,58,0.72)', color: '#fff', cursor: 'pointer', fontSize: 11, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                aria-label="Supprimer cette photo">×</button>
                            </div>
                          ))}
                          {reviewPhotos.length < 3 && (
                            <button type="button" onClick={() => fileInputRef.current?.click()}
                              style={{ width: 60, height: 60, borderRadius: 10, border: '1.5px dashed rgba(31,58,95,0.20)', background: 'rgba(31,58,95,0.04)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: 'rgba(31,58,95,0.45)', flexShrink: 0 }}
                              aria-label="Ajouter une photo">
                              <span aria-hidden style={{ fontSize: 18 }}>📷</span>
                              <span style={{ fontSize: 9, fontFamily: 'var(--font-outfit)', fontWeight: 700, lineHeight: 1 }}>{reviewPhotos.length > 0 ? `${reviewPhotos.length}/3` : 'Photo'}</span>
                            </button>
                          )}
                          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file || reviewPhotos.length >= 3) return
                              const url = URL.createObjectURL(file)
                              setReviewPhotos(p => [...p, file]); setReviewPhotoUrls(p => [...p, url])
                              e.target.value = ''
                            }} />
                        </div>
                        <button type="submit" disabled={commentSending || (!commentText.trim() && reviewPhotos.length === 0)}
                          style={{ height: 42, borderRadius: 12, border: 'none', cursor: 'pointer', fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 13, background: (commentText.trim() || reviewPhotos.length > 0) ? '#1F3A5F' : 'rgba(31,58,95,0.08)', color: (commentText.trim() || reviewPhotos.length > 0) ? '#fff' : 'rgba(31,58,95,0.35)', transition: 'all 150ms' }}>
                          {commentSending ? '…' : 'Publier mon avis'}
                        </button>
                        {commentError && (
                          <p style={{ margin: 0, fontSize: 12, color: '#E05252', fontWeight: 700, background: 'rgba(224,82,82,0.08)', padding: '7px 11px', borderRadius: 10 }}>{commentError}</p>
                        )}
                      </form>
                    )
                  ) : (
                    <button onClick={onOpenProfile}
                      style={{ width: '100%', height: 42, borderRadius: 12, border: '1.5px dashed rgba(31,58,95,0.20)', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 13, color: 'rgba(31,58,95,0.55)' }}>
                      ✍️ Se connecter pour laisser un avis
                    </button>
                  )}
                </div>

              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── LIGHTBOX ──────────────────────────────────────────────────────────── */}
      {lightboxPhoto && (
        <div role="dialog" aria-modal="true" onClick={() => setLightboxPhoto(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(11,31,58,0.76)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'relative', width: '100%', maxWidth: 960, maxHeight: '90vh', borderRadius: 24, overflow: 'hidden', background: '#0b1f3a' }}>
            <button type="button" onClick={() => setLightboxPhoto(null)}
              style={{ position: 'absolute', top: 14, right: 14, zIndex: 10, width: 38, height: 38, borderRadius: 999, border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer', fontSize: 18 }}
              aria-label="Fermer l'aperçu photo">×</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightboxPhoto.url} alt={lightboxPhoto.caption ?? 'Photo agrandie'}
              style={{ width: '100%', height: 'auto', maxHeight: '82vh', objectFit: 'contain', display: 'block', background: '#111' }} />
            {lightboxPhoto.caption && (
              <div style={{ padding: '14px 18px', color: '#fff', fontSize: 13, lineHeight: 1.5, background: 'rgba(0,0,0,0.35)' }}>
                {lightboxPhoto.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TOASTS ────────────────────────────────────────────────────────────── */}
      {voteToast && (
        <div role="status" aria-live="polite"
          style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#1F3A5F', color: '#fff', padding: '8px 18px', borderRadius: 999, fontSize: 12, fontWeight: 700, zIndex: 50, boxShadow: '0 6px 20px rgba(31,58,95,0.28)', whiteSpace: 'nowrap' }}>
          {sunVote === 'sunny' ? '☀️ Vote enregistré !' : '🌑 Vote enregistré !'}
        </div>
      )}
      {shareToast && (
        <div role="status" aria-live="polite"
          style={{ position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)', background: '#0b1f3a', color: '#fff', padding: '8px 18px', borderRadius: 999, fontSize: 12, fontWeight: 700, zIndex: 50, boxShadow: '0 6px 20px rgba(11,31,58,0.28)', whiteSpace: 'nowrap' }}>
          Lien copié !
        </div>
      )}
    </>
  )
}

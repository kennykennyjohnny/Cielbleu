'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock, Share2, Heart } from 'lucide-react'
import type { Place } from '@/types'
import { supabase } from '@/lib/supabase'
import { todayHoursLabel } from '@/lib/openingHours'
import { compressImage } from '@/lib/imageCompress'
import { hourToSlot, formatHourLabel } from '@/lib/hourSlot'

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar', restaurant: 'Restaurant', cafe: 'Café', park: 'Parc',
}

// ── Style constants ────────────────────────────────────────────────────────────

const MINI_BADGE: React.CSSProperties = {
  minHeight:28, padding:'0 10px', borderRadius:999,
  background:'#fff', color:'#102a4c',
  fontSize:12, fontWeight:800,
  display:'inline-flex', alignItems:'center', gap:5,
  border:'1px solid rgba(20,32,51,0.10)',
}

const STAT_CARD: React.CSSProperties = {
  minHeight:70, padding:'11px 12px', borderRadius:18,
  background:'rgba(255,255,255,0.78)',
  border:'1px solid rgba(20,32,51,0.09)',
}

const EYEBROW: React.CSSProperties = {
  margin:0, color:'#6f7a8a', fontSize:11, fontWeight:800,
  textTransform:'uppercase', letterSpacing:'0.12em',
}

// INFO_ROW kept for potential future use
// const INFO_ROW: React.CSSProperties = { ... }

// ── Helpers ────────────────────────────────────────────────────────────────────

function slotFromHour(h: number): { slot: string; label: string; date: Date } {
  const slot = hourToSlot(h)
  const label = formatHourLabel(h)
  const d = new Date()
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
  return { slot, label, date: d }
}

function fmtSlotStart(slot: string): string {
  const [h, m] = slot.split(':').map(Number)
  return `${h}h${m === 0 ? '' : '30'}`
}

function fmtSlotEnd(slot: string): string {
  const [h, m] = slot.split(':').map(Number)
  let eH = h, eM = m + 30
  if (eM >= 60) { eM = 0; eH++ }
  return `${eH}h${eM === 0 ? '' : '30'}`
}

function computeSunWindow(
  scores: { time_slot: string; score: number }[]
): { fromSlot: string; toSlot: string } | null {
  const sorted = [...scores]
    .filter(s => { const [hh] = s.time_slot.split(':').map(Number); return hh >= 7 && hh <= 22 })
    .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
  let best = { start: -1, end: -1, len: 0 }
  let cur  = { start: -1, len: 0 }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].score >= 4) {
      if (cur.start < 0) cur.start = i
      cur.len++
      if (cur.len > best.len) best = { start: cur.start, end: i, len: cur.len }
    } else { cur = { start: -1, len: 0 } }
  }
  if (best.len === 0 || best.start < 0) return null
  return { fromSlot: sorted[best.start].time_slot, toSlot: sorted[best.end].time_slot }
}

function extractPhotoRef(url: string): string | null {
  try { return new URL(url).searchParams.get('photo_reference') } catch { return null }
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  place: Place
  scores: { time_slot: string; score: number }[]
  hour: number
  onHourChange: (h: number) => void
  // Quand fourni (page d'accueil inline), le bouton retour appelle onClose
  // au lieu de naviguer vers "/".
  onClose?: () => void
  /** ID Supabase de l'utilisateur connecté, null si anonyme */
  userId?: string | null
  /** Ouvre le panel Profil pour que l'utilisateur se connecte */
  onOpenProfile?: () => void
}

export default function PlacePageClient({ place, scores, hour, onClose, userId, onOpenProfile }: Props) {
  const [shareToast, setShareToast] = useState(false)

  // ── Community section state ─────────────────────────────────────────────────
  const [sunVote, setSunVote]       = useState<'sunny' | 'shady' | null>(null)
  const [voteToast, setVoteToast]   = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [commentSent, setCommentSent] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [reviews, setReviews]       = useState<{ id: string; comment: string | null; created_at: string; display_name?: string | null; user_id?: string | null; photos?: string[] }[]>([])
  const [sunnyVoteCount, setSunnyVoteCount] = useState<number | null>(null)

  // ── Review photos state ─────────────────────────────────────────────────────
  const [reviewPhotos, setReviewPhotos]       = useState<File[]>([])
  const [reviewPhotoUrls, setReviewPhotoUrls] = useState<string[]>([])
  const [lightboxPhoto, setLightboxPhoto]     = useState<{ url: string; caption?: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openLightbox = useCallback((url: string, caption?: string) => {
    setLightboxPhoto({ url, caption })
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxPhoto(null)
  }, [])

  // ── Favorites state ─────────────────────────────────────────────────────────
  const [isFavorite, setIsFavorite]   = useState(false)
  const [favoriteId, setFavoriteId]   = useState<string | null>(null)
  const [favLoading, setFavLoading]   = useState(false)

  // Génère / récupère un device_id persistant pour les votes anonymes
  const deviceId = useMemo<string>(() => {
    if (typeof window === 'undefined') return 'ssr'
    const key = 'hs_device_id'
    let id = localStorage.getItem(key)
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id) }
    return id
  }, [])

  // Charge le vote existant de cet utilisateur/device
  useEffect(() => {
    let cancelled = false
    async function loadVote() {
      const query = supabase.from('sun_votes').select('is_sunny').eq('place_id', place.id)
      const filtered = userId
        ? query.eq('user_id', userId)
        : query.eq('device_id', deviceId)
      const { data } = await filtered.order('created_at', { ascending: false }).limit(1)
      if (!cancelled && data?.[0]) setSunVote(data[0].is_sunny ? 'sunny' : 'shady')
    }
    loadVote()
    return () => { cancelled = true }
  }, [place.id, userId, deviceId])

  const scoreMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of scores) m[r.time_slot] = r.score
    return m
  }, [scores])

  const { slot } = slotFromHour(hour)
  const currentScore = scoreMap[slot] ?? place.currentScore ?? 3
  const isSunny = currentScore >= 4

  const sunWindow = useMemo(() => computeSunWindow(scores), [scores])

  const photoRefs = useMemo(() => {
    if (!place.photos?.length) return []
    return place.photos.map(extractPhotoRef).filter((r): r is string => r !== null)
  }, [place.photos])

  const reviewPhotoItems = useMemo(() => {
    return reviews.flatMap((r) =>
      (r.photos ?? []).map((photoUrl, pi) => ({
        id: `review-${r.id}-${pi}`,
        url: photoUrl,
        type: 'review' as const,
        caption: r.comment ? `${r.display_name}: ${r.comment}` : `${r.display_name} — Photo HopSoleil`,
      }))
    )
  }, [reviews])

  const galleryItems = useMemo(() => [
    ...photoRefs.map((ref, i) => ({
      id: `google-${i}`,
      url: `/api/photo?ref=${encodeURIComponent(ref)}&w=1200`,
      type: 'google' as const,
      caption: 'Photo Google Maps',
    })),
    ...reviewPhotoItems,
  ], [photoRefs, reviewPhotoItems])

  const ordinal = place.arrondissement === 1 ? 'er' : 'e'

  // URLs Google Maps — maps.google.com = Universal Link iOS/Android → ouvre l'appli
  // Coordonnées en destination plutôt que nom texte → plus fiable sur mobile
  // google_place_id → lien direct fiche Google (plus fiable sur mobile)
  const gmapsUrl    = place.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${place.google_place_id}`
    : `https://maps.google.com/?q=${place.lat},${place.lng}(${encodeURIComponent(place.name)})`
  const gmapsDirUrl = `https://maps.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`
  const streetViewUrl = `https://maps.google.com/?cbll=${place.lat},${place.lng}&cbp=12,0,0,0,0&layer=c`

  const handleShare = useCallback(async () => {
    // Toujours utiliser le domaine actuel (cielbleu.fr, hopleon.fr, preview Vercel…)
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://cielbleu.fr'
    const url = `${origin}/place/${place.id}`
    if (navigator?.share) { try { await navigator.share({ title: place.name + ' — CielBleu', url }); return } catch { /* cancelled */ } }
    if (navigator?.clipboard) { try { await navigator.clipboard.writeText(url); setShareToast(true); setTimeout(() => setShareToast(false), 2200) } catch { /* noop */ } }
  }, [place.id, place.name])

  const handleSunVote = useCallback(async (isSunny: boolean) => {
    const newVote: 'sunny' | 'shady' = isSunny ? 'sunny' : 'shady'
    setSunVote(newVote)
    const slot = hourToSlot(hour)
    await supabase.from('sun_votes').insert({
      place_id: place.id,
      user_id:  userId ?? null,
      device_id: deviceId,
      is_sunny: isSunny,
      time_slot: slot,
    })
    setVoteToast(true); setTimeout(() => setVoteToast(false), 2000)
  }, [place.id, userId, deviceId, hour])

  // ── Fetch reviews ────────────────────────────────────────────────────────────
  const loadReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, comment, created_at, user_id, photos')
      .eq('place_id', place.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error || !data) return

    const filtered = data.filter(r => {
      const hasComment = typeof r.comment === 'string' && r.comment.trim() !== ''
      const hasPhotos = Array.isArray(r.photos) && r.photos.length > 0
      return hasComment || hasPhotos
    })

    // Batch-fetch display_names (profiles lisibles par tous)
    const userIds = [...new Set(data.filter(r => r.user_id).map(r => r.user_id as string))]
    const profileMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)
      for (const p of profiles ?? []) {
        profileMap[p.id] = p.display_name ?? 'Soleiliste'
      }
    }

    setReviews(filtered.map(r => ({
      id: r.id,
      comment: r.comment,
      created_at: r.created_at,
      display_name: r.user_id ? (profileMap[r.user_id] ?? 'Soleiliste') : 'Anonyme',
      user_id: r.user_id ?? null,
      photos: (r.photos as string[] | null) ?? [],
    })))
  }, [place.id])

  useEffect(() => { loadReviews() }, [loadReviews])

  // ── Fetch sunny vote count ────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('sun_votes').select('id', { count: 'exact', head: true })
      .eq('place_id', place.id).eq('is_sunny', true)
      .then(({ count }) => { if (count != null) setSunnyVoteCount(count) })
  }, [place.id])

  const handleDeleteReview = useCallback(async (reviewId: string) => {
    await supabase.from('reviews').delete().eq('id', reviewId).eq('user_id', userId!)
    setReviews(prev => prev.filter(r => r.id !== reviewId))
  }, [userId])

  const handleCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || (!commentText.trim() && reviewPhotos.length === 0)) {
      if (!commentText.trim() && reviewPhotos.length === 0) {
        setCommentError('Ajoute un avis ou une photo avant de publier.')
      }
      return
    }
    setCommentSending(true)
    setCommentError(null)

    // Upload photos d'abord
    const uploadedUrls: string[] = []
    for (const file of reviewPhotos) {
      const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_')
      const path = `${userId}/${Date.now()}-${safeName}`
      const { error: upErr } = await supabase.storage
        .from('review-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false })
      if (upErr) {
        setCommentSending(false)
        const isSize = /size|large|exceed|payload/i.test(upErr.message)
        setCommentError(isSize
          ? 'Photo trop lourde. Essaie une image plus petite.'
          : `Upload échoué : ${upErr.message}`)
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('review-photos').getPublicUrl(path)
      uploadedUrls.push(publicUrl)
    }

    let { error } = await supabase.from('reviews').insert({
      place_id: place.id,
      user_id:  userId,
      device_id: deviceId,
      rating: 4,
      comment: commentText.trim() || null,
      is_anonymous: false,
      photos: uploadedUrls,
    })

    // Fallback : colonnes de base seulement (si migration_v2 pas encore appliquée)
    if (error) {
      const { error: err2 } = await supabase.from('reviews').insert({
        place_id: place.id,
        device_id: deviceId,
        rating: 4,
        comment: commentText.trim(),
        photos: uploadedUrls,
      })
      error = err2 ?? null
    }

    setCommentSending(false)
    if (error) {
      setCommentError('Erreur lors de la publication. Réessaie dans un instant.')
      return
    }
    setCommentSent(true)
    setCommentText('')
    reviewPhotoUrls.forEach(url => URL.revokeObjectURL(url))
    setReviewPhotos([])
    setReviewPhotoUrls([])
    setTimeout(() => setCommentSent(false), 3000)
    loadReviews()
  }, [userId, commentText, place.id, deviceId, reviewPhotos, reviewPhotoUrls, loadReviews])

  // ── Favorites ────────────────────────────────────────────────────────────────
  const [likeCount, setLikeCount] = useState<number>(0)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('place_like_counts')
      .select('like_count')
      .eq('place_id', place.id)
      .single()
      .then(({ data }) => { if (!cancelled && data) setLikeCount(data.like_count) })
    return () => { cancelled = true }
  }, [place.id])

  useEffect(() => {
    if (!userId) { setIsFavorite(false); setFavoriteId(null); return }
    let cancelled = false
    supabase.from('favorites').select('id').eq('user_id', userId).eq('place_id', place.id).single()
      .then(({ data }) => { if (!cancelled && data) { setIsFavorite(true); setFavoriteId(data.id) }})
    return () => { cancelled = true }
  }, [userId, place.id])

  const handleToggleFavorite = useCallback(async () => {
    if (!userId) { onOpenProfile?.(); return }
    setFavLoading(true)
    if (isFavorite && favoriteId) {
      await supabase.from('favorites').delete().eq('id', favoriteId)
      setIsFavorite(false); setFavoriteId(null)
      setLikeCount(c => Math.max(0, c - 1))
    } else {
      const { data } = await supabase.from('favorites').insert({ user_id: userId, place_id: place.id }).select('id').single()
      if (data) { setIsFavorite(true); setFavoriteId(data.id); setLikeCount(c => c + 1) }
    }
    setFavLoading(false)
  }, [userId, isFavorite, favoriteId, place.id, onOpenProfile])

  return (
    <div style={{ background:'transparent', fontFamily:'var(--font-outfit)', color:'#142033',
        display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* ═══════════ HEADER COMPACT : back + favoris ═══════════ */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 14px 12px' }}>
        {onClose ? (
          <button onClick={onClose} aria-label="Fermer" style={{ textDecoration:'none', flexShrink:0, background:'none', border:'none', padding:0, cursor:'pointer' }}>
            <div style={{ width:34, height:34, borderRadius:'50%',
              background:'rgba(20,32,51,0.07)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ArrowLeft size={16} strokeWidth={2.5} style={{ color:'#0b1f3a' }} />
            </div>
          </button>
        ) : (
          <Link href="/" aria-label="Retour à la carte"
            style={{ textDecoration:'none', flexShrink:0 }}>
            <div style={{ width:34, height:34, borderRadius:'50%',
              background:'rgba(20,32,51,0.07)',
              display:'flex', alignItems:'center', justifyContent:'center' }}>
              <ArrowLeft size={16} strokeWidth={2.5} style={{ color:'#0b1f3a' }} />
            </div>
          </Link>
        )}

        <div style={{ flex:1 }} />

        {/* Favoris */}
        <button
          onClick={handleToggleFavorite}
          disabled={favLoading}
          aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          style={{
            flexShrink: 0,
            minWidth: 42, height: 42,
            borderRadius: 18,
            border: '1px solid',
            borderColor: isFavorite ? 'rgba(237,99,99,0.25)' : 'rgba(20,32,51,0.12)',
            background: isFavorite ? 'rgba(255,99,99,0.16)' : 'rgba(255,255,255,0.96)',
            color: isFavorite ? '#D22D3D' : '#1F3A5F',
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '0 12px',
            fontSize: 14, fontWeight: 700, transition: 'all 150ms',
          }}
        >
          <Heart size={18} fill={isFavorite ? '#D22D3D' : 'none'} stroke={isFavorite ? '#D22D3D' : '#1F3A5F'} strokeWidth={2.2} />
          {likeCount > 0 && (
            <span style={{
              fontSize: 12, fontWeight: 800, lineHeight: 1,
              color: isFavorite ? '#D22D3D' : '#1F3A5F',
            }}>
              {likeCount}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════ SCROLLABLE PANEL ═══════════ */}
      <div style={{ flex:1, overflowY:'auto', overscrollBehavior:'contain', minHeight:0 }}>
      <div style={{ maxWidth:520, margin:'0 auto', padding:'0 14px 24px' }}>

        {/* ── PLACE HEAD ── */}
        <div style={{ padding:'18px 0 14px' }}>
          {/* Kicker row */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:11 }}>
            {isSunny && sunWindow && (
              <span style={{ ...MINI_BADGE, background:'#fff1b8', color:'#5c3d00' }}>
                ☀ Soleil {fmtSlotStart(sunWindow.fromSlot)} → {fmtSlotEnd(sunWindow.toSlot)}
              </span>
            )}
            <span style={{ ...MINI_BADGE, background:'rgba(79,143,101,0.10)', color:'#3d8554' }}>
              {place.type === 'park' ? '🌳 Parc' : '● Terrasse'}
            </span>
            {(place.type !== 'park' || place.arrondissement != null) && (
              <span style={{ ...MINI_BADGE }}>
                {place.type !== 'park' && (TYPE_LABEL[place.type] ?? place.type)}
                {place.type !== 'park' && place.arrondissement != null && ' \u00B7 '}
                {place.arrondissement != null && `${place.arrondissement}${ordinal}`}
              </span>
            )}
          </div>

          {/* Title (Fraunces) */}
          <h1 style={{ margin:0, fontFamily:'var(--font-fraunces)', fontWeight:700,
            fontSize:'clamp(28px,8vw,36px)', lineHeight:0.95, letterSpacing:'-0.06em',
            color:'#0b1f3a' }}>
            {place.name}
          </h1>

          {place.address && (
            <p style={{ margin:'10px 0 0', color:'#6f7a8a', fontSize:14, fontWeight:500, lineHeight:1.38 }}>
              {place.address}
            </p>
          )}
        </div>

        {/* ── QUICK STATS (3 cols) ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:0 }}>
          {/* Note — cliquable → fiche Google */}
          <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
            style={{ ...STAT_CARD, textDecoration:'none', display:'block', width:'100%', textAlign:'left' }}>
            <strong style={{ display:'block', color:'#0b1f3a', fontSize:20, lineHeight:1, fontWeight:900 }}>
              {place.google_rating != null ? place.google_rating.toFixed(1) : '—'}
            </strong>
            <span style={{ display:'block', marginTop:7, color:'#6f7a8a', fontSize:11,
              fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em' }}>
              Note <span style={{ fontSize:9, fontWeight:600, opacity:0.55, textTransform:'none', letterSpacing:0 }}>(google)</span>
            </span>
          </a>
          {/* Prix — cliquable → fiche Google */}
          <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
            style={{ ...STAT_CARD, textDecoration:'none', display:'block', width:'100%', textAlign:'left' }}>
            <strong style={{ display:'block', color:'#0b1f3a', fontSize:20, lineHeight:1, fontWeight:900 }}>
              {place.price_level ? '€'.repeat(place.price_level) : '—'}
            </strong>
            <span style={{ display:'block', marginTop:7, color:'#6f7a8a', fontSize:11,
              fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em' }}>
              Prix
            </span>
          </a>
          {/* Soleil — fenêtre signifiante au lieu d'une note vide */}
          <div style={{ ...STAT_CARD }}>
            <strong style={{ display:'block', color:'#0b1f3a', fontSize:20, lineHeight:1, fontWeight:900 }}>
              {sunWindow ? `→${fmtSlotEnd(sunWindow.toSlot)}` : isSunny ? '☀️' : '🌑'}
            </strong>
            <span style={{ display:'block', marginTop:7, color:'#6f7a8a', fontSize:11,
              fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em' }}>
              {sunWindow ? 'Soleil jusqu’à' : isSunny ? 'Au soleil' : 'À l’ombre'}
            </span>
          </div>
        </div>

        {/* ── AVIS DES VISITEURS ── */}
        {reviews.length > 0 && (
          <div style={{ borderTop:'1px solid rgba(20,32,51,0.10)', marginTop:14, paddingTop:15 }}>
            <p style={{ ...EYEBROW, marginBottom:12 }}>Avis des visiteurs · {reviews.length}</p>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {reviews.map(r => {
                const initiale = (r.display_name ?? 'A').charAt(0).toUpperCase()
                return (
                  <div key={r.id} style={{
                    borderRadius:16, padding:'12px 14px',
                    background:'rgba(255,255,255,0.82)',
                    border:'1px solid rgba(20,32,51,0.08)',
                    boxShadow:'0 2px 8px rgba(31,58,95,0.05)',
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <div style={{
                        width:30, height:30, borderRadius:'50%', flexShrink:0,
                        background:'rgba(237,193,69,0.18)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:12, fontWeight:900, color:'#b87c00',
                      }}>{initiale}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <span style={{ fontSize:12, fontWeight:800, color:'#1F3A5F', display:'block', lineHeight:1.2 }}>
                          {r.display_name ?? 'Anonyme'}
                        </span>
                        <span style={{ fontSize:10.5, color:'rgba(31,58,95,0.40)', fontWeight:600 }}>
                          {new Date(r.created_at).toLocaleDateString('fr-FR', { day:'numeric', month:'long' })}
                        </span>
                      </div>
                      <span style={{ fontSize:13, color:'#EDC145', flexShrink:0 }}>☀</span>
                      {userId && r.user_id === userId && (
                        <button onClick={() => handleDeleteReview(r.id)}
                          aria-label="Supprimer mon avis"
                          style={{ flexShrink:0, background:'none', border:'none', cursor:'pointer',
                            padding:'2px 4px', borderRadius:6, color:'rgba(224,82,82,0.65)',
                            fontSize:15, lineHeight:1 }}>
                          ×
                        </button>
                      )}
                    </div>
                    <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#1F3A5F', lineHeight:1.55,
                      borderLeft:'3px solid rgba(237,193,69,0.55)', paddingLeft:10 }}>
                      {r.comment ?? 'Photo partagée depuis HopSoleil'}
                    </p>
                    {r.photos && r.photos.length > 0 && (
                      <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
                        {r.photos.map((photoUrl, pi) => (
                          <button
                            key={pi}
                            type="button"
                            onClick={() => openLightbox(photoUrl, r.comment ? `${r.display_name}: ${r.comment}` : `${r.display_name} — Photo HopSoleil`)}
                            style={{ width:80, height:62, borderRadius:8, overflow:'hidden', border:'none', padding:0, background:'none', cursor:'pointer' }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoUrl} alt={r.comment ?? 'Photo HopSoleil'}
                              style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
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

        {/* ── HORAIRES ── */}
        {(() => {
          const hoursLabel = todayHoursLabel(
            place.opening_hours as Record<string, unknown> | null | undefined,
            new Date().getDay()
          )
          const isClosed = hoursLabel ? /fermé/i.test(hoursLabel) : false
          return (
            <div style={{ borderTop:'1px solid rgba(20,32,51,0.10)', marginTop:14, paddingTop:14,
              display:'flex', alignItems:'center', gap:9 }}>
              <Clock size={15} strokeWidth={2.2} style={{ color: isClosed ? '#FF6B6B' : '#3A86FF', flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <span style={{ fontSize:10, fontWeight:900, letterSpacing:'0.15em',
                  textTransform:'uppercase', color:'#8D99AE', display:'block', marginBottom:2 }}>Horaires aujourd&apos;hui</span>
                {hoursLabel ? (
                  <span style={{ fontSize:13, fontWeight:700,
                    color: isClosed ? '#FF6B6B' : '#1B2838' }}>{hoursLabel}</span>
                ) : (
                  <a
                    href={place.google_maps_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + place.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize:13, fontWeight:700, color:'#1F3A5F', textDecoration:'none' }}
                  >
                    Voir sur Google Maps →
                  </a>
                )}
              </div>
            </div>
          )
        })()}

        {/* ── PHOTOS ── */}
        {galleryItems.length > 0 && (
          <div style={{ borderTop:'1px solid rgba(20,32,51,0.10)', marginTop:14, paddingTop:15 }}>
            <p style={{ ...EYEBROW, marginBottom:10 }}>Photos</p>
            <div className="scrollbar-none"
              style={{ display:'flex', gap:8, overflowX:'auto', scrollSnapType:'x mandatory', paddingBottom:4 }}>
              {galleryItems.map((item, i) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openLightbox(item.url, item.caption)}
                  style={{
                    flexShrink:0,
                    borderRadius:16,
                    overflow:'hidden',
                    width:i===0?240:170,
                    height:i===0?156:116,
                    scrollSnapAlign:'start',
                    boxShadow:'0 6px 20px rgba(11,31,58,0.14)',
                    border:'none',
                    padding:0,
                    background:'none',
                    cursor:'pointer',
                    position:'relative',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.caption ?? `${place.name} — photo`}
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                  <div style={{ position:'absolute', left:10, bottom:10, padding:'4px 8px', borderRadius:999,
                    background:'rgba(0,0,0,0.55)', color:'#fff', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                    {item.type === 'review' ? 'HopSoleil' : 'Google'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── MAPS + STREET VIEW ── */}
        {place.lat && place.lng && (
          <div style={{ borderTop:'1px solid rgba(20,32,51,0.10)', marginTop:14, paddingTop:15 }}>
            <p style={{ ...EYEBROW, marginBottom:10 }}>Voir le lieu</p>
            <div style={{ display:'grid', gap:8 }}>

              {/* Google Maps — maps.google.com = Universal Link → ouvre l'appli sur iOS/Android */}
              <a href={gmapsUrl} target="_blank" rel="noopener noreferrer"
                style={{ textDecoration:'none', display:'block',
                  borderRadius:18, overflow:'hidden',
                  background:'linear-gradient(135deg,#e8f0fe 0%,#c2d3fa 100%)',
                  border:'1px solid rgba(66,133,244,0.25)',
                  boxShadow:'0 4px 16px rgba(66,133,244,0.15)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px' }}>
                  <span style={{ fontSize:28, flexShrink:0 }}>🗺️</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontWeight:900, fontSize:14, color:'#1a3fa7' }}>Ouvrir dans Google Maps</p>
                    <p style={{ margin:'2px 0 0', fontSize:12, color:'#3d6be4', fontWeight:600 }}>
                      Horaires · Avis · Itinéraire
                    </p>
                  </div>
                  <span style={{ fontSize:18, flexShrink:0 }}>→</span>
                </div>
              </a>

              {/* Street View — miniature cliquable */}
              <a
                href={streetViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration:'none', display:'block', borderRadius:18, overflow:'hidden',
                  boxShadow:'0 4px 16px rgba(5,150,105,0.14)',
                  border:'1px solid rgba(5,150,105,0.22)', position:'relative' }}>
                {/* Thumbnail Street View */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/streetview?lat=${place.lat}&lng=${place.lng}&w=560&h=180&fov=90`}
                  alt={`Street View — ${place.name}`}
                  style={{ width:'100%', height:130, objectFit:'cover', display:'block' }}
                  loading="lazy"
                />
                {/* Overlay label */}
                <div style={{ position:'absolute', bottom:0, left:0, right:0,
                  background:'linear-gradient(to top, rgba(4,30,16,0.70) 0%, transparent 100%)',
                  padding:'20px 14px 10px',
                  display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div>
                    <p style={{ margin:0, fontWeight:900, fontSize:13, color:'#fff' }}>🧍 Street View</p>
                    <p style={{ margin:'1px 0 0', fontSize:11, color:'rgba(255,255,255,0.78)', fontWeight:600 }}>
                      Voir la terrasse depuis la rue
                    </p>
                  </div>
                  <span style={{ fontSize:18, color:'#fff' }}>→</span>
                </div>
              </a>

              {place.instagram_url && (
                <a href={place.instagram_url} target="_blank" rel="noopener noreferrer"
                  style={{ textDecoration:'none', display:'block', borderRadius:18,
                    background:'linear-gradient(135deg,#fdf0f9 0%,#f9c6e9 100%)',
                    border:'1px solid rgba(180,60,150,0.20)',
                    boxShadow:'0 4px 16px rgba(180,60,150,0.10)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px' }}>
                    <span style={{ fontSize:28, flexShrink:0 }}>📸</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontWeight:900, fontSize:14, color:'#7e1d6a' }}>Instagram</p>
                      <p style={{ margin:'2px 0 0', fontSize:12, color:'#b43c96', fontWeight:600 }}>Voir le compte</p>
                    </div>
                    <span style={{ fontSize:18, flexShrink:0 }}>→</span>
                  </div>
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ ESPACE COMMUNAUTAIRE ═══════════ */}
      <div style={{ padding:'0 14px 20px', borderTop:'1px solid rgba(20,32,51,0.07)', marginTop:6, paddingTop:18 }}>
        <p style={{ ...EYEBROW, marginBottom:14 }}>
          {reviews.length > 0 ? 'Ajoute ton avis' : 'Sois le premier à donner ton avis'}
        </p>

        {/* ── Votes soleil (accessibles sans connexion) ── */}
        <div style={{ display:'flex', gap:10, marginBottom:20 }}>
          <button
            onClick={() => handleSunVote(true)}
            style={{
              flex:1, height:46, borderRadius:14, cursor:'pointer',
              fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:14,
              background: sunVote === 'sunny' ? '#EDC145' : 'rgba(31,58,95,0.06)',
              color: sunVote === 'sunny' ? '#1F3A5F' : 'rgba(31,58,95,0.55)',
              boxShadow: sunVote === 'sunny' ? '0 6px 16px rgba(237,193,69,0.35)' : 'none',
              border: sunVote === 'sunny' ? '1.5px solid rgba(237,193,69,0.60)' : '1.5px solid transparent',
              transition:'all 150ms',
              display:'flex', alignItems:'center', justifyContent:'center', gap:6,
            }}
            aria-pressed={sunVote === 'sunny'}
          >
            ☀️ Ensoleillé
            {sunnyVoteCount != null && sunnyVoteCount > 0 && (
              <span style={{ fontSize:11, fontWeight:700, opacity:0.72,
                background:'rgba(31,58,95,0.12)', borderRadius:999,
                padding:'1px 7px', lineHeight:1.5 }}>
                {sunnyVoteCount}
              </span>
            )}
          </button>
          <button
            onClick={() => handleSunVote(false)}
            style={{
              flex:1, height:46, borderRadius:14, cursor:'pointer',
              fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:14,
              background: sunVote === 'shady' ? 'rgba(31,58,95,0.18)' : 'rgba(31,58,95,0.06)',
              color: sunVote === 'shady' ? '#1F3A5F' : 'rgba(31,58,95,0.55)',
              border: sunVote === 'shady' ? '1.5px solid rgba(31,58,95,0.30)' : '1.5px solid transparent',
              transition:'all 150ms',
            }}
            aria-pressed={sunVote === 'shady'}
          >
            🌑 À l&apos;ombre
          </button>
        </div>

        {/* ── Commentaires — gated derrière auth ── */}
        {userId
          ? (
            commentSent
              ? <p style={{ fontSize:13, fontWeight:800, color:'#34A853', textAlign:'center', padding:'8px 0' }}>
                  Merci pour ton avis ! ☀️
                </p>
              : (
                <form onSubmit={handleCommentSubmit} style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    placeholder="Partage ton expérience sur cette terrasse…"
                    rows={3}
                    maxLength={400}
                    style={{
                      width:'100%', borderRadius:14, padding:'11px 13px',
                      border:'1.5px solid rgba(31,58,95,0.12)',
                      background:'rgba(31,58,95,0.04)',
                      fontFamily:'var(--font-outfit)', fontSize:13, fontWeight:600,
                      color:'#1F3A5F', resize:'none', outline:'none', boxSizing:'border-box',
                    }}
                  />

                  {/* ─ Photos ─ */}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {reviewPhotoUrls.map((url, i) => (
                      <div key={i} style={{ position:'relative', width:64, height:64,
                        borderRadius:10, overflow:'hidden', flexShrink:0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Photo ${i+1}`}
                          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(url)
                            setReviewPhotos(p => p.filter((_, j) => j !== i))
                            setReviewPhotoUrls(p => p.filter((_, j) => j !== i))
                          }}
                          style={{ position:'absolute', top:3, right:3, width:18, height:18,
                            borderRadius:'50%', border:'none', background:'rgba(11,31,58,0.72)',
                            color:'#fff', cursor:'pointer', fontSize:11, lineHeight:1,
                            display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}
                          aria-label="Supprimer cette photo"
                        >×</button>
                      </div>
                    ))}
                    {reviewPhotos.length < 3 && (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{ width:64, height:64, borderRadius:10,
                          border:'1.5px dashed rgba(31,58,95,0.20)',
                          background:'rgba(31,58,95,0.04)', cursor:'pointer',
                          display:'flex', flexDirection:'column', alignItems:'center',
                          justifyContent:'center', gap:3, color:'rgba(31,58,95,0.45)',
                          flexShrink:0 }}
                        aria-label="Ajouter une photo"
                      >
                        <span aria-hidden style={{ fontSize:20 }}>📷</span>
                        <span style={{ fontSize:9, fontFamily:'var(--font-outfit)', fontWeight:700, lineHeight:1 }}>
                          {reviewPhotos.length > 0 ? `${reviewPhotos.length}/3` : 'Photo'}
                        </span>
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display:'none' }}
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file || reviewPhotos.length >= 3) return
                        const compressed = await compressImage(file).catch(() => file)
                        const url = URL.createObjectURL(compressed)
                        setReviewPhotos(p => [...p, compressed])
                        setReviewPhotoUrls(p => [...p, url])
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={commentSending || (!commentText.trim() && reviewPhotos.length === 0)}
                    style={{
                      height:42, borderRadius:12, border:'none', cursor:'pointer',
                      fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:13,
                      background: (commentText.trim() || reviewPhotos.length > 0) ? '#1F3A5F' : 'rgba(31,58,95,0.08)',
                      color: (commentText.trim() || reviewPhotos.length > 0) ? '#fff' : 'rgba(31,58,95,0.35)',
                      transition:'all 150ms',
                    }}
                  >
                    {commentSending ? '…' : 'Publier mon avis'}
                  </button>
                  {commentError && (
                    <p style={{ margin: 0, fontSize: 12, color: '#E05252', fontWeight: 700, background: 'rgba(224,82,82,0.08)', padding: '7px 11px', borderRadius: 10 }}>
                      {commentError}
                    </p>
                  )}
                </form>
              )
          )
          : (
            <button
              onClick={onOpenProfile}
              style={{
                width:'100%', height:42, borderRadius:12, border:'1.5px dashed rgba(31,58,95,0.20)',
                background:'transparent', cursor:'pointer',
                fontFamily:'var(--font-outfit)', fontWeight:800, fontSize:13,
                color:'rgba(31,58,95,0.55)',
              }}
            >
              ✍️ Se connecter pour laisser un avis
            </button>
          )
        }

      </div>
      </div>{/* /scroll-wrapper */}

      {lightboxPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={closeLightbox}
          style={{
            position:'fixed', inset:0, zIndex:60,
            background:'rgba(11,31,58,0.72)', display:'flex', alignItems:'center', justifyContent:'center', padding:20,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{ position:'relative', width:'100%', maxWidth:960, maxHeight:'90vh', borderRadius:24, overflow:'hidden', background:'#0b1f3a' }}
          >
            <button
              type="button"
              onClick={closeLightbox}
              style={{ position:'absolute', top:14, right:14, zIndex:10,
                width:38, height:38, borderRadius:999, border:'none', background:'rgba(255,255,255,0.18)', color:'#fff', cursor:'pointer', fontSize:18 }}
              aria-label="Fermer l'aperçu photo"
            >
              ×
            </button>
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.caption ?? 'Photo agrandie'}
              style={{ width:'100%', height:'auto', maxHeight:'82vh', objectFit:'contain', display:'block', background:'#111' }}
            />
            {lightboxPhoto.caption && (
              <div style={{ padding:'14px 18px', color:'#fff', fontSize:13, lineHeight:1.5, background:'rgba(0,0,0,0.35)' }}>
                {lightboxPhoto.caption}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vote toast */}
      {voteToast && (
        <div role="status" aria-live="polite"
          style={{ position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)',
            background:'#1F3A5F', color:'#fff', padding:'8px 18px',
            borderRadius:999, fontSize:12, fontWeight:700, zIndex:50,
            boxShadow:'0 6px 20px rgba(31,58,95,0.28)', whiteSpace:'nowrap' }}>
          {sunVote === 'sunny' ? '☀️ Vote enregistré !' : '🌑 Vote enregistré !'}
        </div>
      )}

      {/* ═══════════ ACTION BAR ═══════════ */}
      <div style={{ zIndex:40, flexShrink:0,
        paddingBottom:'max(env(safe-area-inset-bottom,0px),12px)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 44px', gap:8,
          margin:'0 12px', padding:'12px 12px 14px',
          background:'rgba(255,252,243,0.94)', backdropFilter:'blur(18px)',
          borderRadius:'24px 24px 0 0',
          borderTop:'1px solid rgba(20,32,51,0.10)',
          boxShadow:'0 -4px 24px rgba(11,31,58,0.12)' }}>

          {/* Primary: Ouvrir dans Google Maps — <a target="_blank"> = Universal Link iOS, nouvel onglet desktop */}
          <a
            href={gmapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ouvrir dans Google Maps"
            style={{ height:46, display:'flex', alignItems:'center', justifyContent:'center', gap:7,
              borderRadius:14, background:'#1F3A5F', color:'#fff',
              fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:14, border:'none',
              cursor:'pointer', touchAction:'manipulation', textDecoration:'none',
              boxShadow:'0 8px 20px rgba(31,58,95,0.28)' }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink:0 }}>
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335"/>
              <circle cx="12" cy="9" r="2.5" fill="white"/>
            </svg>
            Google Maps
          </a>

          {/* Secondary: Itinéraire */}
          <a
            href={gmapsDirUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Y aller"
            style={{ height:46, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              borderRadius:14, background:'#EDC145', color:'#1F3A5F',
              fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:14, border:'none',
              cursor:'pointer', touchAction:'manipulation', textDecoration:'none',
              boxShadow:'0 8px 20px rgba(237,193,69,0.35)' }}
          >
            📍&nbsp;Y aller
          </a>

          {/* Share */}
          <button onClick={handleShare} aria-label="Partager ce lieu"
            style={{ height:46, border:'1px solid rgba(20,32,51,0.10)', borderRadius:14,
              background:'#fff', cursor:'pointer', display:'flex', alignItems:'center',
              justifyContent:'center', gap:6, padding:'0 14px', color:'#0b1f3a' }}>
            <Share2 size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Share toast */}
      {shareToast && (
        <div role="status" aria-live="polite"
          style={{ position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)',
            background:'#0b1f3a', color:'#fff', padding:'8px 18px',
            borderRadius:999, fontSize:12, fontWeight:700, zIndex:50,
            boxShadow:'0 6px 20px rgba(11,31,58,0.28)', whiteSpace:'nowrap' }}>
          Lien copié !
        </div>
      )}
    </div>
  )
}
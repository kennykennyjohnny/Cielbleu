'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock } from 'lucide-react'
import type { Place } from '@/types'
import { supabase } from '@/lib/supabase'
import { todayHoursLabel } from '@/lib/openingHours'

// ── Constants ─────────────────────────────────────────────────────────────────

const SCORE_LABEL: Record<number, string> = {
  0: 'Nuit', 1: 'À l\u2019ombre', 2: 'Peu ensoleillé',
  3: 'Ensoleillement', 4: 'Très lumineux', 5: 'Plein soleil',
}

const SCORE_SENTENCES: Record<number, string> = {
  0: 'Nuit tombée — terrasse probablement fermée.',
  1: 'La rue reste ombragée à cet horaire. Trop tôt ou trop tard.',
  2: 'Mi-ombre pour l\u2019instant. Reste agréable avec une bière fraîche.',
  3: 'Bon ensoleillement doux sur la terrasse.',
  4: 'Très ensoleillée — profites-en, ça ne va pas durer !',
  5: 'Plein soleil maintenant. C\u2019est le moment idéal.',
}

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar', restaurant: 'Restaurant', cafe: 'Café', park: 'Parc',
}

// Timeline bar height (px, inside 28px row) and colors by score 0..5
const BAR_PX    = [4, 8, 12, 18, 24, 28]
const BAR_COLORS = ['#102a4c', '#98a2b3', '#98a2b3', '#f77f00', '#ffd76a', '#ffb703']

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

function halfHourToSlot(h: number): { slot: string; label: string; date: Date } {
  const hour = Math.floor(h)
  const min  = h % 1 ? 30 : 0
  const slot = `${String(hour).padStart(2,'0')}:${min === 0 ? '00' : '30'}`
  const label = `${hour}h${min ? '30' : ''}`
  const d = new Date()
  d.setHours(hour, min, 0, 0)
  return { slot, label, date: d }
}

function nowHalfHour(): number {
  const now = new Date()
  return Math.max(6, Math.min(23.5, now.getHours() + (now.getMinutes() >= 30 ? 0.5 : 0)))
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

export default function PlacePageClient({ place, scores, hour, onHourChange, onClose, userId, onOpenProfile }: Props) {
  const setHour = onHourChange
  const [shareToast, setShareToast] = useState(false)

  // ── Community section state ─────────────────────────────────────────────────
  const [sunVote, setSunVote]       = useState<'sunny' | 'shady' | null>(null)
  const [voteToast, setVoteToast]   = useState(false)
  const [commentText, setCommentText] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [commentSent, setCommentSent] = useState(false)
  const [reviews, setReviews]       = useState<{ id: string; comment: string | null; created_at: string; display_name?: string | null }[]>([])

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

  const { slot, label: hourLabel } = halfHourToSlot(hour)
  const currentScore = scoreMap[slot] ?? place.currentScore ?? 3
  const isNow   = Math.abs(hour - nowHalfHour()) < 0.26
  const isSunny = currentScore >= 4

  const sunWindow = useMemo(() => computeSunWindow(scores), [scores])

  const timeline = useMemo(() =>
    scores
      .filter(s => {
        const [hh] = s.time_slot.split(':').map(Number)
        return hh >= 8 && hh <= 22 && s.time_slot.endsWith(':00')
      })
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
    [scores]
  )

  // "now" red line position in timeline (8h-22h → 0-100%)
  const nowLinePct = useMemo(() => {
    const h = nowHalfHour()
    return Math.max(0, Math.min(100, ((h - 8) / (22 - 8)) * 100))
  }, [])

  const currentHourSlot = `${String(Math.floor(hour)).padStart(2,'0')}:00`

  const photoRefs = useMemo(() => {
    if (!place.photos?.length) return []
    return place.photos.map(extractPhotoRef).filter((r): r is string => r !== null)
  }, [place.photos])

  const ordinal = place.arrondissement === 1 ? 'er' : 'e'

  const sunSentence = SCORE_SENTENCES[currentScore] ?? ''

  // Score badge colors (hero top)
  const scoreBadgeStyle: React.CSSProperties =
    currentScore >= 4
      ? { background:'rgba(255,183,3,0.94)', color:'#0b1f3a', border:'1px solid rgba(255,255,255,0.72)' }
      : currentScore >= 2
        ? { background:'rgba(255,255,255,0.90)', color:'#0b1f3a', border:'1px solid rgba(20,32,51,0.12)' }
        : { background:'rgba(10,25,42,0.88)',    color:'#a8c8e8', border:'1px solid rgba(255,255,255,0.12)' }

  const handleShare = useCallback(async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    if (navigator?.share) { try { await navigator.share({ title: 'HopSoleil — ' + place.name, url }); return } catch { /* cancelled */ } }
    if (navigator?.clipboard) { try { await navigator.clipboard.writeText(url); setShareToast(true); setTimeout(() => setShareToast(false), 2200) } catch { /* noop */ } }
  }, [place.name])

  const handleSunVote = useCallback(async (isSunny: boolean) => {
    const newVote: 'sunny' | 'shady' = isSunny ? 'sunny' : 'shady'
    setSunVote(newVote)
    const slot = `${String(Math.floor(hour)).padStart(2,'0')}:${hour % 1 ? '30' : '00'}`
    await supabase.from('sun_votes').insert({
      place_id: place.id,
      user_id:  userId ?? null,
      device_id: deviceId,
      is_sunny: isSunny,
      time_slot: slot,
    })
    setVoteToast(true); setTimeout(() => setVoteToast(false), 2000)
  }, [place.id, userId, deviceId, hour])

  const handleCommentSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId || !commentText.trim()) return
    setCommentSending(true)
    await supabase.from('reviews').insert({
      place_id: place.id,
      user_id:  userId,
      device_id: deviceId,
      rating: 4, // vote neutre par défaut — l'ensoleillement est le vrai critère
      comment: commentText.trim(),
      is_anonymous: false,
    })
    setCommentSending(false)
    setCommentSent(true)
    setCommentText('')
    setTimeout(() => setCommentSent(false), 3000)
    // Recharge les avis
    loadReviews()
  }, [userId, commentText, place.id, deviceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch reviews ────────────────────────────────────────────────────────────
  const loadReviews = useCallback(async () => {
    const { data } = await supabase
      .from('reviews')
      .select('id, comment, created_at, profile:profiles(display_name)')
      .eq('place_id', place.id)
      .not('comment', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10)
    if (data) {
      setReviews(data.map((r: { id: string; comment: string | null; created_at: string; profile?: { display_name?: string | null } | null | { display_name?: string | null }[] }) => ({
        id: r.id,
        comment: r.comment,
        created_at: r.created_at,
        display_name: Array.isArray(r.profile) ? r.profile[0]?.display_name : (r.profile as { display_name?: string | null } | null)?.display_name,
      })))
    }
  }, [place.id])

  useEffect(() => { loadReviews() }, [loadReviews])

  // ── Favorites ────────────────────────────────────────────────────────────────
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
    } else {
      const { data } = await supabase.from('favorites').insert({ user_id: userId, place_id: place.id }).select('id').single()
      if (data) { setIsFavorite(true); setFavoriteId(data.id) }
    }
    setFavLoading(false)
  }, [userId, isFavorite, favoriteId, place.id, onOpenProfile])

  return (
    <div style={{ background:'transparent', fontFamily:'var(--font-outfit)', color:'#142033' }}>

      {/* ═══════════ HEADER COMPACT : score badge + heure + back ═══════════ */}
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

        {/* ❤️ Bouton favori */}
        <button
          onClick={handleToggleFavorite}
          disabled={favLoading}
          aria-label={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          style={{
            flexShrink: 0,
            width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: isFavorite ? 'rgba(255,99,99,0.12)' : 'rgba(20,32,51,0.06)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, transition: 'all 150ms',
          }}
        >
          {isFavorite ? '❤️' : '🤍'}
        </button>

        <div style={{ flexShrink:0, minWidth:60, textAlign:'center',
          background:isNow ? 'rgba(255,183,3,0.92)' : 'rgba(20,32,51,0.06)',
          color:'#0b1f3a', borderRadius:10, padding:'5px 10px' }}>
          <p style={{ margin:0, fontSize:11, fontWeight:800, lineHeight:1 }}>
            {isNow ? 'Maintenant' : hourLabel}
          </p>
        </div>
      </div>

      {/* ═══════════ SLIDER HEURE — la carte derrière s'éclaire en direct ═══════════ */}
      <div style={{ padding:'0 16px 14px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
          <span style={{ fontSize:10, fontWeight:800, color:'#98a2b3',
            letterSpacing:'0.10em', textTransform:'uppercase' }}>☀ 6h</span>
          <span style={{ fontSize:10.5, fontWeight:700, color:'#6f7a8a' }}>
            Glisse pour voir le soleil changer
          </span>
          <span style={{ fontSize:10, fontWeight:800, color:'#98a2b3',
            letterSpacing:'0.10em', textTransform:'uppercase' }}>🌙 23h</span>
        </div>
        <input
          type="range" min={6} max={23.5} step={0.5} value={hour}
          onChange={e => setHour(parseFloat(e.target.value))}
          className="cb-hour-slider w-full"
          aria-label="Heure de la journée"
          aria-valuetext={hourLabel}
        />
      </div>

      {/* ═══════════ SCROLLABLE PANEL ═══════════ */}
      <div style={{ maxWidth:520, margin:'0 auto', padding:'0 14px',
        paddingBottom:'max(calc(88px + env(safe-area-inset-bottom,0px)), 100px)' }}>

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
              ● Terrasse
            </span>
            <span style={{ ...MINI_BADGE }}>
              {TYPE_LABEL[place.type] ?? place.type}
              {place.arrondissement != null ? ` · ${place.arrondissement}${ordinal}` : ''}
            </span>
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
          {([
            { strong: place.google_rating != null ? place.google_rating.toFixed(1) : '—', label: 'Note' },
            { strong: place.price_level ? '€'.repeat(place.price_level) : '—',            label: 'Prix' },
            { strong: `${currentScore}/5`,                                                  label: 'Soleil' },
          ] as const).map(({ strong, label }) => (
            <div key={label} style={{ ...STAT_CARD }}>
              <strong style={{ display:'block', color:'#0b1f3a', fontSize:20, lineHeight:1, fontWeight:900 }}>
                {strong}
              </strong>
              <span style={{ display:'block', marginTop:7, color:'#6f7a8a', fontSize:11,
                fontWeight:800, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* ── TIMELINE SECTION ── */}
        <div style={{ borderTop:'1px solid rgba(20,32,51,0.10)', margin:'14px 0 0', padding:'15px 0' }}>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between',
            gap:14, marginBottom:12 }}>
            <div>
              <p style={{ ...EYEBROW }}>Ensoleillement aujourd&apos;hui</p>
              <h2 style={{ margin:'4px 0 0', color:'#0b1f3a', fontSize:16, letterSpacing:'-0.02em',
                fontWeight:700, fontFamily:'inherit' }}>
                La terrasse est-elle au soleil ?
              </h2>
            </div>
            <small style={{ color:'#6f7a8a', fontSize:12, fontWeight:750, flexShrink:0 }}>
              Score {currentScore}/5
            </small>
          </div>

          {/* Timeline card with bars + now line */}
          {timeline.length > 0 && (
            <div style={{ position:'relative', height:74, borderRadius:22,
              background:'rgba(255,255,255,0.78)', border:'1px solid rgba(20,32,51,0.10)',
              padding:'14px 12px 10px', overflow:'hidden' }}>
              {/* NOW red line */}
              <div aria-hidden="true" style={{ position:'absolute', left:`${nowLinePct}%`,
                top:9, height:42, borderLeft:'2px solid #ff6b5a',
                boxShadow:'0 0 0 4px rgba(255,107,90,0.12)', zIndex:2 }} />
              {/* Bars */}
              <div style={{ display:'grid',
                gridTemplateColumns:`repeat(${timeline.length}, 1fr)`,
                gap:3, height:28, alignItems:'end' }}>
                {timeline.map(s => {
                  const hh = parseInt(s.time_slot.split(':')[0])
                  const isActive = s.time_slot === currentHourSlot
                  return (
                    <button key={s.time_slot}
                      onClick={() => setHour(hh)}
                      aria-label={`${hh}h — ${SCORE_LABEL[s.score] ?? 'score ' + String(s.score)}`}
                      aria-pressed={isActive}
                      style={{ height: BAR_PX[s.score] ?? 8,
                        borderRadius:'999px 999px 4px 4px',
                        background: BAR_COLORS[s.score] ?? '#ccc',
                        border:'none', padding:0, cursor:'pointer',
                        opacity: isActive ? 1 : 0.65,
                        outline: isActive ? '2px solid #ffb703' : 'none', outlineOffset:1,
                        transition:'height 0.25s', minWidth:0 }}
                    />
                  )
                })}
              </div>
              {/* Labels */}
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:9,
                color:'#6f7a8a', fontSize:11, fontWeight:800 }}>
                <span>8h</span><span>Maintenant</span><span>22h</span>
              </div>
            </div>
          )}

          {/* Sun sentence */}
          <p style={{ margin:'10px 0 0', color:'#0b1f3a', fontSize:14, fontWeight:800, lineHeight:1.4 }}>
            {sunSentence}
          </p>
        </div>

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
                    target="_blank" rel="noopener noreferrer"
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
        {photoRefs.length > 0 && (
          <div style={{ borderTop:'1px solid rgba(20,32,51,0.10)', marginTop:14, paddingTop:15 }}>
            <p style={{ ...EYEBROW, marginBottom:10 }}>Photos</p>
            <div className="scrollbar-none"
              style={{ display:'flex', gap:8, overflowX:'auto', scrollSnapType:'x mandatory' }}>
              {photoRefs.map((ref, i) => (
                <div key={i} style={{ flexShrink:0, borderRadius:16, overflow:'hidden',
                  width:i===0?240:170, height:i===0?156:116, scrollSnapAlign:'start',
                  boxShadow:'0 6px 20px rgba(11,31,58,0.14)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/photo?ref=${encodeURIComponent(ref)}&w=600`}
                    alt={`${place.name} — photo ${i + 1}`}
                    style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                    loading={i === 0 ? 'eager' : 'lazy'}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── MAPS + STREET VIEW ── */}
        {place.lat && place.lng && (
          <div style={{ borderTop:'1px solid rgba(20,32,51,0.10)', marginTop:14, paddingTop:15 }}>
            <p style={{ ...EYEBROW, marginBottom:10 }}>Voir le lieu</p>
            <div style={{ display:'grid', gap:8 }}>

              {/* Google Maps — lien principal qui fonctionne sur iOS/Android/desktop */}
              <a href={place.google_maps_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + place.address)}`} target="_blank" rel="noopener noreferrer"
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
                href={`https://maps.google.com/?cbll=${place.lat},${place.lng}&cbp=12,0,0,0,0&layer=c`}
                target="_blank" rel="noopener noreferrer"
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
        <p style={{ ...EYEBROW, marginBottom:14 }}>Terrasse en ce moment ?</p>

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
            }}
            aria-pressed={sunVote === 'sunny'}
          >
            ☀️ Ensoleillé
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
                  <button
                    type="submit"
                    disabled={commentSending || !commentText.trim()}
                    style={{
                      height:42, borderRadius:12, border:'none', cursor:'pointer',
                      fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:13,
                      background: commentText.trim() ? '#1F3A5F' : 'rgba(31,58,95,0.08)',
                      color: commentText.trim() ? '#fff' : 'rgba(31,58,95,0.35)',
                      transition:'all 150ms',
                    }}
                  >
                    {commentSending ? '…' : 'Publier mon avis'}
                  </button>
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

        {/* ── Avis publiés ── */}
        {reviews.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ ...EYEBROW, marginBottom: 12 }}>Avis des visiteurs</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reviews.map(r => (
                <div key={r.id} style={{
                  borderRadius: 16, padding: '12px 14px',
                  background: 'rgba(31,58,95,0.04)', border: '1px solid rgba(31,58,95,0.08)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1F3A5F' }}>
                      {r.display_name ?? 'Anonyme'}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(31,58,95,0.40)', fontWeight: 600 }}>
                      {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1F3A5F', lineHeight: 1.5 }}>
                    {r.comment}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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

      {/* ═══════════ ACTION BAR (sticky bottom dans le panel) ═══════════ */}
      <div style={{ position:'sticky', bottom:0, zIndex:40,
        paddingBottom:'max(env(safe-area-inset-bottom,0px),12px)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 44px', gap:8,
          margin:'0 12px', padding:'12px 12px 14px',
          background:'rgba(255,252,243,0.94)', backdropFilter:'blur(18px)',
          borderRadius:'24px 24px 0 0',
          borderTop:'1px solid rgba(20,32,51,0.10)',
          boxShadow:'0 -4px 24px rgba(11,31,58,0.12)' }}>

          {/* Primary: Ouvrir dans Google Maps — lien universel qui fonctionne sur iOS/Android/desktop */}
          <a
            href={place.google_maps_url ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name + ' ' + place.address)}`}
            target="_blank" rel="noopener noreferrer"
            style={{ height:46, display:'flex', alignItems:'center', justifyContent:'center', gap:7,
              borderRadius:14, background:'#1F3A5F', color:'#fff',
              fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:14, textDecoration:'none',
              boxShadow:'0 8px 20px rgba(31,58,95,0.28)' }}
          >
            🗺️&nbsp;Google Maps
          </a>

          {/* Secondary: Itinéraire → ouvre Google Maps directions, mode marche */}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.name + ' ' + place.address)}&travelmode=walking`}
            target="_blank" rel="noopener noreferrer"
            style={{ height:46, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
              borderRadius:14, background:'#EDC145', color:'#1F3A5F',
              fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:14, textDecoration:'none',
              boxShadow:'0 8px 20px rgba(237,193,69,0.35)' }}
          >
            📍&nbsp;Y aller
          </a>

          {/* Share */}
          <button onClick={handleShare} aria-label="Partager ce lieu"
            style={{ height:46, border:'1px solid rgba(20,32,51,0.10)', borderRadius:14,
              background:'#fff', cursor:'pointer', display:'flex', alignItems:'center',
              justifyContent:'center', fontSize:18, color:'#0b1f3a' }}>
            ↗
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
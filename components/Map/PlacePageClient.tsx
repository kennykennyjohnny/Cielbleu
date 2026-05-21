'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import type { Place } from '@/types'

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

const INFO_ROW: React.CSSProperties = {
  display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
  padding:'12px 13px', borderRadius:18,
  background:'rgba(255,255,255,0.68)', border:'1px solid rgba(20,32,51,0.08)',
}

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
}

export default function PlacePageClient({ place, scores, hour, onHourChange, onClose }: Props) {
  const setHour = onHourChange
  const [shareToast, setShareToast] = useState(false)

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

        <div aria-live="polite"
          style={{ padding:'7px 12px', borderRadius:999,
            display:'inline-flex', alignItems:'center', gap:6,
            fontWeight:900, fontSize:12.5, ...scoreBadgeStyle }}>
          <span style={{ fontSize:14 }}>
            {isSunny ? '☀️' : currentScore >= 2 ? '⛅' : '🌑'}
          </span>
          <span>{SCORE_LABEL[currentScore]}</span>
        </div>

        <div style={{ flex:1 }} />

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

              {/* Google Maps — Itinéraire + avis */}
              {place.google_maps_url && (
                <a href={place.google_maps_url} target="_blank" rel="noopener noreferrer"
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
                        Itinéraire · Horaires · Avis
                      </p>
                    </div>
                    <span style={{ fontSize:18, flexShrink:0 }}>→</span>
                  </div>
                </a>
              )}

              {/* Street View */}
              <a
                href={`https://maps.google.com/?cbll=${place.lat},${place.lng}&cbp=12,0,0,0,0&layer=c`}
                target="_blank" rel="noopener noreferrer"
                style={{ textDecoration:'none', display:'block',
                  borderRadius:18, overflow:'hidden',
                  background:'linear-gradient(135deg,#f0faf4 0%,#c6f0d8 100%)',
                  border:'1px solid rgba(5,150,105,0.25)',
                  boxShadow:'0 4px 16px rgba(5,150,105,0.12)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px' }}>
                  <span style={{ fontSize:28, flexShrink:0 }}>🧍</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontWeight:900, fontSize:14, color:'#065f46' }}>Street View</p>
                    <p style={{ margin:'2px 0 0', fontSize:12, color:'#059669', fontWeight:600 }}>
                      Voir la terrasse depuis la rue
                    </p>
                  </div>
                  <span style={{ fontSize:18, flexShrink:0 }}>→</span>
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

      {/* ═══════════ ACTION BAR (sticky bottom dans le panel) ═══════════ */}
      <div style={{ position:'sticky', bottom:0, zIndex:40,
        paddingBottom:'max(env(safe-area-inset-bottom,0px),12px)' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 44px', gap:8,
          margin:'0 12px', padding:'12px 12px 14px',
          background:'rgba(255,252,243,0.94)', backdropFilter:'blur(18px)',
          borderRadius:'24px 24px 0 0',
          borderTop:'1px solid rgba(20,32,51,0.10)',
          boxShadow:'0 -4px 24px rgba(11,31,58,0.12)' }}>

          {/* Primary: J'y suis (gold) */}
          <button style={{ height:46, border:'none', borderRadius:14, cursor:'pointer',
            fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:14, color:'#0b1f3a',
            background:'#ffb703', boxShadow:'0 10px 22px rgba(255,183,3,0.28)' }}>
            ☀&nbsp;J&apos;y suis
          </button>

          {/* Secondary: Y aller */}
          {place.google_maps_url ? (
            <a href={place.google_maps_url} target="_blank" rel="noopener noreferrer"
              style={{ height:46, display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                borderRadius:14, background:'var(--color-sky-100)', color:'var(--color-sky-700)',
                fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:14, textDecoration:'none' }}>
              📍&nbsp;Y aller
            </a>
          ) : (
            <button disabled
              style={{ height:46, border:'none', borderRadius:14, background:'rgba(20,32,51,0.06)',
                color:'#98a2b3', fontFamily:'var(--font-outfit)', fontWeight:900, fontSize:14, cursor:'not-allowed' }}>
              📍&nbsp;Y aller
            </button>
          )}

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
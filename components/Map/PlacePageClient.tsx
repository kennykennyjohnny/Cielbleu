'use client'

/**
 * PlacePageClient — fiche complète d'un lieu.
 *
 * Layout :
 *  - Hero 3D plein-écran avec le nom du lieu en overlay
 *  - Score card avec ring de progression radiale SVG
 *  - Slider horaire + quick jumps
 *  - Timeline d'ensoleillement interactive
 *  - Lien Maps
 */

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  Star,
  Navigation,
  MapPin,
  Clock,
  TrendingUp,
  Sun,
  Moon,
} from 'lucide-react'
import type { Place } from '@/types'

const Terrace3DView = dynamic(() => import('./Terrace3DView'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full h-full animate-pulse"
      style={{ background: 'linear-gradient(180deg, #87C2E0 0%, #B8D8EE 60%, #D4E8F5 100%)' }}
    />
  ),
})

// ── Constantes ─────────────────────────────────────────────────────────────

const SCORE_LABEL: Record<number, string> = {
  0: 'Nuit',
  1: "A l\u2019ombre",
  2: 'Peu ensoleille',
  3: 'Soleil intermittent',
  4: 'Bien ensoleille',
  5: 'Plein soleil',
}

const SCORE_EMOJI: Record<number, string> = {
  0: '🌙', 1: '🌥', 2: '⛅', 3: '🌤', 4: '☀️', 5: '🌞',
}

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar', restaurant: 'Restaurant', cafe: 'Cafe', park: 'Parc',
}

type ScoreTheme = {
  pageBg: string
  cardBg: string
  textPrimary: string
  textSecondary: string
  accent: string
  ringFill: string
  ringBg: string
}

const SCORE_THEME: Record<number, ScoreTheme> = {
  0: { pageBg: '#0E1820', cardBg: '#1B2838', textPrimary: '#C8D8EA', textSecondary: '#7990A8', accent: '#4A6080', ringFill: '#4A6080', ringBg: '#263244' },
  1: { pageBg: '#ECEEF2', cardBg: '#F5F6F8', textPrimary: '#3A4456', textSecondary: '#787E8A', accent: '#8D99AE', ringFill: '#8D99AE', ringBg: '#DDE0E7' },
  2: { pageBg: '#EDE8DC', cardBg: '#F5F0E6', textPrimary: '#4A3E28', textSecondary: '#8C7E62', accent: '#B08B50', ringFill: '#C4A060', ringBg: '#E2D8C4' },
  3: { pageBg: '#FFF6D4', cardBg: '#FFFDF7', textPrimary: '#5C3C00', textSecondary: '#9C7820', accent: '#FFBE0B', ringFill: '#FFBE0B', ringBg: '#FFE880' },
  4: { pageBg: '#FFF0B0', cardBg: '#FFFCE0', textPrimary: '#4A2E00', textSecondary: '#9A6000', accent: '#FF8C00', ringFill: '#FF9500', ringBg: '#FFD060' },
  5: { pageBg: '#FF9500', cardBg: '#FFBE0B', textPrimary: '#1B2838', textSecondary: 'rgba(27,40,56,0.6)', accent: '#1B2838', ringFill: '#1B2838', ringBg: 'rgba(27,40,56,0.22)' },
}

const BAR_H = [4, 8, 16, 28, 44, 56]
const BAR_COLORS = ['#0E1820', '#8D99AE', '#A0AABC', '#F0C844', '#FF9500', '#FFBE0B']

// ── Helpers ────────────────────────────────────────────────────────────────

function halfHourToSlot(h: number): { slot: string; label: string; date: Date } {
  const hour = Math.floor(h)
  const min = h % 1 ? 30 : 0
  const slot = `${String(hour).padStart(2, '0')}:${min === 0 ? '00' : '30'}`
  const label = `${hour}h${min ? '30' : ''}`
  const d = new Date()
  d.setHours(hour, min, 0, 0)
  return { slot, label, date: d }
}

function nowHalfHour(): number {
  const now = new Date()
  return Math.max(6, Math.min(23.5, now.getHours() + (now.getMinutes() >= 30 ? 0.5 : 0)))
}

function ScoreRing({ score, theme, size = 100 }: { score: number; theme: ScoreTheme; size?: number }) {
  const strokeW = 8
  const r = (size - strokeW) / 2
  const circumference = 2 * Math.PI * r
  const arcPct = 0.75
  const dashArray = circumference * arcPct
  const dashOffset = dashArray * (1 - score / 5)
  const cx = size / 2
  const rotateAngle = -225
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }} aria-hidden>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={theme.ringBg} strokeWidth={strokeW}
        strokeDasharray={`${dashArray} ${circumference}`} strokeLinecap="round"
        transform={`rotate(${rotateAngle} ${cx} ${cx})`} />
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={theme.ringFill} strokeWidth={strokeW}
        strokeDasharray={`${dashArray} ${circumference}`} strokeLinecap="round" strokeDashoffset={dashOffset}
        transform={`rotate(${rotateAngle} ${cx} ${cx})`}
        style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.34,1.2,0.64,1), stroke 0.5s' }} />
    </svg>
  )
}

// ── Photo helper ─────────────────────────────────────────────────────────────
function extractPhotoRef(url: string): string | null {
  try {
    return new URL(url).searchParams.get('photo_reference')
  } catch {
    return null
  }
}

// ── Composant principal ────────────────────────────────────────────────────

interface Props {
  place: Place
  scores: { time_slot: string; score: number }[]
}

export default function PlacePageClient({ place, scores }: Props) {
  const [hour, setHour] = useState<number>(nowHalfHour)

  const scoreMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of scores) m[r.time_slot] = r.score
    return m
  }, [scores])

  const { slot, label: hourLabel, date: displayedDate } = halfHourToSlot(hour)
  const currentScore = scoreMap[slot] ?? place.currentScore ?? 3
  const theme = SCORE_THEME[currentScore] ?? SCORE_THEME[3]
  const isNow = Math.abs(hour - nowHalfHour()) < 0.26

  const bestSlot = useMemo(() => {
    let best = { h: 14, score: 0 }
    for (const [s, v] of Object.entries(scoreMap)) {
      const [hh, mm] = s.split(':')
      const h = parseInt(hh) + (mm === '30' ? 0.5 : 0)
      if (h < 7 || h > 22) continue
      if (v > best.score || (v === best.score && Math.abs(h - 14) < Math.abs(best.h - 14))) best = { h, score: v }
    }
    return best
  }, [scoreMap])

  const timeline = useMemo(
    () => scores.filter((s) => { const [hh, mm] = s.time_slot.split(':'); return parseInt(hh) >= 8 && parseInt(hh) <= 22 && mm === '00' })
      .sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
    [scores]
  )

  const currentHourSlot = `${String(Math.floor(hour)).padStart(2, '0')}:00`
  const jumpTo = useCallback((h: number) => setHour(h), [])
  const ordinal = place.arrondissement === 1 ? 'er' : 'e'

  return (
    <main className="min-h-dvh overflow-x-hidden" style={{ background: theme.pageBg, transition: 'background 0.6s ease' }}>

      {/* ─── HERO 3D ── */}
      <div className="relative" style={{ height: 'min(62dvh, 500px)' }}>
        <div className="absolute inset-0">
          <Terrace3DView lat={place.lat} lng={place.lng} score={currentScore} date={displayedDate} />
        </div>

        {/* Gradient bas */}
        <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{
          height: '55%',
          background: `linear-gradient(to top, ${theme.pageBg} 0%, ${theme.pageBg}CC 30%, transparent 100%)`,
          transition: 'background 0.6s ease',
        }} />

        {/* Gradient top */}
        <div className="absolute inset-x-0 top-0 pointer-events-none" style={{
          height: 96,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, transparent 100%)',
        }} />

        {/* Bouton retour */}
        <Link href="/" aria-label="Retour" className="absolute top-safe left-4 z-20 mt-4 w-11 h-11 rounded-full flex items-center justify-center transition-transform active:scale-90"
          style={{ background: 'rgba(255,253,247,0.92)', backdropFilter: 'blur(14px)', boxShadow: '0 2px 12px rgba(0,0,0,0.22)' }}>
          <ArrowLeft size={19} strokeWidth={2.5} className="text-nuit" />
        </Link>

        {/* Nom + badges en overlay bas */}
        <div className="absolute bottom-0 inset-x-0 z-10 px-5 pb-5 flex items-end justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="rounded-full px-2.5 py-0.5 text-[10px] font-outfit font-bold uppercase tracking-[0.15em]"
                style={{ background: 'rgba(255,253,247,0.92)', color: '#1B2838', backdropFilter: 'blur(8px)' }}>
                {TYPE_LABEL[place.type] ?? place.type}
              </span>
              {place.arrondissement != null && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-outfit flex items-center gap-1"
                  style={{ background: 'rgba(255,253,247,0.75)', color: '#1B2838', backdropFilter: 'blur(8px)' }}>
                  <MapPin size={9} strokeWidth={2.5} />
                  {place.arrondissement}<sup className="text-[7px]">{ordinal}</sup>
                </span>
              )}
            </div>
            <h1 className="font-playfair font-bold leading-tight"
              style={{ fontSize: 'clamp(22px, 6vw, 32px)', color: '#FFFDF7', textShadow: '0 2px 12px rgba(0,0,0,0.50)' }}>
              {place.name}
            </h1>
          </div>

          {/* Badge heure */}
          <div className="shrink-0 rounded-2xl px-3.5 py-2 text-center shadow-lg" style={{
            background: isNow ? '#3A86FF' : 'rgba(255,253,247,0.92)',
            color: isNow ? '#fff' : '#1B2838',
            backdropFilter: 'blur(12px)',
            transition: 'background 0.3s',
            minWidth: 62,
          }}>
            <p className="text-[11px] font-outfit font-bold leading-none">{isNow ? 'Maintenant' : hourLabel}</p>
            {isNow && <p className="text-[9px] font-outfit opacity-80 mt-0.5 leading-none">en direct</p>}
          </div>
        </div>
      </div>

      {/* ── Photos Google Maps ── */}
      {place.photos && place.photos.length > 0 && (() => {
        const refs = place.photos.map(extractPhotoRef).filter(Boolean) as string[]
        if (!refs.length) return null
        return (
          <div className="relative z-20 -mt-6 px-4">
            <div
              className="flex gap-2.5 overflow-x-auto scrollbar-none pb-1"
              style={{ scrollSnapType: 'x mandatory' }}
            >
              {refs.map((ref, i) => (
                <div
                  key={i}
                  className="shrink-0 rounded-2xl overflow-hidden shadow-[0_4px_18px_rgba(27,40,56,0.22)]"
                  style={{ width: 185, height: 124, scrollSnapAlign: 'start' }}
                >
                  <img
                    src={`/api/photo?ref=${encodeURIComponent(ref)}&w=400`}
                    alt={`${place.name} photo ${i + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ─── CONTENU ── */}
      <div className="relative z-10 mx-auto max-w-xl px-3 space-y-3" style={{ paddingBottom: 'max(56px, env(safe-area-inset-bottom, 56px))' }}>

        {/* Carte score */}
        <div className="rounded-[28px] overflow-hidden shadow-[0_8px_40px_rgba(0,0,0,0.14)]" style={{ background: theme.cardBg, transition: 'background 0.5s' }}>
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-5">
              {/* Ring radial */}
              <div className="relative shrink-0" style={{ width: 100, height: 100 }}>
                <ScoreRing score={currentScore} theme={theme} size={100} />
                <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ transform: 'translateY(-2px)' }}>
                  <span className="text-[22px] leading-none mb-0.5">{SCORE_EMOJI[currentScore]}</span>
                  <span className="font-playfair font-bold leading-none" style={{ fontSize: 28, color: theme.textPrimary, transition: 'color 0.5s' }}>
                    {currentScore}<span className="text-[12px] font-outfit font-medium opacity-40">/5</span>
                  </span>
                </div>
              </div>

              {/* Label */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-outfit font-bold uppercase tracking-[0.18em] mb-1" style={{ color: theme.textSecondary }}>
                  {isNow ? 'En ce moment' : `A ${hourLabel}`}
                </p>
                <p className="font-playfair font-bold text-[22px] leading-snug" style={{ color: theme.textPrimary }}>
                  {SCORE_LABEL[currentScore]}
                </p>
                {bestSlot.score >= 4 && (
                  <div className="mt-2 flex items-center gap-1.5" style={{ color: theme.accent }}>
                    <TrendingUp size={12} strokeWidth={2.5} />
                    <p className="text-[11px] font-outfit font-semibold">
                      Pic à {Math.floor(bestSlot.h)}h{bestSlot.h % 1 ? '30' : ''} · {bestSlot.score}/5
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Meta */}
            {(place.google_rating != null || (place.price_level && place.price_level > 0)) && (
              <div className="flex items-center gap-4 mt-4 pt-4" style={{ borderTop: `1px solid ${theme.textPrimary}14` }}>
                {place.google_rating != null && (
                  <span className="flex items-center gap-1.5 font-outfit font-semibold text-[13.5px]" style={{ color: theme.textPrimary }}>
                    <Star size={13.5} fill="#FFBE0B" stroke="#FFBE0B" />
                    {place.google_rating.toFixed(1)}
                    <span style={{ color: theme.textSecondary, fontSize: 11, fontWeight: 400 }}>
                      {place.google_rating >= 4.5 ? 'Excellent' : place.google_rating >= 4.0 ? 'Tres bien' : 'Bien'}
                    </span>
                  </span>
                )}
                {place.price_level != null && place.price_level > 0 && (
                  <span className="font-outfit text-[13px] font-medium" style={{ color: theme.textSecondary }}>
                    {'€'.repeat(place.price_level)}<span style={{ opacity: 0.2 }}>{'€'.repeat(4 - place.price_level)}</span>
                  </span>
                )}
                {place.address && (
                  <span className="flex-1 text-right text-[11px] font-outfit truncate" style={{ color: theme.textSecondary }}>
                    {place.address.split(',')[0]}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Slider */}
          <div className="px-6 pb-6" style={{ borderTop: `1px solid ${theme.textPrimary}0C` }}>
            <div className="flex items-center justify-between mt-4 mb-3">
              <span className="flex items-center gap-1.5 text-[10px] font-outfit font-bold uppercase tracking-widest" style={{ color: theme.textSecondary }}>
                <Sun size={11} strokeWidth={2.5} />6h
              </span>
              <p className="text-[10px] font-outfit" style={{ color: theme.textSecondary, opacity: 0.65 }}>
                Explorer l&apos;ensoleillement
              </p>
              <span className="flex items-center gap-1.5 text-[10px] font-outfit font-bold uppercase tracking-widest" style={{ color: theme.textSecondary }}>
                23h<Moon size={11} strokeWidth={2.5} />
              </span>
            </div>

            <div className="relative mb-4">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full pointer-events-none" style={{
                background: 'linear-gradient(to right, #263244 0%, #8D99AE 12%, #F0C844 32%, #FFBE0B 52%, #FF8C00 78%, #1B2838 100%)',
                opacity: 0.7,
              }} />
              <input type="range" min={6} max={23.5} step={0.5} value={hour}
                onChange={(e) => setHour(parseFloat(e.target.value))}
                className="cb-hour-slider relative w-full appearance-none bg-transparent cursor-pointer"
                aria-label="Choisir l heure" />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {([8, 12, 16, 20] as const).map((h) => {
                const s = scoreMap[`${String(h).padStart(2, '0')}:00`] ?? 3
                const isActive = Math.floor(hour) === h
                return (
                  <button key={h} onClick={() => jumpTo(h)} className="rounded-2xl py-2.5 text-center transition-all active:scale-95"
                    style={{
                      background: isActive ? theme.accent : `${theme.textPrimary}10`,
                      color: isActive ? (currentScore >= 5 ? '#1B2838' : '#FFFDF7') : theme.textSecondary,
                      outline: isActive ? `2px solid ${theme.accent}` : 'none',
                    }}>
                    <span className="block text-[13px] font-outfit font-bold leading-none">{h}h</span>
                    <span className="block text-[16px] mt-1">{SCORE_EMOJI[s]}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Timeline */}
        {timeline.length > 0 && (
          <div className="rounded-[28px] overflow-hidden shadow-sm" style={{ background: theme.cardBg, transition: 'background 0.5s' }}>
            <div className="px-6 py-5">
              <div className="flex items-center gap-2 mb-4">
                <Clock size={14} strokeWidth={2.3} style={{ color: theme.textSecondary }} />
                <p className="text-[10px] uppercase tracking-[0.18em] font-outfit font-bold" style={{ color: theme.textSecondary }}>
                  Ensoleillement aujourd&apos;hui
                </p>
              </div>
              <div className="flex gap-[2px] items-end" style={{ height: 68 }}>
                {timeline.map((s) => {
                  const h = parseInt(s.time_slot.split(':')[0])
                  const isActive = s.time_slot === currentHourSlot
                  const barH = BAR_H[s.score] ?? 16
                  return (
                    <button key={s.time_slot} onClick={() => jumpTo(h)}
                      className="flex-1 flex flex-col items-center justify-end gap-[3px]"
                      aria-label={`${h}h score ${s.score}`} style={{ height: '100%' }}>
                      <div className="w-full rounded-full transition-all duration-200" style={{
                        height: barH,
                        backgroundColor: BAR_COLORS[s.score] ?? BAR_COLORS[3],
                        transform: isActive ? 'scaleY(1.06)' : 'scaleY(1)',
                        boxShadow: isActive ? `0 0 8px ${BAR_COLORS[s.score] ?? '#FFBE0B'}AA` : 'none',
                        outline: isActive ? '2px solid #3A86FF' : 'none',
                        outlineOffset: 2,
                      }} />
                      {h % 4 === 0 && (
                        <span className="text-[9px] font-outfit" style={{ color: isActive ? '#3A86FF' : theme.textSecondary, fontWeight: isActive ? 700 : 400 }}>
                          {h}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Liens Maps */}
        {place.google_maps_url && (
          <div className="rounded-[28px] overflow-hidden shadow-sm" style={{ background: theme.cardBg, transition: 'background 0.5s' }}>
            <a href={place.google_maps_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-4 px-6 py-4 transition-opacity active:opacity-70">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#E8F0FF' }}>
                <Navigation size={16} strokeWidth={2.3} className="text-ciel" />
              </div>
              <div className="flex-1">
                <p className="font-outfit font-semibold text-[14px]" style={{ color: theme.textPrimary }}>Itineraire</p>
                <p className="font-outfit text-[11.5px]" style={{ color: theme.textSecondary }}>
                  {place.address ?? 'Ouvrir dans Google Maps'}
                </p>
              </div>
              <span style={{ color: theme.textSecondary, opacity: 0.4, fontSize: 18 }}>›</span>
            </a>
          </div>
        )}
      </div>
    </main>
  )
}
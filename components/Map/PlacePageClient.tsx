'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, Star, Navigation, Globe, Sunrise, Sunset, MapPin } from 'lucide-react'
import type { Place } from '@/types'

const Terrace3DView = dynamic(() => import('./Terrace3DView'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#0F1822]" />,
})

// ── Constants ──────────────────────────────────────────────────────────────

const SCORE_LABEL: Record<number, string> = {
  0: 'Tombée de la nuit',
  1: 'À l\u2019ombre',
  2: 'Surtout à l\u2019ombre',
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

// bg, text and accent (hex for inline styles) per score
const SCORE_THEME: Record<number, { bg: string; text: string; accent: string }> = {
  0: { bg: 'bg-nuit',       text: 'text-creme',        accent: '#FFFDF7' },
  1: { bg: 'bg-gris/10',   text: 'text-gris',          accent: '#8D99AE' },
  2: { bg: 'bg-gris/15',   text: 'text-gris',          accent: '#8D99AE' },
  3: { bg: 'bg-soleil/15', text: 'text-[#9E6C00]',     accent: '#FFBE0B' },
  4: { bg: 'bg-soleil/30', text: 'text-[#9E6C00]',     accent: '#FFBE0B' },
  5: { bg: 'bg-soleil',    text: 'text-nuit',           accent: '#1B2838' },
}

const BAR_COLORS: Record<number, string> = {
  0: 'rgba(27,40,56,0.4)',
  1: 'rgba(141,153,174,0.3)',
  2: 'rgba(141,153,174,0.5)',
  3: 'rgba(255,190,11,0.40)',
  4: 'rgba(255,190,11,0.70)',
  5: '#FFBE0B',
}

// ── Helpers ────────────────────────────────────────────────────────────────

function slotFromHalfHour(h: number): { slot: string; label: string; date: Date } {
  const hour = Math.floor(h)
  const minute = h % 1 === 0 ? 0 : 30
  const slot = `${String(hour).padStart(2, '0')}:${minute === 0 ? '00' : '30'}`
  const label = `${hour}h${minute === 0 ? '' : '30'}`
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return { slot, label, date: d }
}

// ── Component ──────────────────────────────────────────────────────────────

interface Props {
  place: Place
  scores: { time_slot: string; score: number }[]
}

export default function PlacePageClient({ place, scores }: Props) {
  const initialHour = useMemo(() => {
    const now = new Date()
    const h = now.getHours() + (now.getMinutes() < 30 ? 0 : 0.5)
    return Math.max(6, Math.min(23.5, h))
  }, [])

  const [hour, setHour] = useState<number>(initialHour)

  const scoreMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of scores) m[r.time_slot] = r.score
    return m
  }, [scores])

  const { slot, label: hourLabel, date: displayedDate } = slotFromHalfHour(hour)
  const currentScore = scoreMap[slot] ?? place.currentScore ?? 3
  const theme = SCORE_THEME[currentScore] ?? SCORE_THEME[3]

  const isNow = useMemo(() => {
    const now = new Date()
    const nowH = now.getHours() + (now.getMinutes() < 30 ? 0 : 0.5)
    return Math.abs(hour - nowH) < 0.25
  }, [hour])

  // Timeline: 8h–22h full hours, sorted
  const timelineData = useMemo(
    () =>
      scores
        .filter((s) => {
          const [hh, mm] = s.time_slot.split(':')
          return parseInt(hh) >= 8 && parseInt(hh) <= 22 && mm === '00'
        })
        .sort((a, b) => a.time_slot.localeCompare(b.time_slot)),
    [scores]
  )

  const currentHourSlot = `${String(Math.floor(hour)).padStart(2, '0')}:00`

  return (
    <main className="min-h-dvh bg-creme overflow-x-hidden">
      {/* ── Hero 3D ─────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden bg-[#0F1822]"
        style={{ height: 'min(58dvh, 440px)' }}
      >
        <Terrace3DView
          lat={place.lat}
          lng={place.lng}
          score={currentScore}
          date={displayedDate}
        />

        {/* Gradient fade to content */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-creme to-transparent pointer-events-none" />

        {/* Back button */}
        <Link
          href="/"
          aria-label="Retour à la carte"
          className="absolute top-4 left-4 z-10 rounded-full bg-white/90 backdrop-blur-md w-11 h-11 flex items-center justify-center shadow-lg text-nuit active:scale-90 transition-transform"
        >
          <ArrowLeft size={20} strokeWidth={2.4} />
        </Link>

        {/* Time badge */}
        <div
          className={[
            'absolute bottom-6 right-4 z-10 rounded-full px-3.5 py-1.5 shadow-md backdrop-blur-sm',
            'text-[12px] font-outfit font-semibold pointer-events-none select-none',
            isNow ? 'bg-ciel text-white' : 'bg-white/90 text-nuit',
          ].join(' ')}
        >
          {isNow ? '· Maintenant' : hourLabel}
        </div>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div
        className="relative z-10 -mt-5 px-4 max-w-xl mx-auto"
        style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom, 40px))' }}
      >
        {/* ── Main card ── */}
        <div className="rounded-3xl bg-white shadow-[0_8px_40px_rgba(27,40,56,0.13)] overflow-hidden">

          {/* Identity */}
          <div className="px-6 pt-6 pb-5">
            <span className="inline-block rounded-full bg-creme border border-nuit/8 px-3 py-1 text-[11px] font-outfit font-semibold text-nuit uppercase tracking-wider">
              {TYPE_LABEL[place.type] ?? place.type}
            </span>
            <h1 className="font-playfair text-[28px] font-bold text-nuit leading-tight mt-2.5">
              {place.name}
            </h1>
            <p className="text-[13px] text-gris font-outfit leading-snug mt-1">
              {place.address}
            </p>

            {/* Meta row */}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              {place.google_rating != null && (
                <span className="flex items-center gap-1 text-sm font-outfit font-semibold text-nuit">
                  <Star size={13} fill="#FFBE0B" stroke="#FFBE0B" />
                  {place.google_rating.toFixed(1)}
                </span>
              )}
              {place.price_level != null && place.price_level > 0 && (
                <span className="text-sm font-outfit font-medium text-gris">
                  {'€'.repeat(place.price_level)}
                  <span className="opacity-20">{'€'.repeat(4 - place.price_level)}</span>
                </span>
              )}
              {place.arrondissement != null && (
                <span className="flex items-center gap-1 text-sm font-outfit text-gris">
                  <MapPin size={11} strokeWidth={2.2} />
                  {place.arrondissement}
                  <sup>{place.arrondissement === 1 ? 'er' : 'e'}</sup>&nbsp;arr.
                </span>
              )}
            </div>
          </div>

          <div className="h-px bg-nuit/5 mx-6" />

          {/* ── Score + Slider ── */}
          <div className="px-6 py-5">
            {/* Score block */}
            <div
              className={`rounded-2xl ${theme.bg} px-5 py-4 flex items-center gap-4 transition-all duration-300`}
            >
              <div className={`font-playfair text-[48px] font-bold leading-none ${theme.text}`}>
                {currentScore}
                <span className="text-[15px] font-outfit font-medium opacity-50 ml-0.5">/5</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[10px] uppercase tracking-[0.15em] font-outfit font-bold ${theme.text} opacity-60 mb-1`}>
                  {isNow ? 'En ce moment' : `À ${hourLabel}`}
                </p>
                <p className={`text-[15px] font-outfit font-semibold ${theme.text} leading-tight`}>
                  {SCORE_LABEL[currentScore]}
                </p>
              </div>
              {/* Mini score bars */}
              <div className="flex gap-1 items-end shrink-0">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="w-2 rounded-sm transition-all duration-300"
                    style={{
                      height: `${8 + i * 5}px`,
                      backgroundColor: theme.accent,
                      opacity: i <= currentScore ? 1 : 0.12,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Time slider */}
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="flex items-center gap-1 text-[10px] font-outfit font-bold text-gris uppercase tracking-widest">
                  <Sunrise size={11} />
                  6h
                </span>
                <span className="text-[10px] font-outfit text-nuit/40">
                  Explore le soleil dans la journée
                </span>
                <span className="flex items-center gap-1 text-[10px] font-outfit font-bold text-gris uppercase tracking-widest">
                  23h
                  <Sunset size={11} />
                </span>
              </div>

              <div className="relative">
                <div
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 rounded-full pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(to right, #3A5A8C 0%, #FFD976 22%, #FFBE0B 50%, #FF9500 75%, #1B2838 100%)',
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
                  aria-label="Heure de visualisation"
                />
              </div>

              <div className="flex justify-between mt-3">
                {[8, 12, 16, 20].map((h) => (
                  <button
                    key={h}
                    onClick={() => setHour(h)}
                    className={[
                      'rounded-full px-3 py-1.5 text-[11px] font-outfit font-medium transition-all',
                      Math.floor(hour) === h
                        ? 'bg-nuit text-creme shadow-sm'
                        : 'bg-creme text-nuit/60',
                    ].join(' ')}
                  >
                    {h}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Timeline ── */}
          {timelineData.length > 0 && (
            <>
              <div className="h-px bg-nuit/5 mx-6" />
              <div className="px-6 py-5">
                <p className="text-[10px] uppercase tracking-[0.15em] font-outfit font-bold text-gris mb-3">
                  Ensoleillement aujourd'hui
                </p>
                <div className="flex gap-[3px] items-end">
                  {timelineData.map((s) => {
                    const h = parseInt(s.time_slot.split(':')[0])
                    const isCurrentH = s.time_slot === currentHourSlot
                    const barH = 8 + (s.score / 5) * 44
                    return (
                      <button
                        key={s.time_slot}
                        onClick={() => setHour(h)}
                        className="flex-1 flex flex-col items-center gap-1 group"
                        aria-label={`${h}h`}
                      >
                        <div
                          className={`w-full rounded-t-sm transition-all duration-200 group-hover:brightness-110 ${
                            isCurrentH ? 'ring-2 ring-ciel ring-offset-1' : ''
                          }`}
                          style={{
                            height: `${barH}px`,
                            backgroundColor: BAR_COLORS[s.score] ?? BAR_COLORS[3],
                          }}
                        />
                        {h % 3 === 0 && (
                          <span
                            className={`text-[9px] font-outfit ${
                              isCurrentH ? 'text-ciel font-bold' : 'text-gris'
                            }`}
                          >
                            {h}h
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Links card ── */}
        {(place.google_maps_url || place.instagram_url) && (
          <div className="mt-3 rounded-3xl bg-white shadow-sm p-5 space-y-3">
            {place.google_maps_url && (
              <a
                href={place.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm font-outfit text-nuit hover:text-ciel transition-colors"
              >
                <Navigation size={16} strokeWidth={2.2} className="text-ciel shrink-0" />
                Itinéraire Google Maps
              </a>
            )}
            {place.instagram_url && (
              <a
                href={place.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 text-sm font-outfit text-nuit hover:text-ciel transition-colors"
              >
                <Globe size={16} strokeWidth={2.2} className="text-ciel shrink-0" />
                Instagram
              </a>
            )}
          </div>
        )}

        {/* ── CTA ── */}
        {place.google_maps_url && (
          <a
            href={place.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 rounded-2xl bg-nuit py-4 text-[15px] font-outfit font-semibold text-creme shadow-lg active:scale-[0.97] transition-transform"
          >
            <Navigation size={16} strokeWidth={2.4} />
            Y aller maintenant
          </a>
        )}
      </div>
    </main>
  )
}

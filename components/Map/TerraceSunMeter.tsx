'use client'

// Jauge « % de la terrasse au soleil » — TÂCHE 3.
//
// Affiche le score de SURFACE (et non plus le soleil binaire) : on récupère la
// géométrie réelle (bâtiment + terrasse autorisée Ville de Paris) via
// /api/place-context, on échantillonne l'emprise et on calcule la fraction au
// soleil pour l'heure du slider + les 4 créneaux. Dégradation propre : si la
// géométrie manque, le composant ne rend rien (le reste du panel prend le relais).

import { useEffect, useMemo, useState } from 'react'
import {
  buildTerraceFootprint,
  facadeBearing,
  surfaceSunFraction,
  toPercent,
  type BuildingPoly,
} from '@/lib/surfaceSunScore'
import { formatHourLabel } from '@/lib/hourSlot'

interface PlaceCtx {
  building?: { geo_shape?: { type?: string; coordinates?: unknown } | null } | null
  neighbors?: { ring: number[][]; height: number }[]
  terrace?: {
    longueur?: number | null
    largeur?: number | null
    geo_point_2d?: { lat?: number; lon?: number } | null
  } | null
}

interface Props {
  lat: number
  lng: number
  hour: number
  /** status === 'maybe' → affiche « terrasse à confirmer ». */
  unconfirmed?: boolean
}

const SLOTS: { label: string; hour: number }[] = [
  { label: 'Matin', hour: 10 },
  { label: 'Midi', hour: 13 },
  { label: 'Aprèm', hour: 16 },
  { label: 'Soir', hour: 19 },
]

function outerRing(shape: { type?: string; coordinates?: unknown } | null | undefined): [number, number][] | null {
  if (!shape?.type) return null
  if (shape.type === 'Polygon') {
    const c = shape.coordinates as number[][][] | undefined
    return (c?.[0] as [number, number][]) ?? null
  }
  if (shape.type === 'MultiPolygon') {
    const polys = shape.coordinates as number[][][][] | undefined
    if (!polys?.length) return null
    let best = polys[0][0]
    for (const p of polys) if (p[0].length > best.length) best = p[0]
    return best as [number, number][]
  }
  return null
}

function dateAtHour(h: number): Date {
  const d = new Date()
  d.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
  return d
}

export default function TerraceSunMeter({ lat, lng, hour, unconfirmed }: Props) {
  const [ctx, setCtx] = useState<PlaceCtx | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/place-context?lat=${lat}&lng=${lng}`, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? (r.json() as Promise<PlaceCtx>) : null))
      .then((c) => { if (!cancelled) { setCtx(c); setLoading(false) } })
      .catch(() => { if (!cancelled) { setCtx(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [lat, lng])

  // Géométrie stable (indépendante de l'heure) : emprise + voisins + bearing.
  const geom = useMemo(() => {
    if (!ctx) return null
    const ring = outerRing(ctx.building?.geo_shape)
    const neighbors = (ctx.neighbors ?? []) as BuildingPoly[]
    if (!ring || neighbors.length === 0) return null
    const t = ctx.terrace?.geo_point_2d
    const cLat = typeof t?.lat === 'number' ? t.lat : lat
    const cLng = typeof t?.lon === 'number' ? t.lon : lng
    const bearing = facadeBearing(ring, cLng, cLat)
    if (bearing == null) return null
    const points = buildTerraceFootprint({
      lng: cLng, lat: cLat, facadeBearingDeg: bearing,
      widthM: ctx.terrace?.longueur, depthM: ctx.terrace?.largeur,
    })
    const confirmed = !!(ctx.terrace && (ctx.terrace.longueur != null || ctx.terrace.geo_point_2d != null))
    return { points, neighbors, cLat, cLng, confirmed }
  }, [ctx, lat, lng])

  // Recalcul léger à chaque changement d'heure.
  const data = useMemo(() => {
    if (!geom) return null
    const main = surfaceSunFraction(geom.points, dateAtHour(hour), geom.cLat, geom.cLng, geom.neighbors)
    const slots = SLOTS.map((s) => {
      const r = surfaceSunFraction(geom.points, dateAtHour(s.hour), geom.cLat, geom.cLng, geom.neighbors)
      return { ...s, pct: toPercent(r.fraction), night: r.isNight }
    })
    return { pct: toPercent(main.fraction), night: main.isNight, slots, confirmed: geom.confirmed }
  }, [geom, hour])

  if (loading || !data) {
    // Pas de géométrie → on n'affiche rien (le bloc soleil du panel suffit).
    // Mais si la terrasse est « à confirmer », on garde au moins le badge.
    if (!loading && unconfirmed) return <UnconfirmedNote />
    return null
  }

  const { pct, night, slots, confirmed } = data
  const hot = pct >= 60
  const mid = pct >= 30
  const barColor = night ? '#8D99AE' : hot ? '#FFBE0B' : mid ? '#F2A23B' : '#8D99AE'

  return (
    <div
      style={{
        marginTop: 14, borderRadius: 18, padding: '14px 15px',
        background: night ? 'rgba(141,153,174,0.10)' : hot ? '#FFF6DE' : 'rgba(255,255,255,0.82)',
        border: `1px solid ${night ? 'rgba(141,153,174,0.20)' : hot ? 'rgba(255,190,11,0.40)' : 'rgba(20,32,51,0.09)'}`,
      }}
    >
      <p style={{ margin: 0, color: '#6f7a8a', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        Ensoleillement de la terrasse
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '7px 0 2px' }}>
        <strong style={{ fontSize: 28, fontWeight: 900, lineHeight: 1, color: night ? '#5b6776' : '#0b1f3a' }}>
          {night ? '🌙' : `${pct} %`}
        </strong>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#4a5568' }}>
          {night
            ? `soleil couché à ${formatHourLabel(hour)}`
            : `de la terrasse au soleil à ${formatHourLabel(hour)}`}
        </span>
      </div>

      {/* Barre de remplissage */}
      {!night && (
        <div style={{ height: 8, borderRadius: 999, background: 'rgba(20,32,51,0.08)', overflow: 'hidden', marginTop: 8 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 999, transition: 'width 220ms ease' }} />
        </div>
      )}

      {/* Mini-strip par créneau */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 12 }}>
        {slots.map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 13, fontWeight: 900, lineHeight: 1,
              color: s.night ? '#9aa4b2' : s.pct >= 60 ? '#b87c00' : s.pct >= 30 ? '#c2742a' : '#8D99AE',
            }}>
              {s.night ? '—' : `${s.pct}%`}
            </div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: '#8D99AE', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 3 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Provenance / confiance */}
      <p style={{ margin: '11px 0 0', fontSize: 10.5, fontWeight: 600, color: '#9aa4b2', lineHeight: 1.4 }}>
        {confirmed
          ? '✓ Emprise réelle · open data terrasses Ville de Paris'
          : unconfirmed
            ? '≈ Emprise estimée · terrasse à confirmer'
            : '≈ Emprise estimée le long de la façade'}
      </p>
    </div>
  )
}

function UnconfirmedNote() {
  return (
    <div style={{ marginTop: 14, borderRadius: 14, padding: '10px 13px', background: 'rgba(141,153,174,0.10)', border: '1px solid rgba(141,153,174,0.18)' }}>
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: '#5b6776' }}>
        🪧 Terrasse à confirmer — ce lieu n’a pas encore de terrasse vérifiée.
      </p>
    </div>
  )
}

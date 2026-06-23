import React from 'react'
import { AbsoluteFill, Sequence, interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BRICOLAGE, COLORS, OUTFIT } from '../lib/theme'
import { Center, Float, GoldHalo, Kinetic, LightSweep } from '../components/Motion'
import { Cta } from '../components/Ui'

/** Jauge de cuisson crème → doré → carbonisé. */
const CookGauge: React.FC = () => {
  const frame = useCurrentFrame()
  const f = interpolate(frame, [8, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const col = interpolateColors(f, [0, 0.5, 1], ['#FFF1B8', '#EDC145', '#6E2A10'])
  return (
    <div style={{ width: 780, position: 'relative' }}>
      <div style={{ height: 50, borderRadius: 999, background: 'rgba(255,255,255,0.10)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${f * 100}%`, background: col, borderRadius: 999 }} />
      </div>
      <div style={{ position: 'absolute', top: -16, left: `calc(${f * 100}% - 34px)`, fontSize: 64 }}>🔥</div>
    </div>
  )
}

/** Une ligne du classement (entre par la droite, rebond ; le #1 pulse). */
const RankRow: React.FC<{ delay: number; medal: string; name: string; arr: string; flames: number; top?: boolean }> = ({
  delay, medal, name, arr, flames, top = false,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 12, mass: 0.8 } })
  const x = interpolate(s, [0, 1], [760, 0])
  const o = interpolate(frame - delay, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const pulse = top ? 1 + Math.sin(frame / 7) * 0.03 : 1
  const glow = top ? `0 0 ${34 + Math.sin(frame / 7) * 16}px rgba(255,90,40,0.55)` : '0 12px 30px rgba(0,0,0,0.25)'
  return (
    <div style={{
      transform: `translateX(${x}px) scale(${pulse})`, opacity: o, width: 900,
      padding: '26px 34px', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 26,
      background: top ? 'linear-gradient(90deg,#FF5A3C 0%,#EDC145 100%)' : 'rgba(255,255,255,0.06)',
      border: top ? '3px solid #FFE89A' : '2px solid rgba(255,255,255,0.12)', boxShadow: glow,
    }}>
      <span style={{ fontSize: 70 }}>{medal}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 56, color: top ? COLORS.navy : COLORS.white, lineHeight: 1.02 }}>{name}</div>
        <div style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: 36, color: top ? 'rgba(31,58,95,0.72)' : COLORS.gold }}>{arr}</div>
      </div>
      <span style={{ fontSize: 44 }}>{'🔥'.repeat(flames)}</span>
    </div>
  )
}

/**
 * POST 3 — Carte blanche : le palmarès des terrasses-fournaises.
 * HopSoleil connaît l'expo soleil de chaque terrasse → cette semaine il retourne
 * sa data et balance les fours. Noms génériques (pas de name & shame réel).
 */
export const Fours: React.FC = () => {
  const frame = useCurrentFrame()
  const heat = interpolate(frame, [120, 150], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg,#244A7A 0%,#1F3A5F 60%, rgba(110,42,16,${(heat * 0.5).toFixed(2)}) 100%)`, fontFamily: BRICOLAGE }}>
      <GoldHalo intensity={0.6} />

      {/* ─── Beat 1 ─── */}
      <Sequence durationInFrames={78}>
        <Center gap={30}>
          <Float amp={10} speed={34}><span style={{ fontSize: 200 }}>🔥</span></Float>
          <Kinetic text="Le classement des terrasses qui te cuisent." size={104} color={COLORS.white} />
        </Center>
      </Sequence>

      {/* ─── Beat 2 ─── */}
      <Sequence from={78} durationInFrames={68}>
        <Center gap={48}>
          <Kinetic text="Spoiler : ta préférée est dedans." size={104} color={COLORS.gold} />
          <CookGauge />
        </Center>
      </Sequence>

      {/* ─── Beat 3 : le palmarès ─── */}
      <Sequence from={146} durationInFrames={74}>
        <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: 70 }}>
          <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 60, color: COLORS.white, opacity: 0.85, marginBottom: 8 }}>
            🥵 Top des fours
          </div>
          <RankRow delay={30} medal="🥇" name="Quai sans un arbre" arr="4e · plein sud" flames={5} top />
          <RankRow delay={14} medal="🥈" name="Rooftop zéro ombre" arr="2e · expo plein soleil" flames={4} />
          <RankRow delay={2} medal="🥉" name="Terrasse fournaise" arr="11e · 0 parasol" flames={3} />
        </AbsoluteFill>
      </Sequence>

      <LightSweep from={146} dur={22} />

      {/* ─── CTA ─── */}
      <Sequence from={220} durationInFrames={80}>
        <Cta tagline="Évite les fours. Trouve l'ombre." />
      </Sequence>
    </AbsoluteFill>
  )
}

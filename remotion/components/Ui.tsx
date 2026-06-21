import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BRAND, BRICOLAGE, COLORS, OUTFIT, URL } from '../lib/theme'
import { Sun } from './Shapes'

/** Apparition douce (fade + montée) déclenchée à `delay`. */
export const Reveal: React.FC<{ delay?: number; from?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0, from = 50, children, style,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 16, mass: 0.7 } })
  const y = interpolate(s, [0, 1], [from, 0])
  const o = interpolate(frame - delay, [0, 9], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <div style={{ ...style, transform: `translateY(${y}px)`, opacity: o }}>{children}</div>
}

/** Logo : petit soleil + mot-marque. */
export const Logo: React.FC<{ scale?: number; color?: string }> = ({ scale = 1, color = COLORS.white }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 18 * scale }}>
    <Sun size={70 * scale} />
    <span style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 64 * scale, color, letterSpacing: '-0.03em' }}>
      {BRAND}
    </span>
  </div>
)

/** Pastille pilule (badge). */
export const Pill: React.FC<{ children: React.ReactNode; bg?: string; color?: string }> = ({
  children, bg = 'rgba(255,255,255,0.16)', color = COLORS.white,
}) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 12, padding: '18px 34px', borderRadius: 999,
    background: bg, color, fontFamily: OUTFIT, fontWeight: 800, fontSize: 38, lineHeight: 1,
    border: `2px solid ${color}33`,
  }}>
    {children}
  </div>
)

/** Carte de fin commune aux 3 spots : logo + tagline + URL + bouton. */
export const Cta: React.FC<{ tagline: string }> = ({ tagline }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const pop = spring({ frame, fps, config: { damping: 14 } })
  return (
    <AbsoluteFill style={{
      background: `radial-gradient(120% 80% at 50% 0%, ${COLORS.cielDeep} 0%, ${COLORS.navy} 60%)`,
      justifyContent: 'center', alignItems: 'center', padding: 90, gap: 56,
    }}>
      <div style={{ transform: `scale(${interpolate(pop, [0, 1], [0.8, 1])})` }}>
        <Logo scale={1.35} />
      </div>
      <Reveal delay={10} style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 72, color: COLORS.white, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
          {tagline}
        </div>
      </Reveal>
      <Reveal delay={22}>
        <div style={{
          marginTop: 10, padding: '26px 56px', borderRadius: 999, background: COLORS.gold,
          color: COLORS.navy, fontFamily: OUTFIT, fontWeight: 900, fontSize: 46,
          boxShadow: '0 16px 50px rgba(237,193,69,0.5)',
        }}>
          Ouvre la carte ☀
        </div>
      </Reveal>
      <Reveal delay={32}>
        <div style={{ fontFamily: OUTFIT, fontWeight: 700, fontSize: 40, color: COLORS.goldSoft, letterSpacing: '0.04em' }}>
          {URL}
        </div>
      </Reveal>
    </AbsoluteFill>
  )
}

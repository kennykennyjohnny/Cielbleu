import React from 'react'
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BRICOLAGE, COLORS } from '../lib/theme'

/** Colonne centrée plein écran. */
export const Center: React.FC<{ children: React.ReactNode; gap?: number; pad?: number; style?: React.CSSProperties }> = ({
  children, gap = 28, pad = 80, style,
}) => (
  <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap, padding: pad, ...style }}>
    {children}
  </AbsoluteFill>
)

/** Flottement continu — rien n'est jamais immobile. */
export const Float: React.FC<{ children: React.ReactNode; amp?: number; speed?: number; phase?: number; style?: React.CSSProperties }> = ({
  children, amp = 8, speed = 40, phase = 0, style,
}) => {
  const frame = useCurrentFrame()
  const y = Math.sin((frame + phase) / speed) * amp
  return <div style={{ transform: `translateY(${y}px)`, ...style }}>{children}</div>
}

/**
 * Texte CINÉTIQUE : chaque lettre arrive en cascade (montée + flou + fade).
 * Le look premium. Les mots ne se coupent pas (chaque mot = bloc inline).
 */
export const Kinetic: React.FC<{
  text: string; size: number; color?: string; delay?: number; stagger?: number
  weight?: number; lineHeight?: number; align?: 'center' | 'left'; shadow?: string
}> = ({
  text, size, color = COLORS.white, delay = 0, stagger = 1.4,
  weight = 800, lineHeight = 0.98, align = 'center', shadow,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const words = text.split(' ')
  let i = 0
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', columnGap: size * 0.26, rowGap: size * 0.06,
      justifyContent: align === 'center' ? 'center' : 'flex-start',
      fontFamily: BRICOLAGE, fontWeight: weight, fontSize: size, color, lineHeight,
      letterSpacing: '-0.03em', textAlign: align, textShadow: shadow,
    }}>
      {words.map((w, wi) => (
        <span key={wi} style={{ display: 'inline-flex' }}>
          {w.split('').map((ch, ci) => {
            const idx = i++
            const s = spring({ frame: frame - delay - idx * stagger, fps, config: { damping: 14, mass: 0.5 } })
            const y = interpolate(s, [0, 1], [38, 0])
            const blur = interpolate(s, [0, 1], [12, 0])
            const o = interpolate(frame - delay - idx * stagger, [0, 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
            return (
              <span key={ci} style={{ display: 'inline-block', transform: `translateY(${y}px)`, filter: `blur(${blur}px)`, opacity: o }}>
                {ch}
              </span>
            )
          })}
        </span>
      ))}
    </div>
  )
}

/** Halo doré qui dérive dans le fond (le soleil = personnage). Mode screen. */
export const GoldHalo: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame()
  const x1 = 50 + Math.sin(frame / 75) * 18, y1 = 32 + Math.cos(frame / 95) * 12
  const x2 = 58 + Math.cos(frame / 115) * 22, y2 = 72 + Math.sin(frame / 85) * 14
  const o1 = (0.5 + Math.sin(frame / 42) * 0.14) * intensity
  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: -250, mixBlendMode: 'screen', background: `radial-gradient(38% 28% at ${x1}% ${y1}%, rgba(237,193,69,${o1.toFixed(3)}) 0%, transparent 62%)` }} />
      <div style={{ position: 'absolute', inset: -250, mixBlendMode: 'screen', background: `radial-gradient(44% 34% at ${x2}% ${y2}%, rgba(255,210,77,${(0.32 * intensity).toFixed(3)}) 0%, transparent 62%)` }} />
    </AbsoluteFill>
  )
}

/** Balayage de lumière doré (masque les cuts / claque les transitions). */
export const LightSweep: React.FC<{ from: number; dur?: number }> = ({ from, dur = 18 }) => {
  const frame = useCurrentFrame()
  const p = interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  if (p <= 0 || p >= 1) return null
  const x = interpolate(p, [0, 1], [-50, 150])
  return (
    <AbsoluteFill style={{ overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', top: '-20%', left: `${x}%`, width: '45%', height: '140%',
        transform: 'rotate(12deg)', filter: 'blur(22px)', mixBlendMode: 'screen',
        background: 'linear-gradient(90deg, transparent, rgba(255,236,170,0.95), transparent)',
      }} />
    </AbsoluteFill>
  )
}

/** Soleil qui « transpire » (rayons + gouttes de sueur qui tombent). */
export const SweatingSun: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame()
  const rot = frame * 0.6
  const pulse = 1 + Math.sin(frame / 8) * 0.05
  const drops = [0, 1, 2]
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: `scale(${pulse})`, overflow: 'visible' }}>
        <defs>
          <radialGradient id="hotSun" cx="38%" cy="34%">
            <stop offset="0%" stopColor="#FFF1B8" /><stop offset="55%" stopColor="#FFC23D" /><stop offset="100%" stopColor="#FF7A1A" />
          </radialGradient>
        </defs>
        <g transform={`rotate(${rot} 50 50)`}>
          {Array.from({ length: 14 }).map((_, k) => (
            <rect key={k} x={47.5} y={1} width={5} height={16} rx={2.5} fill="#FFD24D" opacity={0.9} transform={`rotate(${k * (360 / 14)} 50 50)`} />
          ))}
        </g>
        <circle cx={50} cy={50} r={26} fill="url(#hotSun)" />
        {/* visage moite : 2 yeux + bouche tendue */}
        <circle cx={42} cy={46} r={2.4} fill="#9A4A12" />
        <circle cx={58} cy={46} r={2.4} fill="#9A4A12" />
        <path d="M42 60 Q50 55 58 60" stroke="#9A4A12" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </svg>
      {/* gouttes de sueur */}
      {drops.map((d) => {
        const t = ((frame + d * 26) % 70) / 70
        const dy = interpolate(t, [0, 1], [size * 0.52, size * 0.95])
        const o = interpolate(t, [0, 0.15, 0.85, 1], [0, 1, 1, 0])
        const dx = [size * 0.30, size * 0.62, size * 0.46][d]
        return (
          <div key={d} style={{ position: 'absolute', left: dx, top: dy, opacity: o }}>
            <svg width={20} height={26} viewBox="0 0 24 24"><path d="M12 2.2c3 3.2 6 6.3 6 10.3a6 6 0 1 1-12 0c0-4 3-7.1 6-10.3z" fill={COLORS.ciel} /></svg>
          </div>
        )
      })}
    </div>
  )
}

/** Thermomètre qui se remplit jusqu'à `frac` (0–1) avec un label °C. */
export const Thermometer: React.FC<{ frac: number; label: string; delay?: number }> = ({ frac, label, delay = 0 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - delay, fps, config: { damping: 20, mass: 1 } })
  const f = interpolate(s, [0, 1], [0, frac])
  const tubeTop = 16, tubeBot = 150, tubeH = tubeBot - tubeTop
  const fillTop = tubeBot - tubeH * f
  return (
    <svg width={150} height={210} viewBox="0 0 90 210" style={{ overflow: 'visible' }}>
      <rect x={34} y={tubeTop} width={22} height={tubeH} rx={11} fill="rgba(255,255,255,0.18)" stroke={COLORS.white} strokeWidth={3} />
      <rect x={37.5} y={fillTop} width={15} height={tubeBot - fillTop} rx={7.5} fill="#FF5A3C" />
      <circle cx={45} cy={170} r={28} fill="#FF3B1F" stroke={COLORS.white} strokeWidth={3} />
      <rect x={37.5} y={120} width={15} height={56} fill="#FF3B1F" />
      <text x={45} y={205} textAnchor="middle" fontFamily={BRICOLAGE} fontWeight={800} fontSize={26} fill={COLORS.white}>{label}</text>
    </svg>
  )
}

import React from 'react'
import { useCurrentFrame } from 'remotion'
import { COLORS } from '../lib/theme'

/** Soleil tournant + battement léger. */
export const Sun: React.FC<{ size: number; color?: string; spin?: boolean }> = ({
  size, color = COLORS.gold, spin = true,
}) => {
  const frame = useCurrentFrame()
  const rot = spin ? frame * 0.7 : 0
  const pulse = 1 + Math.sin(frame / 9) * 0.04
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ transform: `scale(${pulse})`, overflow: 'visible' }}>
      <defs>
        <radialGradient id="sunCore" cx="38%" cy="34%">
          <stop offset="0%" stopColor={COLORS.goldSoft} />
          <stop offset="60%" stopColor={color} />
          <stop offset="100%" stopColor="#F2A23B" />
        </radialGradient>
      </defs>
      <g transform={`rotate(${rot} 50 50)`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={47.5} y={2} width={5} height={15} rx={2.5} fill={color}
            opacity={0.9} transform={`rotate(${i * 30} 50 50)`} />
        ))}
      </g>
      <circle cx={50} cy={50} r={25} fill="url(#sunCore)" />
    </svg>
  )
}

/** Parasol de café (toile galbée festonnée + mât). */
export const Parasol: React.FC<{ size: number; canopy?: string; dark?: string; tiltDeg?: number }> = ({
  size, canopy = COLORS.gold, dark = '#E07A00', tiltDeg = 0,
}) => (
  <svg width={size} height={size * 1.15} viewBox="0 0 100 115" style={{ overflow: 'visible' }}>
    <g transform={`rotate(${tiltDeg} 50 110)`}>
      {/* ombre */}
      <ellipse cx="50" cy="112" rx="16" ry="4" fill="rgba(31,58,95,0.18)" />
      {/* mât */}
      <rect x="47.5" y="44" width="5" height="66" rx="2.5" fill="#8A7456" />
      {/* toile */}
      <path
        d="M6 46 Q6 6 50 4 Q94 6 94 46 Q86 54 78 46 Q70 54 62 46 Q54 54 50 46 Q46 54 38 46 Q30 54 22 46 Q14 54 6 46 Z"
        fill={canopy} stroke={COLORS.white} strokeWidth="2.5" strokeLinejoin="round"
      />
      <path d="M50 4 Q50 30 50 46" stroke="rgba(255,255,255,0.5)" strokeWidth="1.6" fill="none" />
      <path d="M50 6 Q30 18 22 46" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" fill="none" />
      <path d="M50 6 Q70 18 78 46" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" fill="none" />
      <circle cx="50" cy="4" r="3" fill={dark} />
    </g>
  </svg>
)

/** Goutte d'eau (style Lucide Droplet). */
export const Drop: React.FC<{ size: number; color?: string }> = ({ size, color = COLORS.ciel }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: 'visible' }}>
    <path
      d="M12 2.2c3 3.2 6 6.3 6 10.3a6 6 0 1 1-12 0c0-4 3-7.1 6-10.3z"
      fill={color} stroke={COLORS.white} strokeWidth="1.1" strokeLinejoin="round"
    />
    <path d="M9.3 12.8a2.8 2.8 0 0 0 2.4 3.1" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
  </svg>
)

/** Épingle de carte avec une icône au centre. */
export const Pin: React.FC<{ size: number; color?: string; children?: React.ReactNode }> = ({
  size, color = COLORS.ciel, children,
}) => (
  <div style={{ width: size, height: size * 1.3, position: 'relative' }}>
    <svg width={size} height={size * 1.3} viewBox="0 0 40 52" style={{ overflow: 'visible' }}>
      <path d="M20 2C10 2 2 9.6 2 19.2 2 32 20 50 20 50s18-18 18-30.8C38 9.6 30 2 20 2z"
        fill={color} stroke={COLORS.white} strokeWidth="2.5" />
      <circle cx="20" cy="19" r="11" fill={COLORS.white} />
    </svg>
    <div style={{ position: 'absolute', left: 0, top: size * 0.12, width: size, height: size * 0.55, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  </div>
)

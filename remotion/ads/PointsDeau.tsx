import React from 'react'
import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BRICOLAGE, COLORS, OUTFIT } from '../lib/theme'
import { Drop, Pin } from '../components/Shapes'
import { Cta, Reveal } from '../components/Ui'

/** Épingle « eau » qui tombe du haut avec un petit rebond. */
const DropPin: React.FC<{ delay: number; x: number; y: number; s?: number }> = ({ delay, x, y, s = 1 }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const drop = spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.8 } })
  const ty = (1 - drop) * -520
  return (
    <div style={{ position: 'absolute', left: x, top: y, transform: `translateY(${ty}px) scale(${s})`, opacity: drop > 0.02 ? 1 : 0 }}>
      <Pin size={120} color={COLORS.ciel}>
        <Drop size={52} color={COLORS.cielDeep} />
      </Pin>
    </div>
  )
}

export const PointsDeau: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: `linear-gradient(165deg, ${COLORS.ciel} 0%, ${COLORS.cielDeep} 100%)`, fontFamily: OUTFIT }}>
      {/* ── Scène A : la soif ── */}
      <Sequence durationInFrames={104}>
        <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, padding: 80 }}>
          <Reveal delay={2}>
            <Drop size={260} color={COLORS.white} />
          </Reveal>
          <Reveal delay={12}>
            <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 150, color: COLORS.white, letterSpacing: '-0.03em' }}>
              Soif ?
            </div>
          </Reveal>
          <Reveal delay={22} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 76, color: COLORS.navy, lineHeight: 1.05 }}>
              1 200 fontaines<br />gratuites à Paris
            </div>
          </Reveal>
        </AbsoluteFill>
      </Sequence>

      {/* ── Scène B : la carte ── */}
      <Sequence from={104} durationInFrames={98}>
        <AbsoluteFill style={{ background: `radial-gradient(120% 80% at 50% 30%, ${COLORS.cream} 0%, #DCEFFF 100%)` }}>
          {/* fausses rues */}
          {[300, 760, 1180, 1560].map((yy) => (
            <div key={`h${yy}`} style={{ position: 'absolute', left: 0, top: yy, width: '100%', height: 14, background: 'rgba(31,58,95,0.06)' }} />
          ))}
          {[170, 540, 900].map((xx) => (
            <div key={`v${xx}`} style={{ position: 'absolute', top: 0, left: xx, height: '100%', width: 14, background: 'rgba(31,58,95,0.06)' }} />
          ))}
          <DropPin delay={4} x={120} y={420} s={0.9} />
          <DropPin delay={12} x={620} y={300} s={1.25} />
          <DropPin delay={20} x={820} y={620} s={0.95} />
          <DropPin delay={28} x={300} y={760} s={1.05} />
          <Reveal delay={40} style={{ position: 'absolute', bottom: 120, left: 0, width: '100%', textAlign: 'center' }}>
            <div style={{ display: 'inline-block', padding: '28px 46px', borderRadius: 32, background: COLORS.navy }}>
              <span style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 70, color: COLORS.white }}>
                La plus proche, en 1 tap.
              </span>
            </div>
          </Reveal>
        </AbsoluteFill>
      </Sequence>

      {/* ── Scène C : CTA ── */}
      <Sequence from={202} durationInFrames={98}>
        <Cta tagline="Une fontaine gratuite, tout près" />
      </Sequence>
    </AbsoluteFill>
  )
}

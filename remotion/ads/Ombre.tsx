import React from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { BRICOLAGE, COLORS, OUTFIT } from '../lib/theme'
import { Parasol, Sun } from '../components/Shapes'
import { Cta, Reveal } from '../components/Ui'

export const Ombre: React.FC = () => {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, #FFE7A6 0%, ${COLORS.cream} 55%, #DCEFFF 100%)`, fontFamily: OUTFIT }}>
      {/* ── Scène A : le soleil tourne, l'ombre s'allonge ── */}
      <Sequence durationInFrames={104}>
        <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 70 }}>
          <Reveal delay={2} style={{ textAlign: 'center', marginBottom: 30 }}>
            <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 92, color: COLORS.navy, lineHeight: 1.04, letterSpacing: '-0.03em' }}>
              Plein soleil ou<br />pleine ombre ?
            </div>
          </Reveal>

          {/* Le soleil traverse le ciel */}
          {(() => {
            const t = interpolate(frame, [0, 104], [0, 1], { extrapolateRight: 'clamp' })
            const sunX = interpolate(t, [0, 1], [-280, 280])
            const sunY = interpolate(t, [0, 0.5, 1], [40, -40, 40])
            const shadowW = interpolate(t, [0, 0.5, 1], [220, 70, 220])
            const shadowX = interpolate(t, [0, 1], [120, -120])
            return (
              <div style={{ position: 'relative', width: 700, height: 560 }}>
                <div style={{ position: 'absolute', left: 350 + sunX - 90, top: 20 + sunY }}>
                  <Sun size={180} />
                </div>
                {/* ombre portée au sol */}
                <div style={{
                  position: 'absolute', left: 350 + shadowX - shadowW / 2, bottom: 60, width: shadowW, height: 40,
                  borderRadius: '50%', background: 'rgba(31,58,95,0.20)', filter: 'blur(6px)',
                }} />
                <div style={{ position: 'absolute', left: 350 - 110, bottom: 40 }}>
                  <Parasol size={220} canopy={COLORS.gold} dark="#E07A00" />
                </div>
              </div>
            )
          })()}
        </AbsoluteFill>
      </Sequence>

      {/* ── Scène B : la promesse ── */}
      <Sequence from={104} durationInFrames={98}>
        <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 56, padding: 70 }}>
          <Reveal delay={4} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 100, color: COLORS.navy, lineHeight: 1.02, letterSpacing: '-0.03em' }}>
              Les terrasses<br />à l'ombre,<br /><span style={{ color: COLORS.cielDeep }}>maintenant.</span>
            </div>
          </Reveal>
          <Reveal delay={16}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 26 }}>
              <Parasol size={140} canopy="#B6C0CE" dark="#8694A6" tiltDeg={-6} />
              <Parasol size={190} canopy={COLORS.gold} dark="#E07A00" />
              <Parasol size={150} canopy="#FFD24D" dark="#F2B70A" tiltDeg={6} />
            </div>
          </Reveal>
        </AbsoluteFill>
      </Sequence>

      {/* ── Scène C : CTA ── */}
      <Sequence from={202} durationInFrames={98}>
        <Cta tagline="La bonne terrasse, au bon moment" />
      </Sequence>
    </AbsoluteFill>
  )
}

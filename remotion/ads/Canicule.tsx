import React from 'react'
import { AbsoluteFill, Sequence, interpolateColors, useCurrentFrame } from 'remotion'
import { BRICOLAGE, COLORS, OUTFIT } from '../lib/theme'
import { Drop, Parasol, Sun } from '../components/Shapes'
import { Cta, Pill, Reveal } from '../components/Ui'

const IconCard: React.FC<{ icon: React.ReactNode; label: string; sub: string; accent: string }> = ({ icon, label, sub, accent }) => (
  <div style={{
    width: 360, padding: '40px 28px', borderRadius: 36, background: COLORS.white,
    border: `3px solid ${accent}55`, boxShadow: '0 24px 60px rgba(31,58,95,0.18)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18,
  }}>
    {icon}
    <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 52, color: COLORS.navy }}>{label}</div>
    <div style={{ fontFamily: OUTFIT, fontWeight: 600, fontSize: 30, color: '#6f7a8a', textAlign: 'center' }}>{sub}</div>
  </div>
)

export const Canicule: React.FC = () => {
  const frame = useCurrentFrame()
  const top = interpolateColors(frame, [0, 110, 150], ['#FF8A3D', '#FF5A3C', COLORS.cream])
  const bot = interpolateColors(frame, [0, 110, 150], ['#E0431F', '#C2331A', '#BFE0FF'])

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${top} 0%, ${bot} 100%)`, fontFamily: OUTFIT }}>
      {/* ── Scène A : la chaleur ── */}
      <Sequence durationInFrames={110}>
        <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: 80 }}>
          <Sun size={300} />
          <Reveal delay={6}>
            <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 300, lineHeight: 0.9, color: COLORS.white, textShadow: '0 10px 50px rgba(120,20,0,0.45)' }}>
              38°
            </div>
          </Reveal>
          <Reveal delay={16}>
            <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 96, color: COLORS.white, letterSpacing: '-0.03em' }}>
              Paris suffoque.
            </div>
          </Reveal>
          <Reveal delay={28}>
            <Pill bg="rgba(0,0,0,0.18)">🌡️ Alerte canicule</Pill>
          </Reveal>
        </AbsoluteFill>
      </Sequence>

      {/* ── Scène B : la solution ── */}
      <Sequence from={110} durationInFrames={92}>
        <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 64, padding: 70 }}>
          <Reveal delay={4} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 104, color: COLORS.navy, lineHeight: 1.02, letterSpacing: '-0.03em' }}>
              Garde la tête<br />froide.
            </div>
          </Reveal>
          <Reveal delay={16}>
            <div style={{ display: 'flex', gap: 40 }}>
              <IconCard icon={<Parasol size={150} />} label="Ombre" sub="Terrasses à l'ombre, en direct" accent={COLORS.gold} />
              <IconCard icon={<Drop size={140} />} label="Eau" sub="Fontaines gratuites tout près" accent={COLORS.ciel} />
            </div>
          </Reveal>
        </AbsoluteFill>
      </Sequence>

      {/* ── Scène C : CTA ── */}
      <Sequence from={202} durationInFrames={98}>
        <Cta tagline="L'ombre & l'eau, en direct" />
      </Sequence>
    </AbsoluteFill>
  )
}

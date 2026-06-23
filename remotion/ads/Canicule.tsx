import React from 'react'
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { BRICOLAGE, COLORS } from '../lib/theme'
import { Parasol } from '../components/Shapes'
import { Center, Float, GoldHalo, Kinetic, LightSweep, SweatingSun, Thermometer } from '../components/Motion'
import { Cta } from '../components/Ui'

/**
 * POST 1 — « Le soleil, ton nouvel ennemi ».
 * Ton : auto-retournement. HopSoleil, qui traque le soleil, te dit de le fuir.
 * Anim : soleil qui transpire (chaud) → un shadow-wipe diagonal refroidit tout
 * en navy → parasol + « Reste à l'ombre » (le vilain devient le héros).
 */
export const Canicule: React.FC = () => {
  const frame = useCurrentFrame()
  // Wipe diagonal : l'ombre balaie l'écran et refroidit la scène.
  const wipe = interpolate(frame, [150, 178], [0, 150], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ fontFamily: BRICOLAGE }}>
      {/* ─────────── SCÈNE CHAUDE ─────────── */}
      <AbsoluteFill style={{ background: 'linear-gradient(160deg,#FF8A3D 0%,#E0431F 100%)' }}>
        <GoldHalo intensity={1.2} />

        <Sequence durationInFrames={80}>
          <Center gap={50}>
            <Float amp={10} speed={34}><SweatingSun size={300} /></Float>
            <Kinetic text="Ta terrasse plein sud ?" size={120} color={COLORS.white} shadow="0 8px 36px rgba(120,20,0,0.4)" />
          </Center>
        </Sequence>

        <Sequence from={80} durationInFrames={70}>
          <Center gap={34}>
            <Float amp={8} speed={30}><Thermometer frac={0.93} label="39°" /></Float>
            <Kinetic text="À 39°, c'est un barbecue." size={108} color={COLORS.white} />
            <Kinetic text="Et c'est toi, la viande. 🍖" size={92} color={COLORS.gold} delay={16} weight={800} />
          </Center>
        </Sequence>
      </AbsoluteFill>

      {/* ─────────── SCÈNE FROIDE (révélée par le shadow-wipe) ─────────── */}
      <AbsoluteFill style={{
        background: 'linear-gradient(160deg,#2A4A78 0%,#1F3A5F 100%)',
        clipPath: `polygon(-12% 0, ${wipe}% 0, ${wipe - 26}% 100%, -12% 100%)`,
      }}>
        <GoldHalo intensity={0.7} />
        <Sequence from={170}>
          <Center gap={44}>
            <Float amp={10} speed={36}><Parasol size={300} canopy={COLORS.gold} dark="#E07A00" /></Float>
            <Kinetic text="Reste à l'ombre." size={148} color={COLORS.gold} delay={6} />
            <Kinetic text="On te dit où il en reste." size={62} color={COLORS.cream} delay={22} weight={700} />
          </Center>
        </Sequence>
      </AbsoluteFill>

      {/* éclat doré qui masque la bascule chaud → froid */}
      <LightSweep from={150} dur={26} />

      {/* ─────────── CTA ─────────── */}
      <Sequence from={216} durationInFrames={84}>
        <Cta tagline="HopSoleil te trouve l'ombre" />
      </Sequence>
    </AbsoluteFill>
  )
}

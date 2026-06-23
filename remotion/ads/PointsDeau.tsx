import React from 'react'
import { AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BRICOLAGE, COLORS, OUTFIT } from '../lib/theme'
import { Drop, Pin } from '../components/Shapes'
import { Center, Float, GoldHalo, Kinetic, LightSweep } from '../components/Motion'
import { Cta } from '../components/Ui'

/** Goutte qui tombe puis splashe (onde bleue) au point donné, à `land`. */
const Splash: React.FC<{ land: number; x: number; y: number; size?: number }> = ({ land, x, y, size = 46 }) => {
  const frame = useCurrentFrame()
  const fall = interpolate(frame, [land - 16, land], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const dropY = interpolate(fall, [0, 1], [-440, 0])
  const t = frame - land
  const r = t >= 0 ? interpolate(t, [0, 30], [6, 110], { extrapolateRight: 'clamp' }) : 0
  const ro = t >= 0 ? interpolate(t, [0, 4, 30], [0, 0.7, 0]) : 0
  return (
    <>
      {frame < land && fall > 0 && (
        <div style={{ position: 'absolute', left: x - size / 2, top: y + dropY - size / 2 }}>
          <Drop size={size} color={COLORS.ciel} />
        </div>
      )}
      {t >= 0 && (
        <div style={{ position: 'absolute', left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: `4px solid rgba(78,163,255,${ro.toFixed(3)})` }} />
      )}
      {t >= 0 && (
        <div style={{ position: 'absolute', left: x - 8, top: y - 8, width: 16, height: 16, borderRadius: '50%', background: COLORS.ciel, opacity: interpolate(t, [0, 24], [1, 0.35], { extrapolateRight: 'clamp' }) }} />
      )}
    </>
  )
}

const Counter: React.FC<{ to: number; a: number; b: number }> = ({ to, a, b }) => {
  const frame = useCurrentFrame()
  const v = Math.round(interpolate(frame, [a, b], [0, to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }))
  return <>{v.toLocaleString('fr-FR')}</>
}

const NearPin: React.FC<{ at: number }> = ({ at }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - at, fps, config: { damping: 10, mass: 0.7 } })
  if (frame < at) return null
  return (
    <div style={{ position: 'absolute', left: 0, top: 980, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, transform: `scale(${interpolate(s, [0, 1], [0.4, 1])})` }}>
      <Pin size={150} color={COLORS.ciel}><Drop size={64} color={COLORS.cielDeep} /></Pin>
      <div style={{ padding: '20px 40px', borderRadius: 999, background: COLORS.gold, color: COLORS.navy, fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 64 }}>
        Le plus proche : 200 m
      </div>
    </div>
  )
}

export const PointsDeau: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(165deg,#244A7A 0%,#1F3A5F 100%)', fontFamily: BRICOLAGE }}>
      <GoldHalo intensity={0.5} />

      {/* ─── Beat 1 : la punchline qui pique ─── */}
      <Sequence durationInFrames={76}>
        <Center gap={38}>
          <Float amp={12} speed={32}><Drop size={230} color={COLORS.white} /></Float>
          <Kinetic text="Tu payes ta flotte 4 €." size={120} color={COLORS.white} />
        </Center>
      </Sequence>

      {/* ─── Beat 2 : la vérité ─── */}
      <Sequence from={76} durationInFrames={70}>
        <Center gap={20}>
          <Kinetic text="Une fontaine gratuite" size={118} color={COLORS.white} />
          <Kinetic text="à 30 mètres." size={140} color={COLORS.gold} delay={12} />
        </Center>
      </Sequence>

      {/* ─── Beat 3 : la carte (gouttes → compteur → le plus proche) ─── */}
      <Sequence from={146} durationInFrames={74}>
        <AbsoluteFill>
          {/* grille de rues */}
          {[260, 520, 780, 1280, 1540].map((yy) => (
            <div key={`h${yy}`} style={{ position: 'absolute', left: 0, top: yy, width: '100%', height: 10, background: 'rgba(255,255,255,0.06)' }} />
          ))}
          {[180, 470, 760, 980].map((xx) => (
            <div key={`v${xx}`} style={{ position: 'absolute', top: 0, left: xx, height: '100%', width: 10, background: 'rgba(255,255,255,0.06)' }} />
          ))}
          {/* compteur */}
          <div style={{ position: 'absolute', top: 150, left: 0, width: '100%', textAlign: 'center' }}>
            <div style={{ fontFamily: BRICOLAGE, fontWeight: 800, fontSize: 190, color: COLORS.gold, lineHeight: 1 }}>
              <Counter to={1200} a={6} b={56} />
            </div>
            <div style={{ fontFamily: OUTFIT, fontWeight: 800, fontSize: 60, color: COLORS.white, letterSpacing: '0.02em' }}>
              fontaines gratuites
            </div>
          </div>
          {/* pluie de gouttes qui splashent sur la ville */}
          <Splash land={8} x={250} y={760} />
          <Splash land={16} x={690} y={640} />
          <Splash land={24} x={500} y={900} />
          <Splash land={32} x={840} y={820} />
          <Splash land={40} x={360} y={1000} />
          <Splash land={48} x={760} y={1080} />
          {/* le plus proche */}
          <NearPin at={56} />
        </AbsoluteFill>
      </Sequence>

      <LightSweep from={146} dur={22} />

      {/* ─── CTA ─── */}
      <Sequence from={220} durationInFrames={80}>
        <Cta tagline="La map des fontaines, en 1 tap" />
      </Sequence>
    </AbsoluteFill>
  )
}

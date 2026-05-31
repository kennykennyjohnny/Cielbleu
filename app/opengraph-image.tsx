import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'HopSoleil — Les terrasses ensoleillées de Paris'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(140deg, #0f2744 0%, #1F3A5F 55%, #0b1f3a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow halo top-right */}
        <div
          style={{
            position: 'absolute',
            top: -160,
            right: -120,
            width: 560,
            height: 560,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(237,193,69,0.28) 0%, transparent 68%)',
            display: 'flex',
          }}
        />
        {/* Glow halo bottom-left */}
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            left: -80,
            width: 380,
            height: 380,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(78,163,255,0.16) 0%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* Sun circle */}
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 38% 36%, #ffe066 0%, #EDC145 60%, #f59e0b 100%)',
            boxShadow: '0 0 0 18px rgba(237,193,69,0.14), 0 0 0 36px rgba(237,193,69,0.07)',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        />

        {/* Brand name */}
        <div
          style={{
            fontSize: 92,
            fontWeight: 900,
            color: '#EDC145',
            letterSpacing: '-3px',
            lineHeight: 1,
            marginBottom: 18,
            display: 'flex',
          }}
        >
          HopSoleil
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 30,
            color: 'rgba(255,255,255,0.68)',
            fontWeight: 500,
            letterSpacing: '-0.3px',
            display: 'flex',
          }}
        >
          Les terrasses les plus ensoleillées de Paris ☀
        </div>
      </div>
    ),
    { ...size }
  )
}

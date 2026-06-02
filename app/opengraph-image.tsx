import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// Image OG/partage de la page d'accueil : le VRAI logo HopSoleil sur fond crème.
// S'affiche sur iMessage, WhatsApp, Slack, Facebook, LinkedIn, Twitter/X…
// (runtime Node par défaut : nécessaire pour lire le PNG du logo via fs.)
export const alt = 'HopSoleil — Trouve ta terrasse au soleil à Paris'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const SOLEIL = '#EDC145'
const NAVY = '#1F3A5F'
const CREME = '#FFFDF7'

export default async function Image() {
  // Logo embarqué en base64 (le plus fiable : aucun fetch réseau au runtime).
  // Si la lecture échoue, on retombe sur une carte de marque dessinée en CSS.
  let logoSrc: string | null = null
  try {
    const buf = await readFile(join(process.cwd(), 'public', 'logo-hopsoleil.png'))
    logoSrc = `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    logoSrc = null
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(160deg, #FFF1C9 0%, ${CREME} 46%, #FFFFFF 100%)`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Halo solaire haut-droite */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -160,
            width: 640,
            height: 640,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(237,193,69,0.45) 0%, transparent 66%)',
            display: 'flex',
          }}
        />

        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoSrc} width={900} height={230} alt="HopSoleil" style={{ objectFit: 'contain' }} />
        ) : (
          // Fallback de marque dessiné si le PNG n'est pas lisible
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: '50%',
                background: `radial-gradient(circle at 38% 36%, #ffe066 0%, ${SOLEIL} 60%, #f59e0b 100%)`,
                boxShadow: '0 0 0 14px rgba(237,193,69,0.18)',
                display: 'flex',
              }}
            />
            <div style={{ fontSize: 96, fontWeight: 900, letterSpacing: '-3px', display: 'flex' }}>
              <span style={{ color: NAVY }}>Hop</span>
              <span style={{ color: SOLEIL }}>Soleil</span>
            </div>
          </div>
        )}

        {/* Tagline */}
        <div
          style={{
            marginTop: 40,
            fontSize: 40,
            fontWeight: 700,
            color: NAVY,
            letterSpacing: '-0.5px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          ☀ Trouve ta terrasse au soleil à Paris
        </div>

        {/* Domaine */}
        <div
          style={{
            marginTop: 22,
            fontSize: 26,
            fontWeight: 600,
            color: 'rgba(31,58,95,0.55)',
            display: 'flex',
          }}
        >
          hopsoleil.fr
        </div>
      </div>
    ),
    { ...size }
  )
}

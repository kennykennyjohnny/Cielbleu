// Favicon dynamique — cercle blanc + logo HopSoleil
// Next.js App Router : ce fichier génère automatiquement <link rel="icon">
import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'
export const runtime = 'nodejs'

export default function Icon() {
  const buf = readFileSync(join(process.cwd(), 'public', 'logo-icon.png'))
  const src = `data:image/png;base64,${buf.toString('base64')}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          width={162}
          height={162}
          style={{ objectFit: 'contain' }}
          alt=""
        />
      </div>
    ),
    { ...size },
  )
}

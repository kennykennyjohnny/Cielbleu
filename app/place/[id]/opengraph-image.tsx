import { ImageResponse } from 'next/og'

// Image OG générée à la volée pour chaque terrasse partagée.
export const runtime = 'edge'
export const alt = 'Terrasse ensoleillée à Paris — HopSoleil'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar', restaurant: 'Restaurant', cafe: 'Café', park: 'Parc',
}

interface PlaceLite {
  name: string
  type: string
  arrondissement: number | null
}

async function fetchPlace(id: string): Promise<PlaceLite | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) return null
  try {
    const url = `${base}/rest/v1/places?id=eq.${encodeURIComponent(id)}&select=name,type,arrondissement&limit=1`
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!res.ok) return null
    const rows = (await res.json()) as PlaceLite[]
    return rows?.[0] ?? null
  } catch {
    return null
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const place = await fetchPlace(id)

  const name = place?.name ?? 'Terrasse à Paris'
  const arr  = place?.arrondissement
  const typeLabel = place ? (TYPE_LABEL[place.type] ?? place.type) : null
  const subtitle = [typeLabel, arr != null ? `Paris ${arr}${arr === 1 ? 'er' : 'e'}` : null]
    .filter(Boolean)
    .join(' · ')

  // Taille de police adaptative selon la longueur du nom
  const nameSize = name.length > 28 ? 66 : name.length > 18 ? 84 : 100

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(140deg, #0f2744 0%, #1F3A5F 55%, #0b1f3a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Glow halo top-right */}
        <div
          style={{
            position: 'absolute',
            top: -180,
            right: -140,
            width: 600,
            height: 600,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(237,193,69,0.30) 0%, transparent 68%)',
            display: 'flex',
          }}
        />

        {/* Top row : wordmark + sun */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 38% 36%, #ffe066 0%, #EDC145 60%, #f59e0b 100%)',
              boxShadow: '0 0 0 10px rgba(237,193,69,0.14)',
              display: 'flex',
            }}
          />
          <div style={{ fontSize: 40, fontWeight: 900, color: '#EDC145', letterSpacing: '-1.5px', display: 'flex' }}>
            HopSoleil
          </div>
        </div>

        {/* Place name + subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {subtitle && (
            <div
              style={{
                fontSize: 30,
                color: 'rgba(237,193,69,0.92)',
                fontWeight: 700,
                letterSpacing: '0.5px',
                marginBottom: 18,
                display: 'flex',
              }}
            >
              {subtitle}
            </div>
          )}
          <div
            style={{
              fontSize: nameSize,
              fontWeight: 900,
              color: '#ffffff',
              letterSpacing: '-2.5px',
              lineHeight: 1.0,
              display: 'flex',
            }}
          >
            {name}
          </div>
        </div>

        {/* Bottom tagline */}
        <div
          style={{
            fontSize: 28,
            color: 'rgba(255,255,255,0.66)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          ☀ Voir l&apos;ensoleillement heure par heure
        </div>
      </div>
    ),
    { ...size }
  )
}

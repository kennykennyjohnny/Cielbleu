import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy Street View Static API — évite d'exposer la clé API côté client.
 * GET /api/streetview?lat=48.856&lng=2.347&w=600&h=300&heading=0&fov=90&pitch=0
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const lat = parseFloat(p.get('lat') ?? '')
  const lng = parseFloat(p.get('lng') ?? '')

  if (isNaN(lat) || isNaN(lng)) return new NextResponse('Missing lat/lng', { status: 400 })
  if (lat < 48.7 || lat > 49.0 || lng < 2.1 || lng > 2.6) {
    return new NextResponse('Out of bounds', { status: 400 })
  }

  const w       = Math.min(800, Math.max(100, parseInt(p.get('w') ?? '600')))
  const h       = Math.min(500, Math.max(80,  parseInt(p.get('h') ?? '300')))
  const heading = p.get('heading') ?? '0'
  const fov     = Math.min(120, Math.max(10, parseInt(p.get('fov') ?? '90')))
  const pitch   = p.get('pitch') ?? '0'

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return new NextResponse('Service unavailable', { status: 503 })

  const url = `https://maps.googleapis.com/maps/api/streetview?size=${w}x${h}&location=${lat},${lng}&heading=${heading}&fov=${fov}&pitch=${pitch}&key=${apiKey}`

  try {
    const res = await fetch(url)
    if (!res.ok) return new NextResponse('Not found', { status: 404 })

    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    // Google returns a grey "no imagery" image with status 200 — pass it through
    const data = await res.arrayBuffer()
    return new NextResponse(data, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    })
  } catch {
    return new NextResponse('Upstream error', { status: 502 })
  }
}

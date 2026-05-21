import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy Street View Static API — évite d'exposer la clé API côté client.
 * En ne passant PAS de heading, Google auto-oriente la caméra vers le POI
 * (l'entrée/façade du bar/restaurant).
 * GET /api/streetview?lat=48.856&lng=2.347&w=600&h=300
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

  const w   = Math.min(800, Math.max(100, parseInt(p.get('w') ?? '600')))
  const h   = Math.min(500, Math.max(80,  parseInt(p.get('h') ?? '300')))
  // fov=75 = champ moins large = on zoom un peu plus sur la façade
  const fov = Math.min(120, Math.max(10, parseInt(p.get('fov') ?? '75')))

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return new NextResponse('Service unavailable', { status: 503 })

  // Sans `heading` → Google auto-oriente vers le POI (façade/entrée).
  // `source=outdoor` = préfère l'imagerie extérieure, évite les lobbies d'hôtels.
  // `return_error_code=true` → 404 si vraiment aucune image disponible.
  const url = [
    `https://maps.googleapis.com/maps/api/streetview`,
    `?size=${w}x${h}`,
    `&location=${lat},${lng}`,
    `&fov=${fov}`,
    `&pitch=5`,           // légèrement incliné vers le haut → on voit l'enseigne/terrasse
    `&source=outdoor`,
    `&return_error_code=true`,
    `&key=${apiKey}`,
  ].join('')

  try {
    const res = await fetch(url)
    if (!res.ok) return new NextResponse('No Street View imagery', { status: 404 })

    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    const data = await res.arrayBuffer()
    return new NextResponse(data, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=604800, stale-while-revalidate=2592000',
      },
    })
  } catch {
    return new NextResponse('Upstream error', { status: 502 })
  }
}

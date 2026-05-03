import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy sécurisé pour les photos Google Places.
 * Cachées côté serveur : la clé API n'est jamais exposée au client.
 * GET /api/photo?ref=<photo_reference>&w=600
 */
export async function GET(req: NextRequest) {
  const ref = req.nextUrl.searchParams.get('ref')
  const w   = req.nextUrl.searchParams.get('w') ?? '600'

  if (!ref) return new NextResponse('Missing ref', { status: 400 })

  // Validation: photo_reference Google est alphanum + tirets/underscores, 20-500 chars
  if (!/^[A-Za-z0-9_\-]{10,600}$/.test(ref)) {
    return new NextResponse('Invalid ref', { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return new NextResponse('Service unavailable', { status: 503 })

  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${w}&photo_reference=${ref}&key=${apiKey}`

  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) return new NextResponse('Not found', { status: 404 })

    const data = await res.arrayBuffer()
    return new NextResponse(data, {
      headers: {
        'Content-Type':  res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    })
  } catch {
    return new NextResponse('Fetch error', { status: 502 })
  }
}

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

  // Validation: un photo_reference Google contient des caractères base64url / path
  // encodé. Les références récentes sont parfois très longues (>1k) → on autorise
  // jusqu'à 4000 car. Une borne trop basse (l'ancien 800) rejetait des refs valides
  // et faisait échouer le chargement de certaines photos.
  if (!/^[A-Za-z0-9_\-/+=.]{10,4000}$/.test(ref)) {
    return new NextResponse('Invalid ref', { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return new NextResponse('Service unavailable', { status: 503 })

  const url = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${w}&photo_reference=${ref}&key=${apiKey}`

  // 1 tentative + 1 retry sur erreur transitoire (timeout réseau ou 5xx Google).
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const res = await fetch(url, { redirect: 'follow', signal: controller.signal })
      clearTimeout(timeout)

      if (res.ok) {
        const data = await res.arrayBuffer()
        return new NextResponse(data, {
          headers: {
            'Content-Type':  res.headers.get('content-type') ?? 'image/jpeg',
            'Cache-Control': 'public, max-age=604800, immutable',
          },
        })
      }
      // 4xx (ref expirée / introuvable) : inutile de réessayer.
      if (res.status < 500) return new NextResponse('Not found', { status: 404 })
      // 5xx : on retente une fois.
    } catch {
      clearTimeout(timeout)
      // abort/réseau : on retente une fois.
    }
  }
  return new NextResponse('Upstream unavailable', { status: 502 })
}

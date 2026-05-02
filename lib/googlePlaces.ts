const BASE = 'https://maps.googleapis.com/maps/api/place'

export interface GooglePlace {
  place_id: string
  name: string
  vicinity: string
  geometry: { location: { lat: number; lng: number } }
  rating?: number
  price_level?: number
  photos?: { photo_reference: string; height: number; width: number }[]
  opening_hours?: { open_now?: boolean; weekday_text?: string[] }
  types: string[]
}

export interface NearbySearchResponse {
  results: GooglePlace[]
  next_page_token?: string
  status: string
  error_message?: string
}

export async function searchNearbyPlaces(
  lat: number,
  lng: number,
  radius: number,
  type: string,
  pageToken?: string
): Promise<NearbySearchResponse> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY manquante')

  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: String(radius),
    type,
    key: apiKey,
    language: 'fr',
  })

  if (pageToken) params.set('pagetoken', pageToken)

  const res = await fetch(`${BASE}/nearbysearch/json?${params}`)
  if (!res.ok) throw new Error(`Google Places erreur: ${res.status}`)

  const data: NearbySearchResponse = await res.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places status: ${data.status} — ${data.error_message ?? ''}`)
  }

  return data
}

// URL d'une photo Google Places
export function getPhotoUrl(photoReference: string, maxWidth = 800): string {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  return `${BASE}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${apiKey}`
}

// URL Google Maps pour un lieu
export function getGoogleMapsUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`
}

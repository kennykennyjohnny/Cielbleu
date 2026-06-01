// ── Géocodage Mapbox (rues / adresses / quartiers Paris) ──────────────────────
// Permet de chercher "rue de la Roquette", "place de la République"… et de
// recentrer la carte dessus. On limite à la région parisienne pour rester
// pertinent (bbox Île-de-France resserrée sur Paris + petite couronne).

export interface GeoResult {
  id: string
  /** Libellé court (ex. "Rue de la Roquette") */
  title: string
  /** Contexte (ex. "75011 Paris") */
  subtitle: string
  lng: number
  lat: number
  /** Type Mapbox dominant : address, street, neighborhood, locality, poi… */
  kind: string
  /** Zoom suggéré selon la granularité du résultat */
  zoom: number
}

// Bbox Paris + très proche couronne : [minLng, minLat, maxLng, maxLat]
const PARIS_BBOX = '2.10,48.78,2.55,48.95'
const PARIS_PROXIMITY = '2.3522,48.8566'

// Granularité → zoom cible quand on vole vers le résultat
const ZOOM_BY_KIND: Record<string, number> = {
  address: 17,
  poi: 16.5,
  street: 15.5,
  neighborhood: 14.5,
  locality: 13.5,
  place: 12.5,
  postcode: 13,
  region: 11,
}

interface MapboxFeature {
  id: string
  text: string
  place_name: string
  place_type: string[]
  center: [number, number]
  context?: { id: string; text: string }[]
}

/**
 * Géocode une requête dans Paris. Renvoie [] si pas de token ou erreur réseau.
 * Passe un AbortSignal pour annuler la requête précédente (frappe rapide).
 */
export async function geocodeParis(query: string, signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim()
  if (q.length < 3) return []
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return []

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${token}` +
    `&country=fr&language=fr&limit=5&autocomplete=true` +
    `&bbox=${PARIS_BBOX}&proximity=${PARIS_PROXIMITY}` +
    `&types=address,street,neighborhood,locality,place,postcode,poi`

  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return []
    const data = (await res.json()) as { features?: MapboxFeature[] }
    const features = data.features ?? []
    return features.map((f) => {
      const kind = f.place_type?.[0] ?? 'address'
      // Sous-titre = code postal + ville si dispo, sinon le reste du place_name
      const postcode = f.context?.find((c) => c.id.startsWith('postcode'))?.text
      const city     = f.context?.find((c) => c.id.startsWith('place'))?.text
      const subtitle = [postcode, city].filter(Boolean).join(' ') ||
        f.place_name.split(',').slice(1, 3).join(',').trim()
      return {
        id: f.id,
        title: f.text,
        subtitle,
        lng: f.center[0],
        lat: f.center[1],
        kind,
        zoom: ZOOM_BY_KIND[kind] ?? 15.5,
      }
    })
  } catch {
    return [] // abort ou réseau : silencieux
  }
}

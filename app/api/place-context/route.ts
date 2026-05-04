import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/place-context?lat=...&lng=...
 *
 * Interroge Paris Open Data (OPENDATASOFT v2) pour enrichir un lieu :
 *  - volumesbatisparis : polygon exact du bâtiment + nb_pl (étages)
 *  - terrasses-autorisations : dimensions réelles de la terrasse autorisée
 *  - fontaines-a-boire : fontaines proches disponibles
 *  - sanisettesparis : toilettes proches en service
 *
 * Réponse mise en cache 1h (CDN + browser).
 */

const PARIS = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets'

async function query(
  dataset: string,
  geoField: string,
  lat: number,
  lng: number,
  distM: number,
  select: string,
  limit = 5,
): Promise<Record<string, unknown>[]> {
  try {
    const where = `distance(${geoField}, geogpoint(${lat}, ${lng}), ${distM}m)`
    const url = `${PARIS}/${dataset}/records?where=${encodeURIComponent(where)}&select=${encodeURIComponent(select)}&limit=${limit}`
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 43200 },
    })
    if (!r.ok) return []
    const j = await r.json() as { results?: Record<string, unknown>[] }
    return j.results ?? []
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get('lat') ?? '')
  const lng = parseFloat(searchParams.get('lng') ?? '')
  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'lat/lng requis' }, { status: 400 })
  }

  const [buildings, terraces, fontaines, sanisettes] = await Promise.allSettled([
    // Building volumes — geom_x_y est le centroïde du bâtiment
    query('volumesbatisparis', 'geom_x_y', lat, lng, 100,
      'nb_pl,l_plan_h,geo_shape,objectid,n_ar,h_et_max', 10),

    // Terrasses autorisées — geo_point_2d
    query('terrasses-autorisations', 'geo_point_2d', lat, lng, 80,
      'nom_enseigne,longueur,largeur,typologie,geo_point_2d', 5),

    // Fontaines à boire disponibles
    query('fontaines-a-boire', 'geo_point_2d', lat, lng, 500,
      'type_objet,modele,dispo,geo_point_2d', 4),

    // Sanisettes en service
    query('sanisettesparis', 'geo_point_2d', lat, lng, 600,
      'type,statut,adresse,acces_pmr,geo_point_2d', 4),
  ])

  // Choisir le meilleur bâtiment : celui dont le polygone contient lat/lng,
  // sinon le plus proche par centroïde (déjà trié par distance côté API).
  const buildingList = buildings.status === 'fulfilled' ? buildings.value : []
  const bestBuilding = pickBestBuilding(buildingList, lat, lng)

  return NextResponse.json(
    {
      building: bestBuilding,
      terrace: terraces.status === 'fulfilled' ? (terraces.value[0] ?? null) : null,
      fontaines: fontaines.status === 'fulfilled' ? fontaines.value : [],
      sanisettes: sanisettes.status === 'fulfilled' ? sanisettes.value : [],
    },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function pickBestBuilding(
  list: Record<string, unknown>[],
  lat: number,
  lng: number,
): Record<string, unknown> | null {
  if (!list.length) return null

  // Préférer le bâtiment dont le poly contient le point
  for (const b of list) {
    const shape = b.geo_shape as { type?: string; coordinates?: unknown } | null
    if (!shape) continue
    const poly = normalizeToPolygon(shape)
    if (poly && pointInPolygon(lng, lat, poly.coordinates[0] as number[][])) {
      return b
    }
  }
  // Fallback : premier résultat (le plus proche par centroïde)
  return list[0]
}

function normalizeToPolygon(
  shape: { type?: string; coordinates?: unknown },
): { type: 'Polygon'; coordinates: unknown[][] } | null {
  if (!shape?.type) return null
  if (shape.type === 'Polygon') return shape as { type: 'Polygon'; coordinates: unknown[][] }
  if (shape.type === 'MultiPolygon') {
    // Prendre le plus grand anneau
    const coords = shape.coordinates as unknown[][][]
    if (!coords?.length) return null
    return { type: 'Polygon', coordinates: coords[0] }
  }
  return null
}

/** Ray-casting point-in-polygon (coordonnées WGS84). */
function pointInPolygon(x: number, y: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

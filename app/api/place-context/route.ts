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
    // ODSQL v2.1 : la fonction `distance(field, geogpoint(lat,lng), d)` a été
    // retirée par OPENDATASOFT → on utilise `within_distance` avec un littéral
    // WKT `geom'POINT(lng lat)'` (ATTENTION : ordre lon puis lat).
    const where = `within_distance(${geoField}, geom'POINT(${lng} ${lat})', ${distM}m)`
    const url = `${PARIS}/${dataset}/records?where=${encodeURIComponent(where)}&select=${encodeURIComponent(select)}&limit=${limit}`
    const r = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 43200 },
    })
    if (!r.ok) {
      // Log explicite : si OPENDATASOFT change encore sa syntaxe ODSQL, on le
      // verra dans les logs Vercel au lieu d'un échec silencieux (cf. la panne
      // `geogpoint` → `within_distance`).
      console.error(`[place-context] ${dataset} → HTTP ${r.status}`)
      return []
    }
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
    // Building volumes — geom_x_y est le centroïde, `geom` la Feature GeoJSON
    // (le champ `geo_shape` historique a été renommé `geom` par la Ville de Paris).
    query('volumesbatisparis', 'geom_x_y', lat, lng, 100,
      'nb_pl,l_plan_h,geom,objectid,n_ar,h_et_max', 10),

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

  // Voisins (polygone + hauteur) pour le calcul du score de surface (ombres).
  // On renvoie l'anneau extérieur de chaque bâtiment proche + sa hauteur estimée.
  const neighbors = buildingList
    .map(toNeighbor)
    .filter((n): n is { ring: number[][]; height: number } => n !== null)

  // On expose la géométrie sous la forme historique `geo_shape` ({type,coordinates})
  // pour ne rien casser côté consommateurs (3D, MapView, TerraceSunMeter), et on
  // retire la Feature `geom` brute (volumineuse) du payload.
  const building = bestBuilding
    ? (() => {
        const { geom: _geom, ...rest } = bestBuilding
        void _geom
        return { ...rest, geo_shape: buildingGeometry(bestBuilding) }
      })()
    : null

  return NextResponse.json(
    {
      building,
      neighbors,
      terrace: terraces.status === 'fulfilled' ? (terraces.value[0] ?? null) : null,
      fontaines: fontaines.status === 'fulfilled' ? fontaines.value : [],
      sanisettes: sanisettes.status === 'fulfilled' ? sanisettes.value : [],
    },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
  )
}

// Extrait la géométrie ({type,coordinates}) d'un enregistrement volumesbatisparis.
// `geom` est une Feature GeoJSON (nouveau schéma) ; on retombe sur `geo_shape`
// (ancien schéma) par sécurité.
function buildingGeometry(
  b: Record<string, unknown>,
): { type?: string; coordinates?: unknown } | null {
  const geom = b.geom as
    | { type?: string; geometry?: { type?: string; coordinates?: unknown }; coordinates?: unknown }
    | null
    | undefined
  if (geom) {
    if (geom.type === 'Feature' && geom.geometry) return geom.geometry
    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      return geom as { type: string; coordinates: unknown }
    }
  }
  return (b.geo_shape as { type?: string; coordinates?: unknown } | null) ?? null
}

// Convertit un enregistrement volumesbatisparis en { ring, height } exploitable.
function toNeighbor(b: Record<string, unknown>): { ring: number[][]; height: number } | null {
  const shape = buildingGeometry(b)
  if (!shape) return null
  const poly = normalizeToPolygon(shape)
  const ring = poly?.coordinates?.[0] as number[][] | undefined
  if (!ring || ring.length < 3) return null
  const height = buildingHeight(b)
  if (height < 2) return null
  return { ring, height }
}

// Hauteur (m). ⚠️ Sémantique des champs volumesbatisparis (vérifiée sur l'API,
// ne PAS confondre avec des mètres) :
//   • nb_pl    = nombre TOTAL de planchers, RDC inclus   (R+5 → 6, R → 1)
//   • h_et_max = nombre d'étages AU-DESSUS du RDC        (R+5 → 5, R → 0)
//   • l_plan_h = libellé « R+N »
// On convertit en mètres : ~3,1 m par niveau. (L'ancien code renvoyait h_et_max
// tel quel → tous les immeubles haussmanniens « R+5 » lus à 5 m, ombres nulles,
// terrasses faussement à 100 % de soleil. Corrigé.)
function buildingHeight(b: Record<string, unknown>): number {
  const FLOOR_M = 3.1
  const nbPl = b.nb_pl
  if (typeof nbPl === 'number' && nbPl > 0) return nbPl * FLOOR_M + 3
  const hEt = b.h_et_max
  if (typeof hEt === 'number' && hEt >= 0) return (hEt + 1) * FLOOR_M + 3
  const planH = b.l_plan_h
  if (typeof planH === 'string') {
    const m = planH.match(/R\s*\+\s*(\d+)/i)
    if (m) return (parseInt(m[1], 10) + 1) * FLOOR_M + 3
    if (/^\s*R\s*$/i.test(planH)) return 6
  }
  return 18
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
    const shape = buildingGeometry(b)
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

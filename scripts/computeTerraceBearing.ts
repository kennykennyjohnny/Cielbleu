/**
 * scripts/computeTerraceBearing.ts
 *
 * Pour chaque place ayant une terrasse (terrace_lat/lng renseignés), calcule
 * l'orientation RÉALISTE de la terrasse = bearing de la façade la plus proche
 * du bâtiment devant lequel elle se trouve.
 *
 * Source : data/source/volumesbatisparis.geojson (polygones de bâtiments Paris).
 * On indexe les bâtiments par cellule de grille (centroïde geom_x_y), puis pour
 * chaque terrasse on cherche l'arête de bâtiment la plus proche → son bearing
 * devient `terrace_bearing` (la terrasse court le long de cette arête).
 *
 * Usage (la mémoire par défaut suffit rarement pour 109 Mo) :
 *   node --max-old-space-size=4096 -r tsx/cjs scripts/computeTerraceBearing.ts
 *   ou : npm run terrace:bearing
 *   options : --dry-run
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')
const M_PER_DEG_LAT = 111_320
const GRID = 0.0025                // ~280 m
const SEARCH_RADIUS_M = 120        // rayon max d'acceptation de la façade
const CELL_HALO = 2                // 5×5 cellules autour de la terrasse

type LngLat = [number, number]

interface PlaceRow {
  id: string
  terrace_lat: number
  terrace_lng: number
}

interface Bld {
  clat: number
  clng: number
  ring: LngLat[]
}

function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lng / GRID)}:${Math.floor(lat / GRID)}`
}

/** Distance (m) d'un point à un segment + bearing du segment (deg 0=N). */
function segDistBearing(
  plat: number, plng: number, a: LngLat, b: LngLat, cosLat: number,
): { dist: number; bearing: number } {
  // Repère métrique local autour du point
  const ax = (a[0] - plng) * M_PER_DEG_LAT * cosLat, ay = (a[1] - plat) * M_PER_DEG_LAT
  const bx = (b[0] - plng) * M_PER_DEG_LAT * cosLat, by = (b[1] - plat) * M_PER_DEG_LAT
  const dx = bx - ax, dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const px = ax + t * dx, py = ay + t * dy
  const dist = Math.hypot(px, py)
  // bearing du segment (direction a→b) ramené à [0,180)
  let bearing = (Math.atan2(dx, dy) * 180) / Math.PI
  bearing = ((bearing % 360) + 360) % 360
  return { dist, bearing }
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  // ── 1. Charger les bâtiments + index spatial ─────────────────────────────
  console.log('Chargement des bâtiments (volumesbatisparis)…')
  const file = path.join(process.cwd(), 'data', 'source', 'volumesbatisparis.geojson')
  const gj = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    features: Array<{
      geometry: { type: string; coordinates: number[][][] | number[][][][] }
      properties: { geom_x_y?: { lon: number; lat: number } }
    }>
  }
  console.log(`${gj.features.length} bâtiments`)

  const index = new Map<string, Bld[]>()
  let indexed = 0
  for (const f of gj.features) {
    const g = f.geometry
    let ring: LngLat[] | null = null
    if (g.type === 'Polygon') ring = (g.coordinates as number[][][])[0] as LngLat[]
    else if (g.type === 'MultiPolygon') ring = (g.coordinates as number[][][][])[0][0] as LngLat[]
    if (!ring || ring.length < 3) continue
    const c = f.properties.geom_x_y
    const clat = c?.lat ?? ring[0][1]
    const clng = c?.lon ?? ring[0][0]
    const k = cellKey(clat, clng)
    const arr = index.get(k) ?? []
    arr.push({ clat, clng, ring })
    index.set(k, arr)
    indexed++
  }
  console.log(`${indexed} bâtiments indexés dans ${index.size} cellules`)

  // ── 2. Charger les terrasses ──────────────────────────────────────────────
  console.log('Chargement des terrasses Supabase…')
  let places: PlaceRow[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('places')
      .select('id,terrace_lat,terrace_lng')
      .not('terrace_lat', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) { console.error(error); process.exit(1) }
    if (!data?.length) break
    places = places.concat(data as PlaceRow[])
    if (data.length < PAGE) break
  }
  console.log(`${places.length} terrasses à orienter`)

  // Index des points de terrasse (pour la source « voisins »)
  const tIndex = new Map<string, PlaceRow[]>()
  for (const p of places) {
    const k = cellKey(p.terrace_lat, p.terrace_lng)
    const a = tIndex.get(k) ?? []; a.push(p); tIndex.set(k, a)
  }

  // ── 3. Orientation par terrasse — deux sources combinées ──────────────────
  //  A) Façade : arête de bâtiment la plus proche (≤ 60 m) → la plus fiable.
  //  B) Voisins : direction vers les terrasses voisines (≤ 45 m). Les terrasses
  //     s'alignent le long du trottoir → cette direction = celle de la rue/façade.
  //  On garde A si la façade est proche, sinon B, sinon rien (fallback client).
  const FACADE_TRUST_M = 60
  const NEIGHBOR_M = 45

  function facadeBearing(p: PlaceRow): { bearing: number; dist: number } | null {
    const cosLat = Math.cos((p.terrace_lat * Math.PI) / 180)
    const cx = Math.floor(p.terrace_lng / GRID), cy = Math.floor(p.terrace_lat / GRID)
    let best = Infinity, bb: number | null = null
    for (let dx = -CELL_HALO; dx <= CELL_HALO; dx++)
      for (let dy = -CELL_HALO; dy <= CELL_HALO; dy++) {
        const arr = index.get(`${cx + dx}:${cy + dy}`)
        if (!arr) continue
        for (const b of arr)
          for (let i = 0; i < b.ring.length - 1; i++) {
            const { dist, bearing } = segDistBearing(p.terrace_lat, p.terrace_lng, b.ring[i], b.ring[i + 1], cosLat)
            if (dist < best) { best = dist; bb = bearing }
          }
      }
    return bb != null ? { bearing: bb, dist: best } : null
  }

  function neighborBearing(p: PlaceRow): number | null {
    const cosLat = Math.cos((p.terrace_lat * Math.PI) / 180)
    const cx = Math.floor(p.terrace_lng / GRID), cy = Math.floor(p.terrace_lat / GRID)
    const near: { d: number; dx: number; dy: number }[] = []
    for (let ddx = -1; ddx <= 1; ddx++)
      for (let ddy = -1; ddy <= 1; ddy++) {
        const arr = tIndex.get(`${cx + ddx}:${cy + ddy}`)
        if (!arr) continue
        for (const q of arr) {
          if (q === p) continue
          const ex = (q.terrace_lng - p.terrace_lng) * M_PER_DEG_LAT * cosLat
          const ny = (q.terrace_lat - p.terrace_lat) * M_PER_DEG_LAT
          const d = Math.hypot(ex, ny)
          if (d > 1 && d <= NEIGHBOR_M) near.push({ d, dx: ex, dy: ny })
        }
      }
    if (near.length < 2) return null
    // Direction dominante par PCA légère : on aligne les vecteurs (sign-fold)
    // pour qu'ils pointent dans le même demi-plan, puis on moyenne l'angle.
    near.sort((a, b) => a.d - b.d)
    const top = near.slice(0, 6)
    let sx = 0, sy = 0
    const refAng = Math.atan2(top[0].dx, top[0].dy)
    for (const v of top) {
      let ang = Math.atan2(v.dx, v.dy)
      // ramène dans le même sens que la réf (axe non orienté → modulo π)
      let diff = ang - refAng
      while (diff > Math.PI / 2) { ang -= Math.PI; diff -= Math.PI }
      while (diff < -Math.PI / 2) { ang += Math.PI; diff += Math.PI }
      sx += Math.sin(ang); sy += Math.cos(ang)
    }
    return ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360
  }

  const updates: { id: string; terrace_bearing: number }[] = []
  let nFacade = 0, nNeighbor = 0, nNone = 0
  for (const p of places) {
    const f = facadeBearing(p)
    if (f && f.dist <= FACADE_TRUST_M) {
      updates.push({ id: p.id, terrace_bearing: Math.round(f.bearing * 10) / 10 }); nFacade++
      continue
    }
    const nb = neighborBearing(p)
    if (nb != null) {
      updates.push({ id: p.id, terrace_bearing: Math.round(nb * 10) / 10 }); nNeighbor++
      continue
    }
    // dernière chance : façade lointaine (≤ 120 m) plutôt que rien
    if (f && f.dist <= SEARCH_RADIUS_M) {
      updates.push({ id: p.id, terrace_bearing: Math.round(f.bearing * 10) / 10 }); nFacade++
    } else nNone++
  }
  console.log(`Orientées : ${updates.length} (façade ${nFacade} · voisins ${nNeighbor}) · sans orientation ${nNone}`)

  if (DRY_RUN) {
    console.log('[--dry-run] exemples :', updates.slice(0, 8))
    return
  }

  // ── 4. Écriture (UPDATE par batch parallèle) ──────────────────────────────
  let written = 0
  const B = 50
  for (let i = 0; i < updates.length; i += B) {
    const batch = updates.slice(i, i + B)
    await Promise.all(batch.map(u =>
      supabase.from('places').update({ terrace_bearing: u.terrace_bearing }).eq('id', u.id),
    ))
    written += batch.length
    process.stdout.write(`\rÉcriture… ${written}/${updates.length}`)
  }
  console.log(`\n✅ ${written} orientations écrites.`)
}

main().catch(e => { console.error(e); process.exit(1) })

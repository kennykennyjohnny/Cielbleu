/**
 * scripts/matchTerrasses.ts
 *
 * Croise les places Supabase avec data/terrasses-autorisations.json
 * (open data Paris — ~24 000 autorisations de terrasse) par proximité GPS.
 *
 * Pour chaque place :
 *   1. On cherche la terrasse autorisée la plus proche dans un rayon de 80 m.
 *   2. Si trouvée → has_terrace = true, terrace_lat/lng/longueur/largeur renseignés.
 *   3. Si aucune terrasse dans 80 m ET has_terrace était NULL → on ne touche pas.
 *      (Un bar peut avoir une terrasse sans autorisation de voirie parisienne.)
 *
 * Usage :
 *   npx tsx scripts/matchTerrasses.ts
 *   npx tsx scripts/matchTerrasses.ts --dry-run   (affiche sans écrire)
 *   npx tsx scripts/matchTerrasses.ts --radius 100 (rayon en m, défaut 80)
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')

const M_PER_DEG_LAT = 111_320

interface TerraceAuth {
  nom_enseigne: string | null
  adresse: string | null
  arrondissement: string | null
  longueur: number | null
  largeur: number | null
  geo_point_2d: { lon: number; lat: number } | null
}

interface PlaceRow {
  id: string
  name: string
  lat: number
  lng: number
  has_terrace: boolean | null
  terrace_lat: number | null
  terrace_lng: number | null
}

function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const cosLat = Math.cos((lat1 * Math.PI) / 180)
  const dE = (lng2 - lng1) * M_PER_DEG_LAT * cosLat
  const dN = (lat2 - lat1) * M_PER_DEG_LAT
  return Math.sqrt(dE * dE + dN * dN)
}

// ── Normalisation de nom pour le matching d'enseigne ──────────────────────────
const STOP = new Set([
  'le', 'la', 'les', 'l', 'd', 'de', 'du', 'des', 'au', 'aux', 'a', 'et', 'the',
  'bar', 'cafe', 'café', 'restaurant', 'resto', 'brasserie', 'chez', 'pub',
  'bistrot', 'bistro', 'sarl', 'sas', 'eurl', 'snc', 'paris',
])
function normName(s: string | null): string[] {
  if (!s) return []
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP.has(w))
}
/** Similarité de nom 0..1 (Jaccard sur tokens significatifs + bonus inclusion). */
function nameScore(aTok: string[], bTok: string[]): number {
  if (aTok.length === 0 || bTok.length === 0) return 0
  const A = new Set(aTok), B = new Set(bTok)
  let inter = 0
  for (const w of A) if (B.has(w)) inter++
  const jac = inter / (A.size + B.size - inter)
  // bonus si un token rare (≥4 lettres) est commun → forte indication
  const rareCommon = [...A].some(w => w.length >= 4 && B.has(w))
  return Math.min(1, jac + (rareCommon ? 0.35 : 0))
}

interface IndexedTerrace extends TerraceAuth { tok: string[] }

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // ── Charge les terrasses open data ─────────────────────────────────────────
  console.log('Chargement des terrasses open data…')
  const dataPath = path.join(process.cwd(), 'data', 'terrasses-autorisations.json')
  const terrasses: TerraceAuth[] = JSON.parse(fs.readFileSync(dataPath, 'utf8'))
  const valid: IndexedTerrace[] = terrasses
    .filter(t => t.geo_point_2d?.lat && t.geo_point_2d?.lon)
    .map(t => ({ ...t, tok: normName(t.nom_enseigne) }))
  console.log(`${valid.length} terrasses avec coordonnées GPS sur ${terrasses.length} total`)

  // Index spatial des terrasses (cellules ~110 m) pour ne tester que le voisinage
  const GRID = 0.0015
  const cellKey = (lat: number, lng: number) => `${Math.floor(lng / GRID)}:${Math.floor(lat / GRID)}`
  const tGrid = new Map<string, IndexedTerrace[]>()
  for (const t of valid) {
    const k = cellKey(t.geo_point_2d!.lat, t.geo_point_2d!.lon)
    const a = tGrid.get(k) ?? []; a.push(t); tGrid.set(k, a)
  }

  // ── Charge toutes les places ────────────────────────────────────────────────
  console.log('Chargement des places Supabase…')
  const PAGE = 1000
  let allPlaces: PlaceRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('places')
      .select('id,name,lat,lng,has_terrace,terrace_lat,terrace_lng')
      .range(from, from + PAGE - 1)
    if (error) { console.error(error); process.exit(1) }
    if (!data?.length) break
    allPlaces = allPlaces.concat(data as PlaceRow[])
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log(`${allPlaces.length} places chargées`)

  // ── Matching ────────────────────────────────────────────────────────────────
  // Recalcul complet (corrige les anciens placements approximatifs). Pour chaque
  // lieu, parmi les terrasses du voisinage :
  //   1) MATCH PAR NOM : meilleure similarité d'enseigne dans NAME_RADIUS (≤ 90 m)
  //      → la plus fiable (terrasse réellement rattachée à cet établissement)
  //   2) sinon PROXIMITÉ STRICTE : la plus proche dans PROX_RADIUS (≤ 35 m)
  //   3) sinon rien (on ne place pas un parasol au hasard)
  const NAME_RADIUS = 90
  const PROX_RADIUS = 35
  const NAME_MIN = 0.5
  let byName = 0, byProx = 0, skipped = 0
  const updates: { id: string; has_terrace: boolean; terrace_lat: number; terrace_lng: number; terrace_longueur: number | null; terrace_largeur: number | null }[] = []

  for (const place of allPlaces) {
    const pTok = normName(place.name)
    const cx = Math.floor(place.lng / GRID), cy = Math.floor(place.lat / GRID)

    let bestProxD = Infinity, bestProx: IndexedTerrace | null = null
    let bestNameScore = 0, bestNameD = Infinity, bestName: IndexedTerrace | null = null

    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const arr = tGrid.get(`${cx + dx}:${cy + dy}`)
      if (!arr) continue
      for (const t of arr) {
        const d = distM(place.lat, place.lng, t.geo_point_2d!.lat, t.geo_point_2d!.lon)
        if (d <= PROX_RADIUS && d < bestProxD) { bestProxD = d; bestProx = t }
        if (d <= NAME_RADIUS && pTok.length) {
          const ns = nameScore(pTok, t.tok)
          // départage par score, puis par distance
          if (ns > bestNameScore || (ns === bestNameScore && d < bestNameD)) {
            bestNameScore = ns; bestNameD = d; bestName = t
          }
        }
      }
    }

    let chosen: IndexedTerrace | null = null
    if (bestName && bestNameScore >= NAME_MIN) { chosen = bestName; byName++ }
    else if (bestProx) { chosen = bestProx; byProx++ }
    else { skipped++ }

    if (chosen) {
      updates.push({
        id: place.id,
        has_terrace: true,
        terrace_lat: chosen.geo_point_2d!.lat,
        terrace_lng: chosen.geo_point_2d!.lon,
        terrace_longueur: chosen.longueur,
        terrace_largeur:  chosen.largeur,
      })
    }
  }

  // Nettoyage : lieux qui avaient une terrasse en base mais ne matchent plus
  // (anciens placements approximatifs) → on remet à zéro pour éviter un parasol
  // au mauvais endroit.
  const matchedIds = new Set(updates.map(u => u.id))
  const clears = allPlaces
    .filter(p => p.terrace_lat != null && !matchedIds.has(p.id))
    .map(p => p.id)

  console.log(`\nRésultats :`)
  console.log(`  Match par nom (≤${NAME_RADIUS} m) : ${byName}`)
  console.log(`  Match proximité (≤${PROX_RADIUS} m) : ${byProx}`)
  console.log(`  Sans match : ${skipped}`)
  console.log(`  À nettoyer (placements périmés) : ${clears.length}`)

  if (DRY_RUN) {
    console.log('\n[--dry-run] Aucune écriture en base.')
    if (updates.length > 0) {
      console.log('Exemples de mises à jour :')
      updates.slice(0, 5).forEach(u => console.log(' ', JSON.stringify(u)))
    }
    return
  }

  // ── Écriture : UPDATE par place (pas d'upsert → évite le NOT NULL sur name) ──
  let written = 0
  const BATCH = 50
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH)
    // Promise.all sur le batch pour paralléliser sans saturer Supabase
    await Promise.all(batch.map(u =>
      supabase.from('places').update({
        has_terrace:      u.has_terrace,
        terrace_lat:      u.terrace_lat,
        terrace_lng:      u.terrace_lng,
        terrace_longueur: u.terrace_longueur,
        terrace_largeur:  u.terrace_largeur,
      }).eq('id', u.id)
    ))
    written += batch.length
    process.stdout.write(`\rÉcriture… ${written}/${updates.length}`)
  }
  console.log(`\n✅ ${written} places mises à jour.`)

  // Nettoyage des placements périmés
  let cleared = 0
  for (let i = 0; i < clears.length; i += BATCH) {
    const batch = clears.slice(i, i + BATCH)
    await Promise.all(batch.map(id =>
      supabase.from('places').update({
        has_terrace: false,
        terrace_lat: null, terrace_lng: null,
        terrace_longueur: null, terrace_largeur: null, terrace_bearing: null,
      }).eq('id', id)
    ))
    cleared += batch.length
    process.stdout.write(`\rNettoyage… ${cleared}/${clears.length}`)
  }
  if (clears.length) console.log(`\n🧹 ${cleared} placements périmés nettoyés.`)
}

main().catch(e => { console.error(e); process.exit(1) })

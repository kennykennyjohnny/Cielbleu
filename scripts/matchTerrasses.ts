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
const RADIUS_IDX = process.argv.indexOf('--radius')
const RADIUS_M   = RADIUS_IDX >= 0 ? parseInt(process.argv[RADIUS_IDX + 1]) : 80

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
  const valid = terrasses.filter(t => t.geo_point_2d?.lat && t.geo_point_2d?.lon)
  console.log(`${valid.length} terrasses avec coordonnées GPS sur ${terrasses.length} total`)

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
  let matched = 0, alreadyDone = 0, skipped = 0
  const updates: { id: string; has_terrace: boolean; terrace_lat: number; terrace_lng: number; terrace_longueur: number | null; terrace_largeur: number | null }[] = []

  for (const place of allPlaces) {
    if (place.terrace_lat != null && place.terrace_lng != null) {
      alreadyDone++
      continue
    }

    let bestDist = Infinity
    let bestT: TerraceAuth | null = null

    for (const t of valid) {
      const d = distM(place.lat, place.lng, t.geo_point_2d!.lat, t.geo_point_2d!.lon)
      if (d < bestDist) { bestDist = d; bestT = t }
      if (d < 5) break // très proche, inutile de continuer
    }

    if (bestDist <= RADIUS_M && bestT) {
      updates.push({
        id: place.id,
        has_terrace: true,
        terrace_lat: bestT.geo_point_2d!.lat,
        terrace_lng: bestT.geo_point_2d!.lon,
        terrace_longueur: bestT.longueur,
        terrace_largeur:  bestT.largeur,
      })
      matched++
    } else {
      skipped++
    }
  }

  console.log(`\nRésultats :`)
  console.log(`  Déjà renseignées : ${alreadyDone}`)
  console.log(`  Matchées (≤${RADIUS_M} m)  : ${matched}`)
  console.log(`  Sans match       : ${skipped}`)

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
}

main().catch(e => { console.error(e); process.exit(1) })

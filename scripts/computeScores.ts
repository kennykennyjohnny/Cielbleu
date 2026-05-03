/**
 * Calcule les scores soleil de chaque place pour chaque mois × chaque créneau
 * de 30 min, en utilisant les ombres réelles des bâtiments APUR, puis upsert
 * dans la table sun_scores de Supabase.
 *
 * Usage : npm run scores:compute
 *
 * Nécessite dans .env.local :
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Le fichier data/buildings.json doit exister (npm run buildings:process).
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { calculateSunScore } from '../lib/sunScore'
import type { Building } from '../types'

// --- Config -----------------------------------------------------------------

const BUILDINGS_FILE = resolve('data/buildings.json')
// Pas de la grille spatiale en degrés — ~333 m à Paris
const GRID_STEP = 0.003
// Demi-fenêtre de cellules à consulter autour d'une place (1 = 3×3, 2 = 5×5)
const GRID_HALO = 1
// Lookup : seuls les bâtiments dans ce rayon importent pour les ombres
const SHADOW_LOOKUP_RADIUS_M = 250
// Insert chunk size pour Supabase
const UPSERT_CHUNK = 1000

// --- Index spatial ----------------------------------------------------------

type Cell = string // "lngBucket:latBucket"

function cellKey(lat: number, lng: number): Cell {
  const x = Math.floor(lng / GRID_STEP)
  const y = Math.floor(lat / GRID_STEP)
  return `${x}:${y}`
}

function buildSpatialIndex(buildings: Building[]): Map<Cell, Building[]> {
  const idx = new Map<Cell, Building[]>()
  for (const b of buildings) {
    const k = cellKey(b.lat, b.lng)
    let arr = idx.get(k)
    if (!arr) {
      arr = []
      idx.set(k, arr)
    }
    arr.push(b)
  }
  return idx
}

function nearbyBuildings(
  index: Map<Cell, Building[]>,
  lat: number,
  lng: number
): Building[] {
  const x = Math.floor(lng / GRID_STEP)
  const y = Math.floor(lat / GRID_STEP)
  const out: Building[] = []
  for (let dx = -GRID_HALO; dx <= GRID_HALO; dx++) {
    for (let dy = -GRID_HALO; dy <= GRID_HALO; dy++) {
      const arr = index.get(`${x + dx}:${y + dy}`)
      if (arr) out.push(...arr)
    }
  }
  return out
}

// Rayon en degrés ≈ 250 m
function distanceMetersFast(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = (lat2 - lat1) * 111_000
  const dLng = (lng2 - lng1) * 73_000 // approx à 48.85°N
  return Math.sqrt(dLat * dLat + dLng * dLng)
}

function filterByRadius(
  candidates: Building[],
  lat: number,
  lng: number,
  radiusM: number
): Building[] {
  return candidates.filter(
    (b) => distanceMetersFast(lat, lng, b.lat, b.lng) <= radiusM
  )
}

// --- Calcul mensuel ---------------------------------------------------------

// Construit une Date pour un instant donné en heure locale Paris.
// Heuristique simple pour le DST : avril-octobre = UTC+2, sinon UTC+1.
// (suffisant pour le 15 du mois, jamais pile sur un changement d'heure)
function parisDate(year: number, month: number, day: number, h: number, min: number): Date {
  const tz = month >= 4 && month <= 10 ? '+02:00' : '+01:00'
  return new Date(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T` +
      `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00${tz}`
  )
}

function precomputeForPlace(
  lat: number,
  lng: number,
  buildings: Building[]
): { month: number; time_slot: string; score: number }[] {
  const rows: { month: number; time_slot: string; score: number }[] = []
  for (let month = 1; month <= 12; month++) {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        // time_slot représente l'heure LOCALE Paris (le client lit getHours()
        // sur un Date local). On construit donc l'instant absolu correspondant
        // à cette heure locale, puis on le passe à l'algo soleil.
        const d = parisDate(2026, month, 15, h, m)
        const r = calculateSunScore(lat, lng, d, buildings)
        rows.push({
          month,
          time_slot: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          score: r.isNight ? 0 : r.score,
        })
      }
    }
  }
  return rows
}

// --- Main -------------------------------------------------------------------

async function main() {
  if (!existsSync(BUILDINGS_FILE)) {
    console.error(`❌ ${BUILDINGS_FILE} introuvable. Lance d'abord :`)
    console.error('   npm run buildings:process')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local')
    process.exit(1)
  }

  console.log('🌞 CielBleu — calcul des scores soleil avec ombres APUR\n')

  console.log('📂 Chargement des bâtiments…')
  const buildings: Building[] = JSON.parse(readFileSync(BUILDINGS_FILE, 'utf-8'))
  console.log(`   ${buildings.length.toLocaleString('fr-FR')} bâtiments chargés`)

  console.log('🗺  Construction de l\'index spatial…')
  const index = buildSpatialIndex(buildings)
  console.log(`   ${index.size.toLocaleString('fr-FR')} cellules`)

  const supabase = createClient(url, key)

  console.log('📍 Récupération des places depuis Supabase…')
  const { data: places, error: errPlaces } = await supabase
    .from('places')
    .select('id, name, lat, lng')
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (errPlaces) {
    console.error('❌ Erreur Supabase:', errPlaces.message)
    process.exit(1)
  }
  if (!places || places.length === 0) {
    console.error('❌ Aucune place trouvée dans Supabase.')
    process.exit(1)
  }
  console.log(`   ${places.length} places à traiter\n`)

  let totalRows = 0
  const t0 = Date.now()

  for (let i = 0; i < places.length; i++) {
    const p = places[i]
    const t1 = Date.now()

    const candidates = nearbyBuildings(index, p.lat, p.lng)
    const nearby = filterByRadius(candidates, p.lat, p.lng, SHADOW_LOOKUP_RADIUS_M)

    const monthly = precomputeForPlace(p.lat, p.lng, nearby)
    const rows = monthly.map((r) => ({
      place_id: p.id,
      month: r.month,
      time_slot: r.time_slot,
      score: r.score,
    }))

    // Chunked upsert
    for (let j = 0; j < rows.length; j += UPSERT_CHUNK) {
      const chunk = rows.slice(j, j + UPSERT_CHUNK)
      const { error } = await supabase
        .from('sun_scores')
        .upsert(chunk, { onConflict: 'place_id,month,time_slot' })
      if (error) {
        console.error(`   ❌ ${p.name}: ${error.message}`)
        break
      }
    }

    totalRows += rows.length
    const dt = Date.now() - t1
    const pad = String(i + 1).padStart(String(places.length).length)
    console.log(
      `[${pad}/${places.length}] ${p.name.padEnd(36)} ` +
        `· ${String(nearby.length).padStart(3)} bât. à proximité ` +
        `· ${rows.length} scores ` +
        `· ${dt}ms`
    )
  }

  const dtTotal = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`\n✅ ${totalRows.toLocaleString('fr-FR')} scores upsertés en ${dtTotal}s`)
}

main().catch((err) => {
  console.error('💥 Erreur fatale:', err)
  process.exit(1)
})

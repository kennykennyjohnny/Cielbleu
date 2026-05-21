/**
 * Script d'import des lieux Paris depuis Google Places
 * Usage : npx tsx scripts/importPlaces.ts
 *
 * Nécessite dans .env.local :
 *   GOOGLE_PLACES_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { searchNearbyPlaces, getGoogleMapsUrl, type GooglePlace } from '../lib/googlePlaces'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Grille 10×10 — couvre Paris + petite couronne (92/93/94) à rayon 900m
// ~100 × 5 types × 60 résultats max théorique, avec radius réduit pour mieux capter
// la densité dans les zones chargées (Bastille, Marais, Champs-Élysées...)
const PARIS_GRID = (() => {
  const points: { lat: number; lng: number }[] = []
  // Bornes Paris + petite couronne : lat 48.80→48.94, lng 2.21→2.49
  // 10 lignes lat, 10 colonnes lng (= 100 points, couvre mieux 92/93/94)
  const LAT_MIN = 48.800, LAT_MAX = 48.942
  const LNG_MIN = 2.210, LNG_MAX = 2.490
  const ROWS = 10, COLS = 10
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      points.push({
        lat: LAT_MIN + (LAT_MAX - LAT_MIN) * r / (ROWS - 1),
        lng: LNG_MIN + (LNG_MAX - LNG_MIN) * c / (COLS - 1),
      })
    }
  }
  return points
})()

// Types : bar + restaurant + cafe + park + night_club
const PLACE_TYPES = ['bar', 'restaurant', 'cafe', 'park', 'night_club'] as const
const SEARCH_RADIUS = 900 // mètres — radius plus serré = moins de places ratées sous le cap 60

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Déduplication en mémoire par google_place_id
const seenPlaceIds = new Set<string>()

function mapPlaceType(types: string[]): 'bar' | 'restaurant' | 'cafe' | 'park' {
  if (types.includes('park') || types.includes('natural_feature')) return 'park'
  if (types.includes('cafe')) return 'cafe'
  if (types.includes('bar') || types.includes('night_club')) return 'bar'
  return 'restaurant'
}

function extractArrondissement(address: string): number | null {
  const match = address.match(/(\d+)(?:er|ème|e)?\s*arrondissement/i)
  if (match) return parseInt(match[1])
  // Fallback : code postal 750XX
  const codeMatch = address.match(/750(\d{2})/)
  if (codeMatch) return parseInt(codeMatch[1])
  return null
}

async function fetchAllForType(
  lat: number,
  lng: number,
  type: string
): Promise<GooglePlace[]> {
  const all: GooglePlace[] = []
  let pageToken: string | undefined

  for (let page = 0; page < 3; page++) {
    if (page > 0) {
      // Google exige un délai avant d'utiliser le next_page_token
      await sleep(2200)
    }

    const res = await searchNearbyPlaces(lat, lng, SEARCH_RADIUS, type, pageToken)

    if (res.status === 'ZERO_RESULTS') break

    all.push(...res.results)

    if (!res.next_page_token) break
    pageToken = res.next_page_token
  }

  return all
}

async function upsertPlaces(places: GooglePlace[], type: string) {
  const rows = places
    .filter((p) => !seenPlaceIds.has(p.place_id))
    .map((p) => {
      seenPlaceIds.add(p.place_id)
      return {
        google_place_id: p.place_id,
        name: p.name,
        address: p.vicinity,
        lat: p.geometry.location.lat,
        lng: p.geometry.location.lng,
        type: mapPlaceType(p.types),
        google_rating: p.rating ?? null,
        price_level: p.price_level ?? null,
        photos: p.photos?.slice(0, 3).map((ph) => {
          const ref = ph.photo_reference
          return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${process.env.GOOGLE_PLACES_API_KEY}`
        }) ?? [],
        google_maps_url: getGoogleMapsUrl(p.place_id),
        arrondissement: extractArrondissement(p.vicinity),
        has_terrace: null,
        // Score probabilité terrasse : les bars/cafés ont statistiquement plus de terrasses
        terrace_probability: p.types.includes('park') ? 0.99
          : p.types.includes('bar') || p.types.includes('night_club') ? 0.72
          : p.types.includes('cafe') ? 0.70
          : 0.55,
      }
    })

  if (rows.length === 0) return 0

  const { error } = await supabase
    .from('places')
    .upsert(rows, { onConflict: 'google_place_id', ignoreDuplicates: true })

  if (error) {
    console.error(`  ❌ Erreur upsert (${type}):`, error.message)
    return 0
  }

  return rows.length
}

async function main() {
  console.log('🗺  Import HopSoleil — Google Places → Supabase')
  console.log(`   ${PARIS_GRID.length} points × ${PLACE_TYPES.length} types\n`)

  let total = 0

  for (const type of PLACE_TYPES) {
    console.log(`\n📍 Type : ${type}`)

    for (const point of PARIS_GRID) {
      try {
        const found = await fetchAllForType(point.lat, point.lng, type)
        const inserted = await upsertPlaces(found, type)
        console.log(`   (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}) → ${found.length} trouvés, ${inserted} insérés`)
        total += inserted
        await sleep(200) // politesse entre requêtes
      } catch (err) {
        console.error(`   ⚠️  Erreur point (${point.lat}, ${point.lng}):`, err)
      }
    }
  }

  console.log(`\n✅ Import terminé — ${total} nouveaux lieux insérés dans Supabase`)
  console.log('   Lance maintenant le calcul des scores soleil.\n')
}

main().catch((err) => {
  console.error('💥 Erreur fatale:', err)
  process.exit(1)
})

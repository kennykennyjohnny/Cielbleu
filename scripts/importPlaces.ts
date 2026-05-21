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

// Grille 14×14 + hotspots dense Paris — couvre Paris + petite couronne (92/93/94/95)
// 196 points grille + 40 points "chauds" dans les quartiers de bar = 236 points × 5 types
const PARIS_GRID = (() => {
  const points: { lat: number; lng: number }[] = []

  // Grille 14×14 — lat 48.78→48.96, lng 2.19→2.51
  const LAT_MIN = 48.780, LAT_MAX = 48.958
  const LNG_MIN = 2.190, LNG_MAX = 2.510
  const ROWS = 14, COLS = 14
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      points.push({
        lat: LAT_MIN + (LAT_MAX - LAT_MIN) * r / (ROWS - 1),
        lng: LNG_MIN + (LNG_MAX - LNG_MIN) * c / (COLS - 1),
      })
    }
  }

  // Hotspots : quartiers de bars/restos denses Paris + 1ère/2ème couronne nord
  const HOTSPOTS: { lat: number; lng: number }[] = [
    // Paris intra-muros (denses)
    { lat: 48.8533, lng: 2.3692 }, // Bastille
    { lat: 48.8567, lng: 2.3541 }, // Marais Nord
    { lat: 48.8550, lng: 2.3620 }, // Marais Sud
    { lat: 48.8835, lng: 2.3371 }, // Pigalle / Montmartre
    { lat: 48.8820, lng: 2.3450 }, // Abbesses
    { lat: 48.8637, lng: 2.3735 }, // Oberkampf
    { lat: 48.8673, lng: 2.3643 }, // République
    { lat: 48.8618, lng: 2.3485 }, // Temple / Arts et Métiers
    { lat: 48.8790, lng: 2.3582 }, // Montmartre bas
    { lat: 48.8546, lng: 2.3331 }, // Saint-Germain-des-Prés
    { lat: 48.8519, lng: 2.3472 }, // Quartier Latin / Saint-Michel
    { lat: 48.8501, lng: 2.3370 }, // Odéon
    { lat: 48.8713, lng: 2.3625 }, // Canal Saint-Martin
    { lat: 48.8681, lng: 2.3482 }, // Strasbourg-Saint-Denis
    { lat: 48.8758, lng: 2.3290 }, // Batignolles
    { lat: 48.8775, lng: 2.3511 }, // Montmartre Est
    { lat: 48.8605, lng: 2.3355 }, // Opéra / Grands Boulevards
    { lat: 48.8488, lng: 2.3540 }, // Mouffetard
    { lat: 48.8462, lng: 2.3730 }, // Alésia / Denfert
    { lat: 48.8503, lng: 2.3831 }, // Nation / Voltaire
    { lat: 48.8580, lng: 2.3918 }, // Charonne / Père-Lachaise
    { lat: 48.8650, lng: 2.3856 }, // Ménilmontant
    { lat: 48.8720, lng: 2.3820 }, // Belleville
    { lat: 48.8744, lng: 2.3720 }, // Jourdain
    { lat: 48.8445, lng: 2.3453 }, // Montparnasse
    { lat: 48.8490, lng: 2.3254 }, // Saint-Sulpice / Luxembourg
    { lat: 48.8725, lng: 2.3120 }, // Wagram / Monceau
    { lat: 48.8669, lng: 2.3100 }, // Ternes
    { lat: 48.8604, lng: 2.2985 }, // Étoile / Victor Hugo
    { lat: 48.8540, lng: 2.2810 }, // Auteuil / Passy
    // Petite couronne Nord (93) — Saint-Denis, Saint-Ouen, Aubervilliers
    { lat: 48.9361, lng: 2.3540 }, // Saint-Denis centre
    { lat: 48.9105, lng: 2.3350 }, // Saint-Ouen marché
    { lat: 48.9170, lng: 2.3820 }, // Aubervilliers
    { lat: 48.8980, lng: 2.3708 }, // La Courneuve / Le Bourget zone
    // 92 — Boulogne, Issy, Levallois, Clichy, Neuilly
    { lat: 48.8350, lng: 2.2431 }, // Boulogne centre
    { lat: 48.8300, lng: 2.2380 }, // Boulogne sud
    { lat: 48.8254, lng: 2.2740 }, // Issy-les-Moulineaux
    { lat: 48.8944, lng: 2.2880 }, // Levallois-Perret centre
    { lat: 48.8920, lng: 2.2840 }, // Levallois sud (Chez Bouche)
    { lat: 48.8960, lng: 2.2920 }, // Levallois est
    { lat: 48.8975, lng: 2.2800 }, // Levallois nord
    { lat: 48.8900, lng: 2.2760 }, // Levallois / Neuilly limite
    { lat: 48.8840, lng: 2.2680 }, // Neuilly-sur-Seine centre
    { lat: 48.8800, lng: 2.2580 }, // Neuilly sud
    { lat: 48.9026, lng: 2.3070 }, // Clichy centre
    { lat: 48.9060, lng: 2.3000 }, // Clichy nord-est
    // 94 — Vincennes, Saint-Mandé, Charenton, Ivry
    { lat: 48.8474, lng: 2.4397 }, // Vincennes centre
    { lat: 48.8440, lng: 2.4470 }, // Vincennes est / château
    { lat: 48.8381, lng: 2.4113 }, // Saint-Mandé / Bel-Air
    { lat: 48.8236, lng: 2.4100 }, // Charenton / Alfortville
    { lat: 48.8140, lng: 2.3840 }, // Ivry-sur-Seine
    { lat: 48.8180, lng: 2.4000 }, // Ivry est
    // Paris ouest coeur — densification
    { lat: 48.8620, lng: 2.3280 }, // Palais-Royal / Louvre
    { lat: 48.8580, lng: 2.3200 }, // Concorde / Madeleine
    { lat: 48.8640, lng: 2.3440 }, // Le Sentier / Bourse
    { lat: 48.8561, lng: 2.3521 }, // Île de la Cité / Notre-Dame
    { lat: 48.8534, lng: 2.3488 }, // Île Saint-Louis
    { lat: 48.8520, lng: 2.3640 }, // Jussieu / Austerlitz
    { lat: 48.8446, lng: 2.3600 }, // Alesia / Montrouge limite
    { lat: 48.8600, lng: 2.3180 }, // Palais-Royal jardin
    { lat: 48.8760, lng: 2.3640 }, // La Villette / Stalingrad
    { lat: 48.8820, lng: 2.3730 }, // Crimée / riquet
    { lat: 48.8880, lng: 2.3600 }, // Porte de La Chapelle
    { lat: 48.8920, lng: 2.3440 }, // Simplon / Marcadet
  ]

  // Évite les doublons exacts avec la grille
  const grid = new Set(points.map(p => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`))
  for (const h of HOTSPOTS) {
    const key = `${h.lat.toFixed(4)},${h.lng.toFixed(4)}`
    if (!grid.has(key)) points.push(h)
  }

  return points
})()

// Types : bar + restaurant + cafe + park + night_club
const PLACE_TYPES = ['bar', 'restaurant', 'cafe', 'park', 'night_club'] as const
const SEARCH_RADIUS = 500 // mètres — réduit l'overlap → plus de lieux uniques par requête

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Déduplication en mémoire par google_place_id
const seenPlaceIds = new Set<string>()

// Types Google qui signalent un hôtel/gîte → on skip le lieu
// même s'il a aussi 'restaurant' dans ses types
const SKIP_TYPES = new Set([
  'lodging', 'hotel', 'motel', 'campground', 'rv_park',
  'hospital', 'doctor', 'pharmacy', 'school', 'university',
  'gas_station', 'car_dealer', 'car_repair',
  'real_estate_agency', 'insurance_agency', 'bank', 'atm',
  'police', 'courthouse', 'embassy',
])

/** Retourne true si le lieu doit être ignoré (hôtel, hôpital, banque…) */
function shouldSkipPlace(types: string[]): boolean {
  return types.some(t => SKIP_TYPES.has(t))
}

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
    .filter((p) => !seenPlaceIds.has(p.place_id) && !shouldSkipPlace(p.types))
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
        photos: p.photos?.slice(0, 5).map((ph) => {
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

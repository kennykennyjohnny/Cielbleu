/**
 * Ajoute "Chez Bouche" à Levallois-Perret dans la base Supabase.
 * Utilise Google Places Text Search + Place Details pour les horaires.
 *
 * Usage : npx tsx scripts/addChezBouche.ts
 *
 * Nécessite dans .env.local :
 *   GOOGLE_PLACES_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { getGoogleMapsUrl } from '../lib/googlePlaces'

const BASE = 'https://maps.googleapis.com/maps/api/place'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Types ─────────────────────────────────────────────────────────────────────

interface TextSearchResult {
  place_id: string
  name: string
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
  rating?: number
  price_level?: number
  photos?: { photo_reference: string }[]
  types: string[]
  opening_hours?: { open_now?: boolean }
}

interface PlaceDetailsResult {
  place_id: string
  name: string
  formatted_address: string
  geometry: { location: { lat: number; lng: number } }
  rating?: number
  price_level?: number
  photos?: { photo_reference: string }[]
  types: string[]
  opening_hours?: {
    open_now?: boolean
    periods?: Array<{
      open: { day: number; time: string }
      close?: { day: number; time: string }
    }>
    weekday_text?: string[]
  }
  website?: string
  formatted_phone_number?: string
  vicinity?: string
}

// ── Text Search ───────────────────────────────────────────────────────────────

async function textSearchPlace(query: string): Promise<TextSearchResult[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY manquante')

  const params = new URLSearchParams({ query, key: apiKey, language: 'fr' })
  const res = await fetch(`${BASE}/textsearch/json?${params}`)
  if (!res.ok) throw new Error(`Text Search erreur HTTP: ${res.status}`)

  const data = await res.json() as { status: string; results: TextSearchResult[]; error_message?: string }
  if (data.status === 'ZERO_RESULTS') return []
  if (data.status !== 'OK') throw new Error(`Text Search status: ${data.status} — ${data.error_message ?? ''}`)

  return data.results
}

// ── Place Details ─────────────────────────────────────────────────────────────

async function getFullDetails(placeId: string): Promise<PlaceDetailsResult | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY manquante')

  const fields = [
    'place_id', 'name', 'formatted_address', 'geometry',
    'rating', 'price_level', 'photos', 'types',
    'opening_hours', 'website', 'formatted_phone_number', 'vicinity',
  ].join(',')

  const params = new URLSearchParams({ place_id: placeId, fields, key: apiKey, language: 'fr' })
  const res = await fetch(`${BASE}/details/json?${params}`)
  if (!res.ok) throw new Error(`Place Details erreur HTTP: ${res.status}`)

  const data = await res.json() as { status: string; result?: PlaceDetailsResult; error_message?: string }
  if (data.status !== 'OK') {
    console.error('Place Details:', data.status, data.error_message)
    return null
  }
  return data.result ?? null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractArrondissement(address: string): number | null {
  const match = address.match(/(\d+)(?:er|ème|e)?\s*arrondissement/i)
  if (match) return parseInt(match[1])
  const cp = address.match(/750(\d{2})/)
  if (cp) return parseInt(cp[1])
  return null
}

function mapPlaceType(types: string[]): 'bar' | 'restaurant' | 'cafe' | 'park' {
  if (types.includes('park') || types.includes('natural_feature')) return 'park'
  if (types.includes('cafe')) return 'cafe'
  if (types.includes('bar') || types.includes('night_club')) return 'bar'
  return 'restaurant'
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🍽  Ajout de "Chez Bouche" à Levallois-Perret\n')

  // 1) Text Search — plusieurs variantes pour maximiser les chances
  const queries = [
    'Chez Bouche Levallois-Perret',
    'Chez Bouche Levallois',
    'restaurant Chez Bouche 92300',
  ]

  let found: TextSearchResult | null = null
  for (const query of queries) {
    console.log(`🔍 Recherche : "${query}"`)
    const results = await textSearchPlace(query)
    if (results.length > 0) {
      // Prendre le résultat le plus pertinent (premier par défaut)
      // On filtre pour avoir un lieu à Levallois ou 92300
      const levallois = results.find(r =>
        r.formatted_address.includes('Levallois') ||
        r.formatted_address.includes('92300') ||
        r.formatted_address.includes('92400')  // Parfois Courbevoie
      )
      found = levallois ?? results[0]
      console.log(`   ✅ Trouvé : ${found.name} — ${found.formatted_address}`)
      break
    }
    console.log('   Aucun résultat.')
  }

  if (!found) {
    console.error('\n❌ Chez Bouche introuvable via Text Search.')
    console.error('   Vérifie le nom exact dans Google Maps et relance.')
    process.exit(1)
  }

  // 2) Détails complets (horaires, photos, website…)
  console.log(`\n📋 Récupération des détails (place_id: ${found.place_id})…`)
  const details = await getFullDetails(found.place_id)

  const place = details ?? found as unknown as PlaceDetailsResult
  const address = place.formatted_address ?? (place as unknown as { vicinity?: string }).vicinity ?? found.formatted_address

  // 3) Construit le row à insérer
  const row = {
    google_place_id: place.place_id,
    name:            place.name,
    address,
    lat:             place.geometry.location.lat,
    lng:             place.geometry.location.lng,
    type:            mapPlaceType(place.types),
    google_rating:   place.rating ?? null,
    price_level:     place.price_level ?? null,
    photos: (place.photos ?? []).slice(0, 5).map(ph =>
      `${BASE}/photo?maxwidth=800&photo_reference=${ph.photo_reference}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    ),
    google_maps_url:  getGoogleMapsUrl(place.place_id),
    arrondissement:   extractArrondissement(address),
    has_terrace:      null,
    terrace_probability: 0.72,  // bar/restaurant = 72% de chance de terrasse
    opening_hours:    details?.opening_hours ?? null,
  }

  console.log('\n📊 Données à insérer :')
  console.log(`   Nom       : ${row.name}`)
  console.log(`   Adresse   : ${row.address}`)
  console.log(`   Position  : ${row.lat}, ${row.lng}`)
  console.log(`   Type      : ${row.type}`)
  console.log(`   Note      : ${row.google_rating ?? 'N/A'} ⭐`)
  console.log(`   Photos    : ${row.photos.length}`)
  console.log(`   Horaires  : ${details?.opening_hours?.weekday_text?.length ? '✅' : '⚠️ non disponibles'}`)

  // 4) Upsert dans Supabase
  const { error } = await supabase
    .from('places')
    .upsert(row, { onConflict: 'google_place_id', ignoreDuplicates: false })

  if (error) {
    console.error('\n❌ Erreur Supabase:', error.message)
    process.exit(1)
  }

  console.log('\n✅ Chez Bouche inséré/mis à jour dans Supabase !')
  console.log('   Lance ensuite le calcul des scores soleil si nécessaire.')
  console.log(`   Google Maps : ${row.google_maps_url}\n`)
}

main().catch(err => {
  console.error('💥 Erreur fatale:', err)
  process.exit(1)
})

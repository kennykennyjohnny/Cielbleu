/**
 * Ajoute (ou met à jour) N'IMPORTE QUEL lieu dans la base Supabase, à la demande.
 *
 * Utilise Google Places Text Search + Place Details (horaires, photos, note…).
 * Généralise scripts/addChezLouise.ts : la requête est passée en argument.
 *
 * Usage :
 *   npm run add:place -- "Bar Loulou Paris"
 *   npm run add:place -- "Chez Louise Levallois" "Chez Louise 92300"
 *   npx tsx scripts/addPlace.ts "Le Perchoir Ménilmontant"
 *
 * On peut passer plusieurs variantes de requête : la 1re qui renvoie un résultat gagne.
 * Si plusieurs lieux remontent, on prend celui dont l'adresse contient "Paris" /
 * un code postal francilien, sinon le 1er.
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
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY manquante dans .env.local')

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
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY manquante dans .env.local')

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
  return null // hors Paris (banlieue) → pas d'arrondissement
}

function mapPlaceType(types: string[]): 'bar' | 'restaurant' | 'cafe' | 'park' {
  if (types.includes('park') || types.includes('natural_feature')) return 'park'
  if (types.includes('cafe')) return 'cafe'
  if (types.includes('bar') || types.includes('night_club')) return 'bar'
  return 'restaurant'
}

// Garde un lieu d'Île-de-France quand plusieurs résultats remontent
function isFrancilien(addr: string): boolean {
  return /Paris|75\d{3}|9[2-5]\d{3}|77\d{3}|78\d{3}/.test(addr)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const queries = process.argv.slice(2).filter(Boolean)
  if (queries.length === 0) {
    console.error('❌ Aucune requête fournie.')
    console.error('   Usage : npm run add:place -- "Bar Loulou Paris"')
    console.error('           npm run add:place -- "Chez Louise Levallois" "Chez Louise 92300"')
    process.exit(1)
  }

  console.log(`🔎 Ajout à la demande — ${queries.length} variante(s) de requête\n`)

  // 1) Text Search — la 1re requête qui renvoie un résultat gagne
  let found: TextSearchResult | null = null
  for (const query of queries) {
    console.log(`🔍 Recherche : "${query}"`)
    const results = await textSearchPlace(query)
    if (results.length > 0) {
      const franc = results.find(r => isFrancilien(r.formatted_address))
      found = franc ?? results[0]
      console.log(`   ✅ Trouvé : ${found.name} — ${found.formatted_address}`)
      if (results.length > 1) {
        console.log(`   (${results.length} résultats — gardé le plus pertinent ; précise la requête si ce n'est pas le bon)`)
      }
      break
    }
    console.log('   Aucun résultat.')
  }

  if (!found) {
    console.error('\n❌ Lieu introuvable via Text Search.')
    console.error('   Vérifie le nom exact dans Google Maps et relance avec une requête plus précise.')
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

  console.log(`\n✅ "${row.name}" inséré/mis à jour dans Supabase !`)
  console.log('   Lance ensuite "npm run scores:compute" pour calculer son score soleil.')
  console.log(`   Google Maps : ${row.google_maps_url}\n`)
}

main().catch(err => {
  console.error('💥 Erreur fatale:', err)
  process.exit(1)
})

/**
 * Enrichissement des horaires d'ouverture — Place Details Google → Supabase
 * Usage : npx tsx scripts/enrichOpeningHours.ts [--limit=500] [--all]
 *
 * Par défaut : enrichit les 500 meilleurs lieux (par note Google) sans opening_hours.
 * --all : enrichit TOUS les lieux sans opening_hours (attention au coût API).
 * --limit=N : limite à N lieux.
 *
 * Coût Google Places API : ~$0.003 par requête (Contact Data).
 * 500 lieux ≈ $1.50 | 5 000 lieux ≈ $15 | 20 000 lieux ≈ $60.
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { getPlaceDetails } from '../lib/googlePlaces'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const args = process.argv.slice(2)
  const isAll = args.includes('--all')
  const limitArg = args.find(a => a.startsWith('--limit='))
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : (isAll ? 20000 : 500)

  console.log(`\n🔍 Enrichissement horaires d'ouverture — ${isAll ? 'TOUS les lieux' : `${limit} lieux`}`)
  console.log(`   Coût estimé : ~$${(limit * 0.003).toFixed(2)} (Google Place Details)\n`)

  // Récupère les lieux sans opening_hours, triés par note décroissante
  const { data: places, error } = await supabase
    .from('places')
    .select('id, google_place_id, name, google_rating')
    .not('google_place_id', 'is', null)
    .is('opening_hours', null)
    .order('google_rating', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (error) {
    console.error('❌ Erreur Supabase:', error.message)
    process.exit(1)
  }
  if (!places?.length) {
    console.log('✅ Aucun lieu à enrichir (tous ont déjà des horaires).')
    return
  }

  console.log(`📍 ${places.length} lieux à traiter...\n`)

  let updated = 0
  let missing = 0
  let failed = 0

  for (let i = 0; i < places.length; i++) {
    const place = places[i]
    const pct = Math.round((i / places.length) * 100)

    if (i % 20 === 0) {
      console.log(`  [${pct}%] ${i}/${places.length} — ${updated} mis à jour, ${missing} sans horaires, ${failed} erreurs`)
    }

    try {
      const details = await getPlaceDetails(place.google_place_id!)

      if (!details?.opening_hours?.periods?.length) {
        missing++
        // Pause courte même sur skip pour respecter le rate limit
        await sleep(50)
        continue
      }

      const { error: upErr } = await supabase
        .from('places')
        .update({ opening_hours: details.opening_hours })
        .eq('id', place.id)

      if (upErr) {
        console.error(`  ✗ ${place.name}: ${upErr.message}`)
        failed++
      } else {
        updated++
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ✗ ${place.name}: ${msg}`)
      failed++
    }

    // Rate limit : 10 req/s max Google Places API
    await sleep(110)
  }

  console.log(`\n✅ Terminé :`)
  console.log(`   ${updated} lieux mis à jour avec horaires`)
  console.log(`   ${missing} lieux sans horaires côté Google`)
  console.log(`   ${failed} erreurs`)
  console.log(`\n   💡 Relance avec --all pour traiter tous les lieux.`)
}

main().catch((err) => {
  console.error('💥 Erreur fatale:', err)
  process.exit(1)
})

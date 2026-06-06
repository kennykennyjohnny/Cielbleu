/**
 * GET /api/places?month=5&slot=14:00
 *
 * Retourne tous les lieux de Paris + petite couronne avec leur score soleil.
 * Colonnes slim — pas de photos ni d'opening_hours.
 *
 * Stratégie de chargement :
 *  1. Filtrage géographique : Paris intramuros + petite couronne (~21 000 lieux)
 *     → couvre Gentilly, Le Kremlin-Bicêtre, Levallois, Boulogne, Vincennes,
 *       Montrouge, Saint-Mandé, Issy, Clichy, Saint-Ouen… (tout l'import).
 *       Avant, une bbox trop serrée masquait ~6 600 lieux déjà importés.
 *  2. Pagination serveur rapide : même datacenter → ~5 ms / page
 *     (toutes les pages en parallèle, ~1 round-trip)
 *  3. Cache CDN Vercel 30 s → chargement quasi-instantané pour tous les users suivants
 *
 * preferredRegion cdg1 = Paris = même région AWS que Supabase eu-west-3.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const preferredRegion = ['cdg1']  // même datacenter que Supabase eu-west-3
export const dynamic = 'force-dynamic'

// Paris intramuros + petite couronne (92/93/94) — correspond à l'emprise de l'import
// (grille 48.78→48.96, 2.19→2.51). Élargir cette bbox = montrer plus de bars sans
// ré-importer : les lieux sont déjà en base, ils étaient juste filtrés ici.
const BBOX = { latMin: 48.780, latMax: 48.960, lngMin: 2.190, lngMax: 2.520 }

// Colonnes nécessaires pour les pins carte + card peek mobile
const SLIM = 'id,name,address,lat,lng,type,arrondissement,has_terrace,terrace_lat,terrace_lng,terrace_longueur,terrace_largeur,google_rating,price_level,google_place_id'

interface PlaceSlim {
  id: string; name: string; address: string
  lat: number; lng: number; type: string
  arrondissement: number | null; has_terrace: boolean | null
  terrace_lat: number | null; terrace_lng: number | null
  terrace_longueur: number | null; terrace_largeur: number | null
  google_rating: number | null; price_level: number | null
  google_place_id: string | null
}
interface ScoreRow { place_id: string; score: number }

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
  const slot  = searchParams.get('slot')
    ?? `${String(now.getHours()).padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}`

  const sb = getSupabase()
  const PAGE = 1000

  // Filtre géographique réutilisé pour chaque page
  function pageQuery(from: number, withCount = false) {
    const q = sb.from('places').select(SLIM, withCount ? { count: 'exact' } : undefined)
      .gte('lat', BBOX.latMin).lte('lat', BBOX.latMax)
      .gte('lng', BBOX.lngMin).lte('lng', BBOX.lngMax)
    return q.range(from, from + PAGE - 1)
  }

  // ── Étape 1 : scores + page 0 avec count exact — en parallèle ────────────────
  const [scoresRes, page0Res] = await Promise.all([
    sb.from('sun_scores').select('place_id,score').eq('month', month).eq('time_slot', slot),
    pageQuery(0, true),
  ])

  const { data: page0, count } = page0Res
  if (!page0?.length) {
    console.error('[/api/places] Page 0 vide. URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30))
    return NextResponse.json([], { status: 200 })
  }

  // ── Étape 2 : pages restantes toutes en parallèle ─────────────────────────────
  // count exact dispo → on sait exactement combien de pages lancer d'un coup.
  // ~13 400 lieux / 1000 ≈ 14 pages → toutes fetched en 1 round-trip (~5 ms)
  // au lieu de 14 round-trips séquentiels (~70 ms) : ×7 plus rapide.
  const totalPages = Math.min(Math.ceil((count ?? 20000) / PAGE), 25)
  const restPages = totalPages > 1
    ? await Promise.all(
        Array.from({ length: totalPages - 1 }, (_, i) => pageQuery((i + 1) * PAGE))
      )
    : []

  const allPlaces: PlaceSlim[] = [
    ...(page0 as unknown as PlaceSlim[]),
    ...restPages.flatMap(r => (r.data ?? []) as unknown as PlaceSlim[]),
  ]

  const scoreMap = new Map<string, number>(
    ((scoresRes.data ?? []) as ScoreRow[]).map(r => [r.place_id, r.score])
  )

  const places = allPlaces.map(p => ({ ...p, currentScore: scoreMap.get(p.id) ?? 3 }))

  return NextResponse.json(places, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
  })
}

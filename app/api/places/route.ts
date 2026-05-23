/**
 * GET /api/places?month=5&slot=14:00
 *
 * Retourne tous les lieux de Paris intramuros avec leur score soleil.
 * Colonnes slim — pas de photos ni d'opening_hours.
 *
 * Stratégie de chargement :
 *  1. Filtrage géographique : Paris intramuros uniquement (~13 400 lieux)
 *     → élimine ~8 000 lieux de banlieue (Nanterre, Bondy, Vitry…)
 *  2. Pagination serveur rapide : même datacenter → ~5 ms / page
 *     (~14 pages × 5 ms = ~70 ms, vs 22 appels depuis le browser = 10 s)
 *  3. Cache CDN Vercel 30 s → chargement quasi-instantané pour tous les users suivants
 *
 * preferredRegion cdg1 = Paris = même région AWS que Supabase eu-west-3.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const preferredRegion = ['cdg1']  // même datacenter que Supabase eu-west-3
export const dynamic = 'force-dynamic'

// Paris intramuros + Bois de Boulogne + Bois de Vincennes
const BBOX = { latMin: 48.810, latMax: 48.910, lngMin: 2.215, lngMax: 2.480 }

// Colonnes nécessaires pour les pins carte + card peek mobile
const SLIM = 'id,name,address,lat,lng,type,arrondissement,has_terrace,google_rating,price_level,google_place_id'

interface PlaceSlim {
  id: string; name: string; address: string
  lat: number; lng: number; type: string
  arrondissement: number | null; has_terrace: boolean | null
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

  // ── Pagination serveur : tous les lieux Paris intramuros ─────────────────────
  // Depuis cdg1 (Paris), chaque page Supabase ≈ 3-5 ms.
  // ~13 400 lieux Paris / 1000 = ~14 pages × 5 ms = ~70 ms total.
  const PAGE = 1000
  let from = 0
  const allPlaces: PlaceSlim[] = []

  // Lance les scores en parallèle dès le début (on n'attend pas les places)
  const scoresPromise = sb
    .from('sun_scores').select('place_id,score')
    .eq('month', month).eq('time_slot', slot)

  while (from < 25000) {  // sécurité : max 25 000 lieux
    const { data, error } = await sb
      .from('places').select(SLIM)
      .gte('lat', BBOX.latMin).lte('lat', BBOX.latMax)
      .gte('lng', BBOX.lngMin).lte('lng', BBOX.lngMax)
      .range(from, from + PAGE - 1)

    if (error || !data?.length) break
    allPlaces.push(...(data as unknown as PlaceSlim[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  // Récupère les scores (requête lancée en parallèle dès le début)
  const { data: scoreRows } = await scoresPromise
  const scoreMap = new Map<string, number>(
    ((scoreRows ?? []) as ScoreRow[]).map(r => [r.place_id, r.score])
  )

  if (allPlaces.length === 0) {
    console.error('[/api/places] Aucun lieu retourné. Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 30))
    return NextResponse.json([], { status: 200 })
  }

  const places = allPlaces.map(p => ({
    ...p,
    currentScore: scoreMap.get(p.id) ?? 3,
  }))

  return NextResponse.json(places, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
  })
}

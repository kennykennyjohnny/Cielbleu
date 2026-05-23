/**
 * GET /api/places?month=5&slot=14:00
 *
 * Retourne tous les lieux Paris avec leur score soleil pour le créneau demandé.
 * Colonnes slim (pas de photos ni d'opening_hours) — seules les données
 * nécessaires pour afficher les pins sur la carte.
 *
 * Cache CDN Vercel : 30 s (s-maxage) + 120 s stale-while-revalidate.
 * Les données changent rarement → excellent taux de hit CDN.
 */

import { NextResponse }          from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Colonnes slim pour la carte (évite de charger opening_hours/photos inutilement)
const SLIM_COLS = [
  'id', 'name', 'address', 'lat', 'lng', 'type',
  'arrondissement', 'has_terrace', 'google_rating', 'price_level', 'google_place_id',
].join(',')

interface PlaceRow {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  type: string
  arrondissement: number | null
  has_terrace: boolean | null
  google_rating: number | null
  price_level: number | null
  google_place_id: string | null
  current_score?: number
}

interface ScoreRow {
  place_id: string
  score: number
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
  const slot  = searchParams.get('slot')
    ?? `${String(now.getHours()).padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}`

  const supabase = createServerSupabaseClient()

  // ── Essai 1 : fonction RPC (après migration_v5_performance.sql) ─────────────
  // Retourne places + scores en 1 seul appel SQL côté base.
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_map_places', { p_month: month, p_slot: slot })

  if (!rpcError && rpcData) {
    // Renommer current_score → currentScore pour le client React
    const places = (rpcData as PlaceRow[]).map(p => ({
      ...p,
      currentScore: p.current_score ?? 3,
    }))
    return NextResponse.json(places, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    })
  }

  // ── Fallback : 2 requêtes parallèles (avant migration) ──────────────────────
  // Charge toutes les pages de places + les scores en parallèle côté serveur.
  // Côté serveur (même datacenter) : chaque page ≈ 3-5 ms vs 80 ms côté browser.
  const PAGE = 1000
  const placesPages: PlaceRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('places')
      .select(SLIM_COLS)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .range(from, from + PAGE - 1)

    if (error || !data?.length) break
    placesPages.push(...(data as unknown as PlaceRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  const { data: scoreRows } = await supabase
    .from('sun_scores')
    .select('place_id, score')
    .eq('month', month)
    .eq('time_slot', slot)

  const scoreMap = new Map<string, number>(
    ((scoreRows ?? []) as ScoreRow[]).map(r => [r.place_id, r.score])
  )

  const places = placesPages.map(p => ({
    ...p,
    currentScore: scoreMap.get(p.id) ?? 3,
  }))

  return NextResponse.json(places, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
  })
}

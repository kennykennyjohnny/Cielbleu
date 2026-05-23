/**
 * GET /api/places?month=5&slot=14:00
 *
 * Retourne tous les lieux Paris avec leur score soleil pour le créneau demandé.
 * Colonnes slim (pas de photos ni d'opening_hours) — uniquement les données
 * nécessaires pour afficher les pins sur la carte.
 *
 * preferredRegion: 'cdg1' → fonction déployée à Paris (même région que Supabase eu-west-3).
 * Cache CDN Vercel : 30 s (s-maxage) + 120 s stale-while-revalidate.
 */

import { NextResponse }   from 'next/server'
import { createClient }   from '@supabase/supabase-js'

// ── Déployer à Paris = même datacenter que Supabase eu-west-3 ────────────────
// Sans ça, la fonction est en Virginie → +90 ms par appel DB (transatlantique).
export const preferredRegion = ['cdg1']
export const dynamic = 'force-dynamic'

// Clé anon (disponible partout — NEXT_PUBLIC_ est injecté même côté serveur).
// Pas besoin du service role : la table places a "lisible par tous" en RLS.
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}

// Colonnes nécessaires pour afficher les pins + ouvrir une card en snap peek.
// On NE charge PAS : photos, opening_hours, instagram_url, google_maps_url.
// Ces données lourdes sont chargées à la demande au clic sur un lieu.
const SLIM = 'id,name,address,lat,lng,type,arrondissement,has_terrace,google_rating,price_level,google_place_id'

interface PlaceSlim {
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
}

interface ScoreRow { place_id: string; score: number }

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const now   = new Date()
  const month = parseInt(searchParams.get('month') ?? String(now.getMonth() + 1))
  const slot  = searchParams.get('slot')
    ?? `${String(now.getHours()).padStart(2, '0')}:${now.getMinutes() < 30 ? '00' : '30'}`

  const sb = getSupabase()

  // ── Essai 1 : RPC get_map_places (après migration_v5_performance.sql) ────────
  // 1 seul appel DB, retourne places + scores jointés.
  const { data: rpcData, error: rpcError } = await sb
    .rpc('get_map_places', { p_month: month, p_slot: slot })

  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
    return NextResponse.json(
      rpcData.map((p: PlaceSlim & { current_score?: number }) => ({
        ...p,
        currentScore: (p as { current_score?: number }).current_score ?? 3,
      })),
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } }
    )
  }

  // ── Fallback : 2 requêtes parallèles côté serveur ────────────────────────────
  // Pagination en //  : places page 0 + page 1 (si > 1000 lieux) + scores, tout en même temps.
  // Depuis Paris → Supabase Paris : chaque appel ≈ 3-5 ms (même datacenter).
  const PAGE = 1000

  const [p0, p1, scoresRes] = await Promise.all([
    // Page 0 : lieux 0-999
    sb.from('places').select(SLIM)
      .not('lat', 'is', null).not('lng', 'is', null)
      .range(0, PAGE - 1),
    // Page 1 : lieux 1000-1999 (lancée en // sans attendre la page 0)
    sb.from('places').select(SLIM)
      .not('lat', 'is', null).not('lng', 'is', null)
      .range(PAGE, PAGE * 2 - 1),
    // Scores du créneau
    sb.from('sun_scores').select('place_id,score')
      .eq('month', month).eq('time_slot', slot),
  ])

  const allPlaces: PlaceSlim[] = [
    ...((p0.data as unknown as PlaceSlim[]) ?? []),
    ...((p1.data as unknown as PlaceSlim[]) ?? []),
  ]

  // Si on dépasse 2000 lieux un jour, rajouter une page 2 ici.

  const scoreMap = new Map<string, number>(
    ((scoresRes.data ?? []) as ScoreRow[]).map(r => [r.place_id, r.score])
  )

  const places = allPlaces.map(p => ({
    ...p,
    currentScore: scoreMap.get(p.id) ?? 3,
  }))

  if (places.length === 0) {
    // Diagnostic : log l'erreur pour Vercel Functions logs
    console.error('[/api/places] Aucun lieu retourné. Erreurs:', {
      rpcError: rpcError?.message,
      p0error: p0.error?.message,
      p1error: p1.error?.message,
    })
    return NextResponse.json([], { status: 200 })
  }

  return NextResponse.json(places, {
    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
  })
}

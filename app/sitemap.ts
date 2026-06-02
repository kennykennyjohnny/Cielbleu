import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

// Sitemap : l'accueil + une page indexable par terrasse (/place/[id]).
// Régénéré 1×/jour (revalidate) — pas à chaque requête : on évite de marteler
// Supabase, et les lieux bougent peu. Les ~19 000 URLs tiennent largement sous
// la limite de 50 000 d'un sitemap unique.
export const revalidate = 86400 // 24 h

const SITE = 'https://hopsoleil.fr'

// Garde en phase (approximative) avec le filtre d'affichage de app/page.tsx :
// on n'indexe pas les chaînes / commerces sans vraie terrasse → pages pauvres.
const NON_TERRACE_RE = /franprix|monoprix|carrefour|naturalia|biocoop|lidl|aldi|picard|tabac-presse|pharmacie|pressing|coiffure|coiffeur|kebab|mcdonald|burger.?king|\bkfc\b|\bsubway\b|domino|sushi|\bquick\b/i

interface PlaceRow {
  id: string
  name: string
  created_at: string | null
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  ]

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return base

  try {
    const sb = createClient(url, key, { auth: { persistSession: false } })
    const PAGE = 1000
    const MAX = 50000
    const rows: PlaceRow[] = []
    for (let from = 0; from < MAX; from += PAGE) {
      const { data, error } = await sb
        .from('places')
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error || !data?.length) break
      rows.push(...(data as PlaceRow[]))
      if (data.length < PAGE) break
    }

    const placeUrls: MetadataRoute.Sitemap = rows
      .filter((p) => p.name && !NON_TERRACE_RE.test(p.name))
      .map((p) => ({
        url: `${SITE}/place/${p.id}`,
        lastModified: p.created_at ? new Date(p.created_at) : undefined,
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }))

    return [...base, ...placeUrls]
  } catch {
    return base
  }
}

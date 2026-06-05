import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { isHiddenPlace } from '@/lib/terraceClassify'

// Sitemap : l'accueil + une page indexable par terrasse (/place/[id]).
// Régénéré 1×/jour (revalidate) — pas à chaque requête : on évite de marteler
// Supabase, et les lieux bougent peu. Les ~19 000 URLs tiennent largement sous
// la limite de 50 000 d'un sitemap unique.
export const revalidate = 86400 // 24 h

const SITE = 'https://hopsoleil.fr'

interface PlaceRow {
  id: string
  name: string
  type: string | null
  has_terrace: boolean | null
  created_at: string | null
}

// Landing pages SEO — prioritaires pour Google (high signal).
const SEO_LANDINGS: MetadataRoute.Sitemap = (() => {
  const today = new Date()
  const arrs = Array.from({ length: 20 }, (_, i) => i + 1)
  const ord = (n: number) => (n === 1 ? 'er' : 'e')
  return [
    { url: `${SITE}/terrasses-ensoleillees-paris`, lastModified: today, changeFrequency: 'daily', priority: 0.95 },
    { url: `${SITE}/bar-terrasse-paris`,           lastModified: today, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/cafe-terrasse-paris`,          lastModified: today, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/restaurant-terrasse-paris`,    lastModified: today, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/rooftop-paris`,                lastModified: today, changeFrequency: 'daily', priority: 0.9 },
    ...arrs.map((n) => ({
      url: `${SITE}/terrasses-ensoleillees-paris/${n}${ord(n)}-arrondissement`,
      lastModified: today,
      changeFrequency: 'daily' as const,
      priority: 0.85,
    })),
  ]
})()

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = [
    { url: SITE, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    ...SEO_LANDINGS,
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
        .select('id, name, type, has_terrace, created_at')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error || !data?.length) break
      rows.push(...(data as PlaceRow[]))
      if (data.length < PAGE) break
    }

    const placeUrls: MetadataRoute.Sitemap = rows
      .filter((p) => p.name && !isHiddenPlace(p))
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

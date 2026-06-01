import type { Metadata } from 'next'
import RedirectClient from './RedirectClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar', restaurant: 'Restaurant', cafe: 'Café', park: 'Parc',
}

interface PlaceLite {
  name: string
  type: string
  arrondissement: number | null
}

// Lecture serveur via l'API REST Supabase (clé anon, lieux publics).
async function fetchPlace(id: string): Promise<PlaceLite | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) return null
  try {
    const url = `${base}/rest/v1/places?id=eq.${encodeURIComponent(id)}&select=name,type,arrondissement&limit=1`
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const rows = (await res.json()) as PlaceLite[]
    return rows?.[0] ?? null
  } catch {
    return null
  }
}

// ── OG dynamique par terrasse ──────────────────────────────────────────────
// L'image OG est fournie automatiquement par opengraph-image.tsx (colocalisé).
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const place = await fetchPlace(id)

  if (!place) {
    const title = 'Terrasse à Paris — HopSoleil'
    const description = 'Découvre l’ensoleillement des terrasses parisiennes en temps réel sur HopSoleil.'
    return {
      title,
      description,
      openGraph: { title, description, url: `https://hopsoleil.fr/place/${id}`, siteName: 'HopSoleil', locale: 'fr_FR', type: 'website' },
      twitter: { card: 'summary_large_image', title, description },
    }
  }

  const typeLabel = TYPE_LABEL[place.type] ?? place.type
  const arr = place.arrondissement
  const where = arr != null ? `${arr}${arr === 1 ? 'er' : 'e'} arrondissement` : 'Paris'
  const title = `${place.name} — Terrasse ensoleillée à Paris | HopSoleil`
  const description = `${typeLabel} · ${where}. Vois l’ensoleillement de ${place.name} heure par heure et trouve le meilleur moment au soleil sur HopSoleil.`
  const url = `https://hopsoleil.fr/place/${id}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'HopSoleil', locale: 'fr_FR', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

// Les liens partagés (/place/[id]) servent des balises OG spécifiques puis
// renvoient l'utilisateur vers la vraie interface (home) avec la terrasse
// pré-sélectionnée.
export default async function PlacePage({ params }: PageProps) {
  const { id } = await params
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        background: 'linear-gradient(140deg, #0f2744 0%, #1F3A5F 55%, #0b1f3a 100%)',
        color: '#fff',
        fontFamily: 'var(--font-outfit), sans-serif',
        textAlign: 'center',
      }}
    >
      <RedirectClient id={id} />
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 38% 36%, #ffe066 0%, #EDC145 60%, #f59e0b 100%)',
          boxShadow: '0 0 0 10px rgba(237,193,69,0.14)',
        }}
      />
      <p style={{ fontSize: 16, fontWeight: 700, color: '#EDC145', margin: 0 }}>HopSoleil</p>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
        Ouverture de la terrasse…{' '}
        <a href={`/?place=${encodeURIComponent(id)}`} style={{ color: '#fff', fontWeight: 700 }}>
          Continuer
        </a>
      </p>
    </main>
  )
}

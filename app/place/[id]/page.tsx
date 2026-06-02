import type { Metadata } from 'next'
import Link from 'next/link'

// Pages partagées /place/[id] : vraies landing pages rendues côté serveur.
// Avant, c'était un redirect client vers l'app → corps vide pour Google.
// Désormais : contenu réel indexable (nom, type, arrondissement, fenêtre de
// soleil du jour, note) + données structurées JSON-LD + CTA vers la carte live.
// Régénéré 1×/h (ISR) : rapide, cacheable, et bon pour le SEO local.
export const revalidate = 3600

const SITE = 'https://hopsoleil.fr'
const SOLEIL = '#EDC145'
const NAVY = '#1F3A5F'
const CREME = '#FFFDF7'

interface PageProps {
  params: Promise<{ id: string }>
}

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar', restaurant: 'Restaurant', cafe: 'Café', park: 'Parc',
}
// Type schema.org le plus proche pour les données structurées.
const TYPE_SCHEMA: Record<string, string> = {
  bar: 'BarOrPub', restaurant: 'Restaurant', cafe: 'CafeOrCoffeeShop', park: 'Park',
}

interface PlaceFull {
  id: string
  name: string
  type: string
  address: string | null
  arrondissement: number | null
  lat: number | null
  lng: number | null
  google_rating: number | null
  price_level: number | null
  photos: string[] | null
  google_maps_url: string | null
  has_terrace: boolean | null
}

interface ScoreRow { time_slot: string; score: number }

// ── Accès Supabase (REST, clé anon, lieux publics) ──────────────────────────
function sbHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` }
}

async function fetchPlace(id: string): Promise<PlaceFull | null> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) return null
  try {
    const select = 'id,name,type,address,arrondissement,lat,lng,google_rating,price_level,photos,google_maps_url,has_terrace'
    const url = `${base}/rest/v1/places?id=eq.${encodeURIComponent(id)}&select=${select}&limit=1`
    const res = await fetch(url, { headers: sbHeaders(key), next: { revalidate: 3600 } })
    if (!res.ok) return null
    const rows = (await res.json()) as PlaceFull[]
    return rows?.[0] ?? null
  } catch {
    return null
  }
}

async function fetchScores(id: string, month: number): Promise<ScoreRow[]> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) return []
  try {
    const url = `${base}/rest/v1/sun_scores?place_id=eq.${encodeURIComponent(id)}&month=eq.${month}&select=time_slot,score`
    const res = await fetch(url, { headers: sbHeaders(key), next: { revalidate: 3600 } })
    if (!res.ok) return []
    return (await res.json()) as ScoreRow[]
  } catch {
    return []
  }
}

// ── Helpers (serveur, sans hooks) ───────────────────────────────────────────
function fmtSlotStart(slot: string): string {
  const [h, m] = slot.split(':').map(Number)
  return `${h}h${m === 0 ? '' : '30'}`
}
function fmtSlotEnd(slot: string): string {
  const [h, m] = slot.split(':').map(Number)
  let eH = h, eM = m + 30
  if (eM >= 60) { eM = 0; eH++ }
  return `${eH}h${eM === 0 ? '' : '30'}`
}
// Plus longue plage continue de score ≥ 4 entre 7h et 22h.
function computeSunWindow(scores: ScoreRow[]): { fromSlot: string; toSlot: string } | null {
  const sorted = scores
    .filter(s => { const [hh] = s.time_slot.split(':').map(Number); return hh >= 7 && hh <= 22 })
    .sort((a, b) => a.time_slot.localeCompare(b.time_slot))
  let best = { start: -1, end: -1, len: 0 }
  let cur = { start: -1, len: 0 }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].score >= 4) {
      if (cur.start < 0) cur.start = i
      cur.len++
      if (cur.len > best.len) best = { start: cur.start, end: i, len: cur.len }
    } else { cur = { start: -1, len: 0 } }
  }
  if (best.len === 0 || best.start < 0) return null
  return { fromSlot: sorted[best.start].time_slot, toSlot: sorted[best.end].time_slot }
}
function photoRefFromUrl(url: string): string | null {
  try { return new URL(url).searchParams.get('photo_reference') } catch { return null }
}

// ── Métadonnées / OG ────────────────────────────────────────────────────────
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const place = await fetchPlace(id)
  const url = `${SITE}/place/${id}`

  if (!place) {
    const title = 'Terrasse à Paris — HopSoleil'
    const description = 'Découvre l’ensoleillement des terrasses parisiennes en temps réel sur HopSoleil.'
    return {
      title, description,
      alternates: { canonical: url },
      openGraph: { title, description, url, siteName: 'HopSoleil', locale: 'fr_FR', type: 'website' },
      twitter: { card: 'summary_large_image', title, description },
    }
  }

  const typeLabel = TYPE_LABEL[place.type] ?? place.type
  const arr = place.arrondissement
  const where = arr != null ? `${arr}${arr === 1 ? 'er' : 'e'} arrondissement` : 'Paris'
  const title = `${place.name} — Terrasse ensoleillée à Paris | HopSoleil`
  const description = `${typeLabel} · ${where}. Vois l’ensoleillement de ${place.name} heure par heure et trouve le meilleur moment au soleil sur HopSoleil.`

  return {
    title, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: 'HopSoleil', locale: 'fr_FR', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

// ── Page ────────────────────────────────────────────────────────────────────
export default async function PlacePage({ params }: PageProps) {
  const { id } = await params
  const month = new Date().getMonth() + 1
  const [place, scores] = await Promise.all([fetchPlace(id), fetchScores(id, month)])

  // Lieu introuvable → page sobre + CTA accueil (toujours indexable proprement)
  if (!place) {
    return (
      <main style={{ ...PAGE_WRAP }}>
        <BrandHeader />
        <div style={{ textAlign: 'center', maxWidth: 460 }}>
          <h1 style={{ fontFamily: 'var(--font-bricolage), sans-serif', fontSize: 28, fontWeight: 900, color: NAVY, margin: '0 0 8px' }}>
            Terrasse introuvable
          </h1>
          <p style={{ color: 'rgba(31,58,95,0.6)', fontSize: 15, margin: '0 0 22px' }}>
            Cette terrasse n’est plus disponible. Explore toutes les terrasses ensoleillées de Paris sur la carte.
          </p>
          <CtaCarte href="/" label="Ouvrir la carte" />
        </div>
      </main>
    )
  }

  const typeLabel = TYPE_LABEL[place.type] ?? place.type
  const ordinal = place.arrondissement === 1 ? 'er' : 'e'
  const sunWindow = computeSunWindow(scores)
  const heroRef = (place.photos ?? []).map(photoRefFromUrl).find((r): r is string => !!r) ?? null
  const heroUrl = heroRef ? `/api/photo?ref=${encodeURIComponent(heroRef)}&w=1200` : null

  // ── Données structurées (schema.org) — SEO local / rich results ──
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': TYPE_SCHEMA[place.type] ?? 'Restaurant',
    name: place.name,
    url: `${SITE}/place/${id}`,
    ...(place.address ? {
      address: {
        '@type': 'PostalAddress',
        streetAddress: place.address,
        addressLocality: 'Paris',
        addressRegion: 'Île-de-France',
        addressCountry: 'FR',
      },
    } : {}),
    ...(place.lat != null && place.lng != null ? {
      geo: { '@type': 'GeoCoordinates', latitude: place.lat, longitude: place.lng },
    } : {}),
    ...(place.google_rating != null ? {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: place.google_rating, bestRating: 5, worstRating: 1 },
    } : {}),
    ...(place.price_level ? { priceRange: '€'.repeat(place.price_level) } : {}),
  }

  return (
    <main style={{ ...PAGE_WRAP, justifyContent: 'flex-start' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <BrandHeader />

      <article
        style={{
          width: '100%', maxWidth: 560, background: '#fff', borderRadius: 24,
          border: '1px solid rgba(31,58,95,0.08)', boxShadow: '0 18px 50px rgba(31,58,95,0.12)',
          overflow: 'hidden',
        }}
      >
        {/* Hero photo */}
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt={`Terrasse de ${place.name}`} width={560} height={300}
            style={{ width: '100%', height: 240, objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ height: 120, background: `linear-gradient(135deg, #FFF1C9 0%, ${SOLEIL} 120%)` }} />
        )}

        <div style={{ padding: '20px 22px 26px' }}>
          {/* Badges */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
            <Badge>{typeLabel}</Badge>
            {place.arrondissement != null && <Badge>{place.arrondissement}{ordinal} arr.</Badge>}
            {place.has_terrace !== false && <Badge tone="green">● Terrasse</Badge>}
          </div>

          {/* Titre */}
          <h1 style={{ fontFamily: 'var(--font-bricolage), sans-serif', fontWeight: 900, fontSize: 'clamp(26px,7vw,34px)', lineHeight: 1.02, letterSpacing: '-0.03em', color: '#0b1f3a', margin: 0 }}>
            {place.name}
          </h1>
          {place.address && (
            <p style={{ color: 'rgba(31,58,95,0.6)', fontSize: 14, fontWeight: 500, margin: '10px 0 0' }}>
              {place.address}
            </p>
          )}

          {/* Bloc soleil du jour */}
          <div
            style={{
              marginTop: 18, borderRadius: 16, padding: '14px 16px',
              display: 'flex', alignItems: 'center', gap: 13,
              background: sunWindow ? '#FFF1B8' : 'rgba(141,153,174,0.10)',
              border: `1px solid ${sunWindow ? 'rgba(237,193,69,0.40)' : 'rgba(141,153,174,0.18)'}`,
            }}
          >
            <span style={{ fontSize: 34, lineHeight: 1 }} aria-hidden="true">{sunWindow ? '☀️' : '🌥️'}</span>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: sunWindow ? '#5c3d00' : '#6f7a8a' }}>
                Soleil aujourd’hui
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 16, fontWeight: 800, color: sunWindow ? '#3d2800' : '#4a5568' }}>
                {sunWindow
                  ? `Au soleil de ${fmtSlotStart(sunWindow.fromSlot)} à ${fmtSlotEnd(sunWindow.toSlot)}`
                  : 'Plutôt à l’ombre aujourd’hui'}
              </p>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginTop: 14 }}>
            <Stat value={place.google_rating != null ? `${place.google_rating.toFixed(1)} ★` : '—'} label="Note Google" />
            <Stat value={place.price_level ? '€'.repeat(place.price_level) : '—'} label="Prix" />
          </div>

          {/* CTA */}
          <div style={{ marginTop: 22 }}>
            <CtaCarte href={`/?place=${encodeURIComponent(id)}`} label="Voir au soleil sur la carte" />
          </div>
          {place.google_maps_url && (
            <a href={place.google_maps_url} target="_blank" rel="noopener noreferrer"
              style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 13, fontWeight: 700, color: 'rgba(31,58,95,0.55)', textDecoration: 'none' }}>
              Ouvrir dans Google Maps →
            </a>
          )}
        </div>
      </article>

      <p style={{ marginTop: 22, fontSize: 13, color: 'rgba(31,58,95,0.5)' }}>
        <Link href="/" style={{ color: NAVY, fontWeight: 700, textDecoration: 'none' }}>HopSoleil</Link>
        {' · '}Le radar des terrasses ensoleillées à Paris
      </p>
    </main>
  )
}

// ── Sous-composants serveur ─────────────────────────────────────────────────
const PAGE_WRAP: React.CSSProperties = {
  minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center',
  justifyContent: 'center', gap: 22, padding: '28px 18px 40px',
  background: `linear-gradient(160deg, #FFF6DE 0%, ${CREME} 50%, #FFFFFF 100%)`,
  fontFamily: 'var(--font-outfit), sans-serif',
}

function BrandHeader() {
  return (
    <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-hopsoleil.png" alt="HopSoleil" style={{ height: 34, width: 'auto', mixBlendMode: 'multiply' }} />
    </Link>
  )
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: 'green' }) {
  const green = tone === 'green'
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, letterSpacing: '0.02em', borderRadius: 999, padding: '4px 10px',
      background: green ? 'rgba(79,143,101,0.10)' : 'rgba(31,58,95,0.06)',
      color: green ? '#3d8554' : 'rgba(31,58,95,0.7)',
    }}>
      {children}
    </span>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: 'rgba(31,58,95,0.04)', borderRadius: 14, padding: '12px 14px' }}>
      <strong style={{ display: 'block', color: '#0b1f3a', fontSize: 19, fontWeight: 900, lineHeight: 1 }}>{value}</strong>
      <span style={{ display: 'block', marginTop: 6, color: '#6f7a8a', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  )
}

function CtaCarte({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      width: '100%', height: 52, borderRadius: 14, textDecoration: 'none',
      background: `linear-gradient(135deg, ${SOLEIL} 0%, #F2A23B 120%)`,
      color: '#3d2800', fontSize: 16, fontWeight: 900, letterSpacing: '-0.01em',
      boxShadow: '0 8px 22px rgba(237,193,69,0.40)',
    }}>
      ☀ {label}
    </Link>
  )
}

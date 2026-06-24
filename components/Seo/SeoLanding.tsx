import Link from 'next/link'
import { isHiddenPlace } from '@/lib/terraceClassify'

// Landing page SEO réutilisable.
// Sert toutes les pages /terrasses-ensoleillees-paris[/arrondissement-XX],
// /bar-terrasse-paris, /cafe-terrasse-paris, /restaurant-terrasse-paris,
// /rooftop-paris. Chacune passe ses props (titre, intro, filtres BDD).
// → Contenu HTML riche en mots-clés + listing serveur des meilleurs lieux
//   + JSON-LD ItemList → Google indexe et liste.
//
// Important : on ne touche PAS à l'UX de l'app. Ces landings sont
// indépendantes ; un gros CTA renvoie vers la carte live (avec lieu pré-ouvert
// si l'utilisateur clique sur un résultat précis).

const SITE = 'https://hopsoleil.fr'
const SOLEIL = '#EDC145'
const NAVY = '#1F3A5F'
const CREME = '#FFFDF7'

export interface SeoLandingProps {
  /** Chemin canonique (ex. "/terrasses-ensoleillees-paris/11e-arrondissement") */
  canonicalPath: string
  /** Titre h1 visible — keyword-rich */
  h1: string
  /** Sous-titre / intro affichée sous le h1 */
  intro: string
  /** Filtre type de lieu (bar/restaurant/cafe/park) — null = tous */
  placeType?: 'bar' | 'restaurant' | 'cafe' | 'park' | null
  /** Filtre arrondissement (1..20) — null = Paris entier */
  arrondissement?: number | null
  /** Mot-clé de filtre dans le nom (ex. "rooftop|roof[- ]?top") — regex */
  nameMatch?: RegExp | null
  /** Liens internes vers les landings sœurs (footer SEO) */
  relatedLinks?: { href: string; label: string }[]
  /** Bloc FAQ propre à cette page (en plus de la FAQ globale du layout) */
  faq?: { question: string; answer: string }[]
  /** Sections de contenu rédactionnel (titre + texte) — profondeur SEO. */
  sections?: { heading: string; text: string }[]
}

interface LiteRow {
  id: string
  name: string
  address: string | null
  type: string
  arrondissement: number | null
  google_rating: number | null
  has_terrace: boolean | null
  price_level: number | null
}

async function fetchTopPlaces(opts: SeoLandingProps): Promise<LiteRow[]> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!base || !key) return []

  const select =
    'id,name,address,type,arrondissement,google_rating,has_terrace,price_level'
  const params = new URLSearchParams()
  params.set('select', select)
  // On vise les lieux bien notés (Google rating ≥ 4.0) — plus pertinent pour
  // les visiteurs et meilleur signal pour Google (qualité du contenu).
  params.set('google_rating', 'gte.4.0')
  params.set('order', 'google_rating.desc.nullslast')
  params.set('limit', '60')
  if (opts.placeType) params.set('type', `eq.${opts.placeType}`)
  if (opts.arrondissement != null) {
    params.set('arrondissement', `eq.${opts.arrondissement}`)
  }
  if (opts.nameMatch) {
    // Postgres REST → filtre par regex insensible à la casse (~*)
    params.set('name', `imatch.${opts.nameMatch.source}`)
  }

  try {
    const url = `${base}/rest/v1/places?${params.toString()}`
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const rows = (await res.json()) as LiteRow[]
    // Exclut les chaînes / commerces non-terrasse (cohérent avec la carte)
    return rows.filter((p) => p.name && !isHiddenPlace(p)).slice(0, 30)
  } catch {
    return []
  }
}

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar', restaurant: 'Restaurant', cafe: 'Café', park: 'Parc',
}

export default async function SeoLanding(props: SeoLandingProps) {
  const places = await fetchTopPlaces(props)
  const canonical = `${SITE}${props.canonicalPath}`

  // JSON-LD ItemList → Google peut afficher un carrousel des lieux.
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: props.h1,
    itemListElement: places.slice(0, 20).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE}/place/${p.id}`,
      name: p.name,
    })),
  }

  // Breadcrumb : améliore l'affichage du fil d'Ariane dans les SERPs.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE },
      { '@type': 'ListItem', position: 2, name: props.h1, item: canonical },
    ],
  }

  const faqJsonLd = props.faq?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: props.faq.map((f) => ({
          '@type': 'Question',
          name: f.question,
          acceptedAnswer: { '@type': 'Answer', text: f.answer },
        })),
      }
    : null

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: `linear-gradient(160deg, #FFF6DE 0%, ${CREME} 50%, #FFFFFF 100%)`,
        fontFamily: 'var(--font-outfit), sans-serif',
        color: NAVY,
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}

      {/* Header simple — logo cliquable, pas d'UX de l'app */}
      <header
        style={{
          padding: '18px 22px',
          borderBottom: '1px solid rgba(31,58,95,0.07)',
          background: 'rgba(255,252,243,0.92)',
        }}
      >
        <Link
          href="/"
          aria-label="HopSoleil — Retour à la carte"
          style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-hopsoleil.png"
            alt="HopSoleil"
            style={{ height: 32, width: 'auto', mixBlendMode: 'multiply' }}
          />
        </Link>
      </header>

      <article
        style={{
          maxWidth: 880,
          margin: '0 auto',
          padding: '36px 22px 64px',
        }}
      >
        {/* Breadcrumb visible */}
        <nav
          aria-label="Fil d'Ariane"
          style={{ fontSize: 12, fontWeight: 700, color: 'rgba(31,58,95,0.55)', marginBottom: 14 }}
        >
          <Link href="/" style={{ color: 'inherit', textDecoration: 'none' }}>Accueil</Link>
          <span aria-hidden="true" style={{ margin: '0 6px' }}>›</span>
          <span>{props.h1}</span>
        </nav>

        {/* h1 + intro */}
        <h1
          style={{
            fontFamily: 'var(--font-bricolage), sans-serif',
            fontWeight: 900,
            fontSize: 'clamp(30px, 6vw, 46px)',
            lineHeight: 1.02,
            letterSpacing: '-0.03em',
            color: '#0b1f3a',
            margin: 0,
          }}
        >
          {props.h1}
        </h1>
        <p
          style={{
            marginTop: 14,
            fontSize: 16,
            lineHeight: 1.55,
            color: 'rgba(31,58,95,0.78)',
            maxWidth: 680,
          }}
        >
          {props.intro}
        </p>

        {/* CTA principal vers la carte live */}
        <div style={{ marginTop: 22 }}>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 22px',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${SOLEIL} 0%, #F2A23B 120%)`,
              color: '#3d2800',
              fontSize: 15,
              fontWeight: 900,
              textDecoration: 'none',
              boxShadow: '0 8px 22px rgba(237,193,69,0.40)',
            }}
          >
            ☀ Voir la carte live des terrasses au soleil
          </Link>
        </div>

        {/* Listing top lieux (server-rendered → indexable) */}
        {places.length > 0 && (
          <section style={{ marginTop: 40 }}>
            <h2
              style={{
                fontFamily: 'var(--font-bricolage), sans-serif',
                fontWeight: 900,
                fontSize: 22,
                margin: '0 0 14px',
                color: '#0b1f3a',
              }}
            >
              Sélection : {places.length} adresses recommandées
            </h2>
            <ol
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 12,
              }}
            >
              {places.map((p, i) => {
                const arr = p.arrondissement
                const ord = arr === 1 ? 'er' : 'e'
                const cleanAddr = (p.address ?? '')
                  .replace(/,?\s*\d{5}.*/, '')
                  .replace(/,?\s*France\.?$/i, '')
                  .trim()
                return (
                  <li
                    key={p.id}
                    style={{
                      background: '#fff',
                      borderRadius: 14,
                      padding: '14px 16px',
                      border: '1px solid rgba(31,58,95,0.08)',
                      boxShadow: '0 2px 8px rgba(31,58,95,0.04)',
                    }}
                  >
                    <Link
                      href={`/place/${p.id}`}
                      style={{
                        textDecoration: 'none',
                        color: 'inherit',
                        display: 'block',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          color: 'rgba(31,58,95,0.5)',
                        }}
                      >
                        {i + 1}. {TYPE_LABEL[p.type] ?? p.type}
                        {arr != null && ` · ${arr}${ord}`}
                      </span>
                      <strong
                        style={{
                          display: 'block',
                          marginTop: 4,
                          fontSize: 16,
                          fontWeight: 900,
                          color: '#0b1f3a',
                          lineHeight: 1.2,
                        }}
                      >
                        {p.name}
                      </strong>
                      {cleanAddr && (
                        <span
                          style={{
                            display: 'block',
                            marginTop: 4,
                            fontSize: 12,
                            color: 'rgba(31,58,95,0.55)',
                          }}
                        >
                          {cleanAddr}
                        </span>
                      )}
                      {p.google_rating != null && (
                        <span
                          style={{
                            display: 'inline-block',
                            marginTop: 8,
                            fontSize: 12,
                            fontWeight: 800,
                            color: '#b87c00',
                          }}
                        >
                          ★ {p.google_rating.toFixed(1)}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ol>
          </section>
        )}

        {/* Sections rédactionnelles — contenu unique et utile (signal qualité) */}
        {props.sections?.length ? (
          <section style={{ marginTop: 44 }}>
            {props.sections.map((s, i) => (
              <div key={i} style={{ marginTop: i === 0 ? 0 : 26 }}>
                <h2
                  style={{
                    fontFamily: 'var(--font-bricolage), sans-serif',
                    fontWeight: 900, fontSize: 22, margin: '0 0 10px', color: '#0b1f3a',
                  }}
                >
                  {s.heading}
                </h2>
                <p style={{ fontSize: 15.5, lineHeight: 1.6, color: 'rgba(31,58,95,0.8)', margin: 0 }}>
                  {s.text}
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {/* FAQ */}
        {props.faq?.length ? (
          <section style={{ marginTop: 48 }}>
            <h2
              style={{
                fontFamily: 'var(--font-bricolage), sans-serif',
                fontWeight: 900,
                fontSize: 22,
                margin: '0 0 14px',
                color: '#0b1f3a',
              }}
            >
              Questions fréquentes
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {props.faq.map((f, i) => (
                <details
                  key={i}
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: '12px 16px',
                    border: '1px solid rgba(31,58,95,0.08)',
                  }}
                >
                  <summary
                    style={{
                      cursor: 'pointer',
                      fontSize: 15,
                      fontWeight: 800,
                      color: '#0b1f3a',
                      listStyle: 'none',
                    }}
                  >
                    {f.question}
                  </summary>
                  <p
                    style={{
                      marginTop: 8,
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: 'rgba(31,58,95,0.78)',
                    }}
                  >
                    {f.answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {/* Liens internes — maillage SEO */}
        {props.relatedLinks?.length ? (
          <section style={{ marginTop: 48 }}>
            <h2
              style={{
                fontFamily: 'var(--font-bricolage), sans-serif',
                fontWeight: 900,
                fontSize: 18,
                margin: '0 0 12px',
                color: '#0b1f3a',
              }}
            >
              Explorer plus de terrasses au soleil à Paris
            </h2>
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {props.relatedLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    style={{
                      display: 'inline-block',
                      padding: '7px 12px',
                      borderRadius: 999,
                      background: 'rgba(31,58,95,0.06)',
                      color: '#1F3A5F',
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer
          style={{
            marginTop: 56,
            paddingTop: 22,
            borderTop: '1px solid rgba(31,58,95,0.10)',
            fontSize: 13,
            color: 'rgba(31,58,95,0.55)',
          }}
        >
          <Link href="/" style={{ color: NAVY, fontWeight: 800, textDecoration: 'none' }}>
            HopSoleil
          </Link>
          {' · '}Le radar des terrasses ensoleillées à Paris en temps réel.
        </footer>
      </article>
    </main>
  )
}

import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Outfit } from 'next/font/google'
import '../styles/globals.css'

const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage-var',
  display: 'swap',
  axes: ['wdth'],
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit-var',
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://hopsoleil.fr'),
  title: {
    default: 'HopSoleil — Terrasses ensoleillées à Paris en temps réel ☀️',
    template: '%s | HopSoleil',
  },
  description:
    'HopSoleil, la carte des terrasses au soleil à Paris en temps réel. Bars, cafés, restaurants et parcs ensoleillés près de chez toi : score soleil heure par heure, météo live, vue 3D des ombres. Plus de 19 000 lieux référencés.',
  applicationName: 'HopSoleil',
  authors: [{ name: 'HopSoleil' }],
  creator: 'HopSoleil',
  publisher: 'HopSoleil',
  keywords: [
    // Brand + variantes courantes / fautes
    'HopSoleil', 'hopsoleil', 'hop soleil', 'hopsoleil.fr', 'hopsoleille',
    'opsoleil', 'hopsoleil paris', 'app hopsoleil',
    // Requêtes coeur
    'terrasse soleil paris', 'terrasses ensoleillées paris', 'terrasse ensoleillée paris',
    'terrasse au soleil paris', 'terrasse paris soleil', 'où boire au soleil paris',
    'où manger en terrasse paris', 'bar terrasse soleil paris',
    'café terrasse soleil paris', 'restaurant terrasse soleil paris',
    'rooftop paris', 'rooftop soleil paris',
    // Intent + temps réel
    'carte terrasses paris', 'terrasse paris temps réel', 'ensoleillement terrasse paris',
    'meilleure terrasse paris', 'apéro soleil paris', 'brunch terrasse paris',
    'terrasse couverte paris', 'terrasse cachée paris',
    // Géo Paris
    'paris', 'île-de-france', 'terrasse 11ème', 'terrasse marais', 'terrasse canal saint-martin',
    'terrasse bastille', 'terrasse montmartre', 'terrasse champs-élysées',
  ],
  category: 'lifestyle',
  alternates: {
    canonical: 'https://hopsoleil.fr',
    languages: { 'fr-FR': 'https://hopsoleil.fr' },
  },
  icons: {
    icon: [
      { url: '/favicon-vdef.png', type: 'image/png', sizes: '192x192' },
      { url: '/favicon.ico', sizes: '32x32' },
    ],
    apple: [
      { url: '/favicon-vdef.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'HopSoleil — Terrasses ensoleillées à Paris en temps réel ☀️',
    description:
      'Trouve en un clic la meilleure terrasse au soleil à Paris : bars, cafés, restaurants, parcs. Score soleil temps réel + météo + vue 3D des ombres.',
    url: 'https://hopsoleil.fr',
    siteName: 'HopSoleil',
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HopSoleil — Terrasses ensoleillées à Paris ☀️',
    description:
      'Le radar des terrasses au soleil à Paris : 19 000+ lieux, score soleil temps réel, météo, vue 3D.',
    creator: '@hopsoleil',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1F3A5F',
}

// JSON-LD : signaux forts pour Google (sitelinks, knowledge panel, brand).
// On déclare le site, l'organisation, la barre de recherche interne + une FAQ
// reprenant les requêtes-clés autour des terrasses ensoleillées à Paris.
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': 'https://hopsoleil.fr/#website',
      url: 'https://hopsoleil.fr',
      name: 'HopSoleil',
      alternateName: ['Hop Soleil', 'hopsoleil.fr'],
      description:
        'Carte temps réel des terrasses ensoleillées à Paris : bars, cafés, restaurants, parcs.',
      inLanguage: 'fr-FR',
      publisher: { '@id': 'https://hopsoleil.fr/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://hopsoleil.fr/?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      '@id': 'https://hopsoleil.fr/#organization',
      name: 'HopSoleil',
      url: 'https://hopsoleil.fr',
      logo: 'https://hopsoleil.fr/logo-hopsoleil.png',
      sameAs: [],
      description:
        'HopSoleil — la carte des terrasses au soleil à Paris en temps réel.',
      areaServed: { '@type': 'City', name: 'Paris' },
    },
    {
      '@type': 'WebApplication',
      name: 'HopSoleil',
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Web',
      url: 'https://hopsoleil.fr',
      browserRequirements: 'Requires JavaScript and modern browser',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
      description:
        'Trouve en temps réel la meilleure terrasse au soleil à Paris. Score d’ensoleillement heure par heure, météo live, plus de 19 000 lieux.',
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Comment trouver une terrasse au soleil à Paris ?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              'HopSoleil affiche en temps réel l’ensoleillement de plus de 19 000 bars, cafés, restaurants et parcs parisiens. Le score soleil est calculé à partir de la position du soleil, des hauteurs de bâtiments OpenStreetMap et de la météo Paris en direct.',
          },
        },
        {
          '@type': 'Question',
          name: 'À quoi sert le score soleil HopSoleil ?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              'Le score soleil va de 1 (à l’ombre) à 5 (plein soleil) et change toutes les 30 minutes. Il prend en compte la position réelle du soleil, l’ombre projetée par les bâtiments voisins et la couverture nuageuse en temps réel.',
          },
        },
        {
          '@type': 'Question',
          name: 'HopSoleil est-il gratuit ?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              'Oui. HopSoleil est entièrement gratuit : pas d’inscription nécessaire pour consulter la carte des terrasses ensoleillées à Paris.',
          },
        },
        {
          '@type': 'Question',
          name: 'Quels arrondissements sont couverts ?',
          acceptedAnswer: {
            '@type': 'Answer',
            text:
              'Les 20 arrondissements de Paris sont couverts : Marais, Bastille, Canal Saint-Martin, Oberkampf, Montmartre, Pigalle, Belleville, Saint-Germain, Champs-Élysées, Batignolles…',
          },
        },
      ],
    },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${bricolage.variable} ${outfit.variable}`}>
        {/* JSON-LD : Google extrait les données structurées partout dans le doc,
            pas seulement dans <head>. Le placer dans <body> évite d'écraser la
            metadata auto-injectée par Next 15 (title, description, OG, …). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  )
}

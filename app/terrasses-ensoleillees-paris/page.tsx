import type { Metadata } from 'next'
import SeoLanding from '@/components/Seo/SeoLanding'

// Hub principal : la landing-mère pour la requête "terrasses ensoleillées paris".
// ISR 1 h → page rapide, fraîche tous les jours.
export const revalidate = 3600

const PATH = '/terrasses-ensoleillees-paris'
const CANONICAL = `https://hopsoleil.fr${PATH}`

export const metadata: Metadata = {
  title: 'Terrasses ensoleillées à Paris — Carte en temps réel ☀️',
  description:
    'Toutes les terrasses au soleil à Paris en temps réel : bars, cafés, restaurants, parcs. Score soleil heure par heure, météo live, plus de 19 000 lieux référencés.',
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: 'Terrasses ensoleillées à Paris — HopSoleil',
    description:
      'Trouve la meilleure terrasse au soleil à Paris en temps réel. Score d’ensoleillement par heure, météo live.',
    url: CANONICAL,
    siteName: 'HopSoleil',
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terrasses ensoleillées à Paris ☀️',
    description: 'Le radar des terrasses au soleil à Paris.',
  },
}

const ARRS = Array.from({ length: 20 }, (_, i) => i + 1)
const ord = (n: number) => (n === 1 ? 'er' : 'e')

export default function Page() {
  return (
    <SeoLanding
      canonicalPath={PATH}
      h1="Terrasses ensoleillées à Paris en temps réel"
      intro="HopSoleil détecte en direct toutes les terrasses au soleil à Paris : bars, cafés, restaurants, parcs. Pour chaque lieu, un score soleil de 1 à 5 calculé à partir de la position du soleil, des ombres des bâtiments OpenStreetMap et de la météo Paris en temps réel. Plus de 19 000 adresses dans les 20 arrondissements."
      placeType={null}
      arrondissement={null}
      relatedLinks={[
        { href: '/bar-terrasse-paris', label: '🍻 Bars terrasse soleil' },
        { href: '/cafe-terrasse-paris', label: '☕ Cafés terrasse soleil' },
        { href: '/restaurant-terrasse-paris', label: '🍽 Restaurants terrasse soleil' },
        { href: '/rooftop-paris', label: '🏙 Rooftops à Paris' },
        ...ARRS.map((n) => ({
          href: `/terrasses-ensoleillees-paris/${n}e-arrondissement`,
          label: `Terrasses ${n}${ord(n)}`,
        })),
      ]}
      faq={[
        {
          question: 'Comment HopSoleil sait-il quelles terrasses sont au soleil ?',
          answer:
            "L'app combine trois signaux : la position du soleil (SunCalc), les hauteurs réelles des bâtiments parisiens (OpenStreetMap) qui projettent des ombres en 3D, et la couverture nuageuse Paris en temps réel (OpenWeatherMap). Le score se met à jour toutes les 30 minutes.",
        },
        {
          question: 'Quels types de lieux sont couverts ?',
          answer:
            'Bars, cafés, restaurants, brasseries, bistrots, salons de thé, rooftops, parcs et jardins. Les chaînes et commerces non-terrasses sont exclus automatiquement.',
        },
        {
          question: 'Est-ce que ça marche pour toute la France ?',
          answer:
            'Pour le moment HopSoleil couvre uniquement Paris (les 20 arrondissements). L’extension à d’autres villes est en réflexion.',
        },
        {
          question: 'Comment trouver une terrasse au soleil maintenant ?',
          answer:
            "Ouvrez la carte HopSoleil : les pins jaunes indiquent les terrasses actuellement en plein soleil. Vous pouvez aussi déplacer le curseur d'heure pour anticiper le soleil dans 1h, 2h ou plus tard dans la journée.",
        },
      ]}
    />
  )
}

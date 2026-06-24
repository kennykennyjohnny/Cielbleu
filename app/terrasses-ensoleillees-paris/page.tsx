import type { Metadata } from 'next'
import SeoLanding from '@/components/Seo/SeoLanding'

// Hub principal : la landing-mère pour la requête "terrasses ensoleillées paris".
// ISR 1 h → page rapide, fraîche tous les jours.
export const revalidate = 3600

const PATH = '/terrasses-ensoleillees-paris'
const CANONICAL = `https://hopsoleil.fr${PATH}`

export const metadata: Metadata = {
  title: 'Terrasse au soleil à Paris — la carte en temps réel ☀️',
  description:
    'Trouvez une terrasse au soleil à Paris maintenant : bars, cafés, restaurants et parcs ensoleillés, score soleil heure par heure et météo en direct. Plus de 19 000 terrasses parisiennes classées par ensoleillement.',
  keywords: [
    'terrasse soleil paris', 'terrasse au soleil paris', 'terrasses ensoleillées paris',
    'terrasse ensoleillée paris', 'où boire au soleil paris', 'terrasse paris soleil',
    'apéro soleil paris', 'brunch terrasse paris',
  ],
  alternates: { canonical: CANONICAL },
  openGraph: {
    title: 'Terrasse au soleil à Paris — carte en temps réel | HopSoleil',
    description:
      'Trouve la meilleure terrasse au soleil à Paris en temps réel. Score d’ensoleillement par heure, météo live, 19 000+ adresses.',
    url: CANONICAL,
    siteName: 'HopSoleil',
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terrasse au soleil à Paris ☀️',
    description: 'Le radar des terrasses au soleil à Paris, en temps réel.',
  },
}

const ARRS = Array.from({ length: 20 }, (_, i) => i + 1)
const ord = (n: number) => (n === 1 ? 'er' : 'e')

export default function Page() {
  return (
    <SeoLanding
      canonicalPath={PATH}
      h1="Terrasse au soleil à Paris, en temps réel"
      intro="Trouvez une terrasse au soleil à Paris maintenant. HopSoleil détecte en direct toutes les terrasses ensoleillées de la capitale — bars, cafés, restaurants, parcs — avec, pour chaque lieu, un score soleil de 1 à 5 calculé à partir de la position du soleil, des ombres des bâtiments (OpenStreetMap) et de la météo Paris en temps réel. Plus de 19 000 adresses dans les 20 arrondissements."
      placeType={null}
      arrondissement={null}
      sections={[
        {
          heading: 'Comment trouver une terrasse au soleil à Paris maintenant',
          text: "Ouvrez la carte HopSoleil : les terrasses actuellement au soleil ressortent en jaune, celles à l'ombre en gris. Le curseur d'heure permet d'anticiper — vous voyez où il fera soleil dans une heure, à l'apéro ou en fin d'après-midi. Plus besoin de tourner dans le quartier : vous repérez en quelques secondes la terrasse au soleil la plus proche, et jusqu'à quelle heure elle reste ensoleillée.",
        },
        {
          heading: 'Soleil, ombre et météo : un score qui colle à la réalité',
          text: "Une terrasse plein sud peut être à l'ombre à cause de l'immeuble d'en face. HopSoleil tient compte des hauteurs réelles des bâtiments parisiens pour calculer l'ombre projetée heure par heure, puis pondère par la couverture nuageuse en direct. Le résultat : un score d'ensoleillement fiable, réactualisé toutes les 30 minutes, qui distingue le vrai plein soleil de la fausse promesse.",
        },
        {
          heading: 'Les meilleurs quartiers pour une terrasse ensoleillée',
          text: "Le Marais, Bastille, le canal Saint-Martin, Oberkampf, Montmartre, Pigalle, Belleville, Saint-Germain-des-Prés, les Batignolles ou les quais de Seine regorgent de terrasses au soleil. HopSoleil couvre les 20 arrondissements : choisissez votre quartier ci-dessus pour la liste des terrasses ensoleillées à proximité, ou ouvrez la carte pour explorer en temps réel.",
        },
      ]}
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

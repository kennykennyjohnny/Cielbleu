import type { Metadata } from 'next'
import SeoLanding from '@/components/Seo/SeoLanding'

export const revalidate = 3600

const PATH = '/cafe-terrasse-paris'
const CANONICAL = `https://hopsoleil.fr${PATH}`

export const metadata: Metadata = {
  title: 'Cafés avec terrasse au soleil à Paris — Carte temps réel ☀️',
  description:
    "Les meilleurs cafés avec terrasse ensoleillée à Paris en direct. Café matinal, brunch ou pause goûter au soleil : score d'ensoleillement temps réel, météo live, sélection dans tous les arrondissements.",
  alternates: { canonical: CANONICAL },
  openGraph: { title: 'Cafés terrasse soleil Paris — HopSoleil', description: 'Trouve le meilleur café avec terrasse au soleil à Paris en temps réel.', url: CANONICAL, siteName: 'HopSoleil', locale: 'fr_FR', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Cafés terrasse soleil Paris ☀️', description: "Le radar des cafés au soleil à Paris." },
}

export default function Page() {
  return (
    <SeoLanding
      canonicalPath={PATH}
      h1="Cafés avec terrasse au soleil à Paris"
      intro="Café au soleil, brunch en terrasse ou pause goûter ensoleillée ? HopSoleil détecte en temps réel tous les cafés et salons de thé parisiens dont la terrasse profite du soleil maintenant. Score d’ensoleillement actualisé toutes les 30 minutes."
      placeType="cafe"
      relatedLinks={[
        { href: '/terrasses-ensoleillees-paris', label: 'Toutes les terrasses ensoleillées de Paris' },
        { href: '/bar-terrasse-paris', label: '🍻 Bars terrasse soleil' },
        { href: '/restaurant-terrasse-paris', label: '🍽 Restaurants terrasse soleil' },
        { href: '/rooftop-paris', label: '🏙 Rooftops Paris' },
        { href: '/terrasses-ensoleillees-paris/6e-arrondissement', label: 'Saint-Germain' },
        { href: '/terrasses-ensoleillees-paris/18e-arrondissement', label: 'Montmartre' },
        { href: '/terrasses-ensoleillees-paris/3e-arrondissement', label: 'Haut Marais' },
      ]}
      faq={[
        {
          question: 'Où prendre un café au soleil à Paris ?',
          answer: "HopSoleil liste en direct tous les cafés dont la terrasse est actuellement au soleil. La carte est mise à jour en continu — ouvre-la et regarde les pins jaunes.",
        },
        {
          question: 'Comment trouver un café avec terrasse pour bruncher au soleil ?',
          answer: "Filtre par type 'café' sur HopSoleil et déplace le curseur d'heure sur la plage 11h-14h pour anticiper l'ensoleillement le matin du brunch.",
        },
        {
          question: 'Les cafés couverts (terrasse fermée) sont-ils inclus ?',
          answer: 'Pour le moment HopSoleil affiche les terrasses ouvertes — les terrasses couvertes/fermées arriveront dans une mise à jour future.',
        },
      ]}
    />
  )
}

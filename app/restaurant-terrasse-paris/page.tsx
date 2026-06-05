import type { Metadata } from 'next'
import SeoLanding from '@/components/Seo/SeoLanding'

export const revalidate = 3600

const PATH = '/restaurant-terrasse-paris'
const CANONICAL = `https://hopsoleil.fr${PATH}`

export const metadata: Metadata = {
  title: 'Restaurants avec terrasse au soleil à Paris — Carte temps réel ☀️',
  description:
    'Les meilleurs restaurants avec terrasse ensoleillée à Paris. Déjeuner ou dîner au soleil : score d’ensoleillement temps réel, météo live, sélection de restos, bistrots et brasseries dans tous les arrondissements.',
  alternates: { canonical: CANONICAL },
  openGraph: { title: 'Restaurants terrasse soleil Paris — HopSoleil', description: 'Trouve le meilleur restaurant avec terrasse au soleil à Paris en direct.', url: CANONICAL, siteName: 'HopSoleil', locale: 'fr_FR', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Restaurants terrasse soleil Paris ☀️', description: 'Le radar des restos au soleil à Paris.' },
}

export default function Page() {
  return (
    <SeoLanding
      canonicalPath={PATH}
      h1="Restaurants avec terrasse au soleil à Paris"
      intro="Déjeuner au soleil ou dîner en terrasse ensoleillée à Paris ? HopSoleil détecte en temps réel les restaurants, bistrots et brasseries dont la terrasse profite du soleil maintenant. Score soleil mis à jour toutes les 30 minutes, ombres des bâtiments calculées en 3D."
      placeType="restaurant"
      relatedLinks={[
        { href: '/terrasses-ensoleillees-paris', label: 'Toutes les terrasses ensoleillées de Paris' },
        { href: '/bar-terrasse-paris', label: '🍻 Bars terrasse soleil' },
        { href: '/cafe-terrasse-paris', label: '☕ Cafés terrasse soleil' },
        { href: '/rooftop-paris', label: '🏙 Rooftops Paris' },
        { href: '/terrasses-ensoleillees-paris/7e-arrondissement', label: 'Restos Tour Eiffel' },
        { href: '/terrasses-ensoleillees-paris/8e-arrondissement', label: 'Restos Champs-Élysées' },
        { href: '/terrasses-ensoleillees-paris/5e-arrondissement', label: 'Restos Quartier latin' },
      ]}
      faq={[
        {
          question: 'Où déjeuner au soleil à Paris ?',
          answer: "HopSoleil affiche en temps réel les restaurants dont la terrasse est ensoleillée au moment où vous regardez la carte. Filtrez par type 'restaurant' et regardez les pins jaunes.",
        },
        {
          question: 'Comment réserver une table en terrasse au soleil ?',
          answer: "Chaque fiche restaurant HopSoleil renvoie vers la fiche Google Maps du lieu, qui propose souvent une réservation directe ou les coordonnées du resto.",
        },
        {
          question: 'Quels arrondissements sont les plus ensoleillés pour dîner ?',
          answer: "Cela dépend de l'heure : en fin d'après-midi, les terrasses orientées ouest (rive droite côté Tuileries, Champs-Élysées, Saint-Germain) sont privilégiées. HopSoleil le calcule pour vous en temps réel.",
        },
      ]}
    />
  )
}

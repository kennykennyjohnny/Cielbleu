import type { Metadata } from 'next'
import SeoLanding from '@/components/Seo/SeoLanding'

export const revalidate = 3600

const PATH = '/bar-terrasse-paris'
const CANONICAL = `https://hopsoleil.fr${PATH}`

export const metadata: Metadata = {
  title: 'Bars avec terrasse au soleil à Paris — Carte temps réel ☀️',
  description:
    'Les meilleurs bars avec terrasse ensoleillée à Paris en temps réel. Score soleil heure par heure, météo live, sélection des bars, bistrots et brasseries au soleil dans tous les arrondissements.',
  alternates: { canonical: CANONICAL },
  openGraph: { title: 'Bars terrasse soleil à Paris — HopSoleil', description: 'Trouve le meilleur bar avec terrasse au soleil à Paris en direct.', url: CANONICAL, siteName: 'HopSoleil', locale: 'fr_FR', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Bars terrasse soleil Paris ☀️', description: 'Le radar des bars au soleil à Paris.' },
}

export default function Page() {
  return (
    <SeoLanding
      canonicalPath={PATH}
      h1="Bars avec terrasse au soleil à Paris"
      intro="Apéro au soleil ? HopSoleil détecte en temps réel les bars, bistrots et brasseries de Paris dont la terrasse est ensoleillée maintenant. Le score soleil est calculé à partir de la position du soleil, des ombres des bâtiments OpenStreetMap et de la météo Paris en direct."
      placeType="bar"
      relatedLinks={[
        { href: '/terrasses-ensoleillees-paris', label: 'Toutes les terrasses ensoleillées de Paris' },
        { href: '/cafe-terrasse-paris', label: '☕ Cafés terrasse soleil' },
        { href: '/restaurant-terrasse-paris', label: '🍽 Restaurants terrasse soleil' },
        { href: '/rooftop-paris', label: '🏙 Rooftops Paris' },
        { href: '/terrasses-ensoleillees-paris/11e-arrondissement', label: 'Terrasses 11e' },
        { href: '/terrasses-ensoleillees-paris/4e-arrondissement', label: 'Terrasses Marais' },
        { href: '/terrasses-ensoleillees-paris/10e-arrondissement', label: 'Canal Saint-Martin' },
      ]}
      faq={[
        {
          question: 'Quel est le meilleur bar avec terrasse au soleil à Paris ?',
          answer: "Cela dépend de l'heure et du quartier ! HopSoleil affiche en direct les bars dont la terrasse est ensoleillée à l'instant, et permet d'anticiper le soleil grâce au curseur d'heure.",
        },
        {
          question: 'Comment être sûr qu’une terrasse sera au soleil ce soir ?',
          answer: "Utilisez le curseur d'heure sur la carte HopSoleil pour voir où sera le soleil dans 1h, 2h, jusqu'à la fin de la journée. Le calcul intègre les ombres réelles des bâtiments.",
        },
        {
          question: 'Y a-t-il des bars avec rooftop à Paris ?',
          answer: 'Oui — consultez notre page dédiée aux rooftops à Paris.',
        },
      ]}
    />
  )
}

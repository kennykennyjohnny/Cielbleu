import type { Metadata } from 'next'
import SeoLanding from '@/components/Seo/SeoLanding'

export const revalidate = 3600

const PATH = '/rooftop-paris'
const CANONICAL = `https://hopsoleil.fr${PATH}`

export const metadata: Metadata = {
  title: 'Rooftops à Paris au soleil — Carte temps réel ☀️',
  description:
    "Les meilleurs rooftops parisiens en temps réel. Bars en hauteur, toits-terrasses au soleil : score d'ensoleillement live, météo Paris, sélection rive gauche et rive droite.",
  alternates: { canonical: CANONICAL },
  openGraph: { title: 'Rooftops Paris au soleil — HopSoleil', description: 'Trouve le meilleur rooftop à Paris au soleil en temps réel.', url: CANONICAL, siteName: 'HopSoleil', locale: 'fr_FR', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'Rooftops Paris ☀️', description: 'Le radar des rooftops au soleil à Paris.' },
}

// Matche "rooftop", "Roof Top", "roof-top", "ROOFTOP" dans le nom du lieu.
const ROOFTOP_RE = /rooftop|roof[- ]?top/

export default function Page() {
  return (
    <SeoLanding
      canonicalPath={PATH}
      h1="Rooftops à Paris — bars et terrasses en hauteur au soleil"
      intro="Apéro en hauteur ? HopSoleil détecte en temps réel les rooftops parisiens dont la terrasse profite du soleil maintenant. Les rooftops sont identifiés par leur nom et géolocalisés sur la carte avec leur score d’ensoleillement."
      nameMatch={ROOFTOP_RE}
      relatedLinks={[
        { href: '/terrasses-ensoleillees-paris', label: 'Toutes les terrasses ensoleillées de Paris' },
        { href: '/bar-terrasse-paris', label: '🍻 Bars terrasse soleil' },
        { href: '/restaurant-terrasse-paris', label: '🍽 Restaurants terrasse soleil' },
        { href: '/cafe-terrasse-paris', label: '☕ Cafés terrasse soleil' },
        { href: '/terrasses-ensoleillees-paris/4e-arrondissement', label: 'Rooftops Marais' },
        { href: '/terrasses-ensoleillees-paris/8e-arrondissement', label: 'Rooftops Champs-Élysées' },
      ]}
      faq={[
        {
          question: 'Quel est le meilleur rooftop de Paris ?',
          answer: "Cela dépend de l'heure et du type d'ambiance ! HopSoleil liste les rooftops dont la terrasse est actuellement au soleil — bars d'hôtels, brasseries en hauteur, toits-terrasses…",
        },
        {
          question: 'Comment savoir si un rooftop est ouvert ?',
          answer: "La fiche de chaque rooftop sur HopSoleil affiche les horaires Google et indique si le lieu est actuellement ouvert.",
        },
        {
          question: 'Quel rooftop pour le coucher de soleil ?',
          answer: "Utilisez le curseur d'heure sur la carte HopSoleil pour positionner sur l'heure du coucher de soleil — les rooftops orientés ouest restent au soleil le plus longtemps.",
        },
      ]}
    />
  )
}

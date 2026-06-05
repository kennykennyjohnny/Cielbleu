import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import SeoLanding from '@/components/Seo/SeoLanding'

// Une page SEO par arrondissement : /terrasses-ensoleillees-paris/11e-arrondissement
// Génère statiquement les 20 (1er..20e), ISR 1 h.
export const revalidate = 3600
export const dynamicParams = false

export function generateStaticParams() {
  return Array.from({ length: 20 }, (_, i) => ({
    arr: `${i + 1}${i === 0 ? 'er' : 'e'}-arrondissement`,
  }))
}

// Parse "11e-arrondissement" / "1er-arrondissement" → 11 / 1.
// On accepte tolérant aux variantes pour ne pas perdre de trafic SEO,
// mais on ne génère QUE les formes canoniques ci-dessus.
function parseArr(slug: string): number | null {
  const m = slug.match(/^(\d{1,2})(?:er|e|ème|ere)?(?:-arrondissement)?$/i)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return n >= 1 && n <= 20 ? n : null
}

// Quartiers connus par arrondissement (descriptions plus riches → SEO)
const NEIGHBORHOODS: Record<number, string> = {
  1: 'Châtelet, Louvre, Palais-Royal, Les Halles',
  2: 'Sentier, Bourse, Vivienne, Montorgueil',
  3: 'Haut Marais, Temple, Arts-et-Métiers',
  4: 'Marais, Saint-Paul, Île Saint-Louis, Hôtel de Ville',
  5: 'Quartier Latin, Mouffetard, Jardin des Plantes',
  6: 'Saint-Germain-des-Prés, Odéon, Luxembourg',
  7: 'Invalides, Tour Eiffel, Gros-Caillou',
  8: 'Champs-Élysées, Madeleine, Saint-Lazare',
  9: 'Opéra, Pigalle, SoPi, Grands Boulevards',
  10: 'Canal Saint-Martin, République, Gare du Nord',
  11: 'Bastille, Oberkampf, Charonne, Voltaire',
  12: 'Bercy, Nation, Daumesnil, Aligre',
  13: 'Gobelins, Butte-aux-Cailles, Bibliothèque',
  14: 'Denfert-Rochereau, Montparnasse, Plaisance',
  15: 'Grenelle, Convention, Vaugirard',
  16: 'Trocadéro, Passy, Auteuil, Chaillot',
  17: 'Batignolles, Ternes, Monceau',
  18: 'Montmartre, Pigalle, Sacré-Cœur, Abbesses',
  19: 'Buttes-Chaumont, Belleville, La Villette',
  20: 'Ménilmontant, Père-Lachaise, Belleville',
}

const ord = (n: number) => (n === 1 ? 'er' : 'e')
const canonSlug = (n: number) => `${n}${ord(n)}-arrondissement`

interface PageProps { params: Promise<{ arr: string }> }

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { arr } = await params
  const n = parseArr(arr)
  if (!n) return {}
  const title = `Terrasses au soleil dans le ${n}${ord(n)} arrondissement de Paris ☀️`
  const description = `Les meilleures terrasses ensoleillées du ${n}${ord(n)} (${NEIGHBORHOODS[n]}). Score soleil temps réel, météo Paris live, sélection de bars, cafés et restaurants au soleil.`
  const canonical = `https://hopsoleil.fr/terrasses-ensoleillees-paris/${canonSlug(n)}`
  return {
    title, description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, siteName: 'HopSoleil', locale: 'fr_FR', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function Page({ params }: PageProps) {
  const { arr } = await params
  const n = parseArr(arr)
  if (!n) notFound()

  // Liens internes : arrondissements voisins (n-1, n+1) + types.
  const neighbors: number[] = []
  if (n > 1) neighbors.push(n - 1)
  if (n < 20) neighbors.push(n + 1)

  return (
    <SeoLanding
      canonicalPath={`/terrasses-ensoleillees-paris/${canonSlug(n)}`}
      h1={`Terrasses au soleil dans le ${n}${ord(n)} arrondissement de Paris`}
      intro={`Découvre les terrasses ensoleillées du ${n}${ord(n)} arrondissement de Paris — ${NEIGHBORHOODS[n]}. HopSoleil calcule en direct l’ensoleillement de chaque bar, café et restaurant à partir de la position du soleil, des ombres des bâtiments et de la météo Paris en temps réel.`}
      placeType={null}
      arrondissement={n}
      relatedLinks={[
        ...neighbors.map((nb) => ({
          href: `/terrasses-ensoleillees-paris/${canonSlug(nb)}`,
          label: `Terrasses ${nb}${ord(nb)} arrondissement`,
        })),
        { href: '/terrasses-ensoleillees-paris', label: 'Toutes les terrasses ensoleillées de Paris' },
        { href: '/bar-terrasse-paris', label: '🍻 Bars terrasse soleil' },
        { href: '/cafe-terrasse-paris', label: '☕ Cafés terrasse soleil' },
        { href: '/restaurant-terrasse-paris', label: '🍽 Restaurants terrasse soleil' },
        { href: '/rooftop-paris', label: '🏙 Rooftops Paris' },
      ]}
      faq={[
        {
          question: `Où trouver une terrasse au soleil dans le ${n}${ord(n)} arrondissement ?`,
          answer: `Les meilleurs spots ensoleillés du ${n}${ord(n)} sont listés en temps réel sur HopSoleil. La carte affiche l’ombre projetée par chaque bâtiment pour anticiper le soleil à n’importe quelle heure de la journée.`,
        },
        {
          question: `Quels quartiers couvre le ${n}${ord(n)} ?`,
          answer: NEIGHBORHOODS[n],
        },
        {
          question: 'À quelle fréquence le score soleil est-il mis à jour ?',
          answer: 'Toutes les 30 minutes. Le score combine altitude solaire, ombres des bâtiments et couverture nuageuse Paris en temps réel.',
        },
      ]}
    />
  )
}

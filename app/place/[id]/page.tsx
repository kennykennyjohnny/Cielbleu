import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

// Les liens partagés (/place/[id]) ouvrent désormais la vraie interface (le home)
// avec la terrasse pré-sélectionnée, au lieu d'une page séparée à part.
export default async function PlacePage({ params }: PageProps) {
  const { id } = await params
  redirect(`/?place=${encodeURIComponent(id)}`)
}

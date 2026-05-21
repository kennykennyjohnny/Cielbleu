import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import PlacePageShell from '@/components/Map/PlacePageShell'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PlacePage({ params }: PageProps) {
  const { id } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const now = new Date()
  const month = now.getMonth() + 1
  const h = now.getHours()
  const m = now.getMinutes() < 30 ? '00' : '30'
  const timeSlot = `${String(h).padStart(2, '0')}:${m}`

  const [{ data: place }, { data: scores }] = await Promise.all([
    supabase.from('places').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('sun_scores')
      .select('time_slot, score')
      .eq('place_id', id)
      .eq('month', month)
      .order('time_slot'),
  ])

  if (!place) notFound()

  const currentScore = scores?.find((s) => s.time_slot === timeSlot)?.score ?? 3

  return (
    <PlacePageShell
      place={{ ...place, currentScore }}
      scores={scores ?? []}
    />
  )
}
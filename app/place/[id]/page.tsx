import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Star, Navigation, Phone, Globe } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  bar: 'Bar',
  restaurant: 'Restaurant',
  cafe: 'Café',
  park: 'Parc',
}

const SCORE_LABEL: Record<number, string> = {
  0: 'Tombée de la nuit',
  1: 'À l’ombre',
  2: 'Surtout à l’ombre',
  3: 'Mi-soleil mi-ombre',
  4: 'Bien ensoleillé',
  5: 'Plein soleil',
}

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

  const { data: place } = await supabase
    .from('places')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!place) notFound()

  const { data: scores } = await supabase
    .from('sun_scores')
    .select('time_slot, score')
    .eq('place_id', id)
    .eq('month', month)
    .order('time_slot')

  const currentScore =
    scores?.find((s) => s.time_slot === timeSlot)?.score ?? 3

  const photo = place.photos?.[0]
  const isSunny = currentScore >= 4

  return (
    <main className="min-h-dvh bg-creme">
      {/* Hero */}
      <div className="relative h-72 overflow-hidden">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={place.name} className="w-full h-full object-cover" />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: isSunny
                ? 'linear-gradient(180deg, #FFE48A 0%, #FFD976 50%, #FFE9C8 100%)'
                : 'linear-gradient(180deg, #C8DDFF 0%, #E2EBFA 100%)',
            }}
          >
            <div
              className="absolute top-12 right-10 w-20 h-20 rounded-full"
              style={{
                background: isSunny
                  ? 'radial-gradient(circle, #FFBE0B 0%, #FF9500 80%)'
                  : 'radial-gradient(circle, #FFFDF7 0%, #E2E5EB 90%)',
                boxShadow: isSunny
                  ? '0 0 60px rgba(255,190,11,0.6), 0 0 120px rgba(255,149,0,0.3)'
                  : '0 0 28px rgba(255,253,247,0.5)',
              }}
            />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-b from-nuit/30 via-transparent to-creme" />

        <Link
          href="/"
          aria-label="Retour"
          className="absolute top-5 left-5 rounded-full bg-white/90 backdrop-blur w-10 h-10 flex items-center justify-center shadow-md text-nuit active:scale-90 transition-transform"
        >
          <ArrowLeft size={18} strokeWidth={2.4} />
        </Link>
      </div>

      {/* Contenu */}
      <div className="px-5 -mt-10 relative z-10 max-w-2xl mx-auto pb-10">
        <div className="rounded-3xl bg-white shadow-[0_8px_32px_rgba(27,40,56,0.12)] p-6">
          <span className="inline-block rounded-full bg-creme px-3 py-1 text-[11px] font-outfit font-semibold text-nuit uppercase tracking-wider border border-nuit/8">
            {TYPE_LABEL[place.type] ?? place.type}
          </span>
          <h1 className="font-playfair text-3xl font-bold text-nuit leading-tight mt-3">
            {place.name}
          </h1>
          <p className="text-sm text-gris font-outfit mt-1">{place.address}</p>

          <div className="flex items-center gap-3 mt-3 text-sm font-outfit text-nuit">
            {place.google_rating != null && (
              <span className="flex items-center gap-1 font-medium">
                <Star size={14} fill="#FFBE0B" stroke="#FFBE0B" />
                {place.google_rating.toFixed(1)}
              </span>
            )}
            {place.price_level != null && place.price_level > 0 && (
              <span className="text-gris">
                {'€'.repeat(place.price_level)}
                <span className="text-nuit/15">{'€'.repeat(4 - place.price_level)}</span>
              </span>
            )}
            {place.arrondissement != null && (
              <span className="text-gris">
                · {place.arrondissement}
                <sup>{place.arrondissement === 1 ? 'er' : 'e'}</sup> arr.
              </span>
            )}
          </div>
        </div>

        {/* Score actuel */}
        <section className="mt-5 rounded-3xl bg-white shadow-sm p-6">
          <h2 className="font-playfair text-xl font-bold text-nuit mb-4">Maintenant</h2>
          <div
            className={`rounded-2xl p-5 ${
              isSunny ? 'bg-soleil/20' : currentScore === 0 ? 'bg-nuit text-creme' : 'bg-gris/15'
            }`}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-playfair text-5xl font-bold leading-none">
                {currentScore}
              </span>
              <span className="text-base font-outfit opacity-60">/ 5</span>
            </div>
            <p className="font-outfit font-semibold mt-2">
              {SCORE_LABEL[currentScore]}
            </p>
          </div>

          {/* Timeline 8h-22h (placeholder simple basé sur scores du mois) */}
          {scores && scores.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] uppercase tracking-widest font-outfit font-semibold text-gris mb-2">
                Aujourd’hui
              </p>
              <Timeline scores={scores} currentSlot={timeSlot} />
            </div>
          )}
        </section>

        {/* Vue 3D — placeholder teaser */}
        <section className="mt-5 rounded-3xl bg-gradient-to-br from-creme to-soleil/15 border border-soleil/30 p-6 text-center">
          <span className="text-3xl">🌇</span>
          <p className="font-playfair text-lg font-bold text-nuit mt-2">
            Vue 3D de la terrasse
          </p>
          <p className="text-sm text-gris font-outfit mt-1">
            Bientôt disponible — visualise la course du soleil et les ombres en direct.
          </p>
        </section>

        {/* Infos */}
        <section className="mt-5 rounded-3xl bg-white shadow-sm p-6 space-y-3">
          {place.google_maps_url && (
            <a
              href={place.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm font-outfit text-nuit hover:text-ciel transition"
            >
              <Navigation size={16} strokeWidth={2.2} className="text-ciel" />
              Itinéraire Google Maps
            </a>
          )}
          {place.instagram_url && (
            <a
              href={place.instagram_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 text-sm font-outfit text-nuit hover:text-ciel transition"
            >
              <Globe size={16} strokeWidth={2.2} className="text-ciel" />
              Instagram
            </a>
          )}
          {!place.google_maps_url && !place.instagram_url && (
            <p className="text-sm text-gris font-outfit italic">
              Plus d’infos arrivent avec l’import Google Places.
            </p>
          )}
        </section>

        {/* CTA */}
        {place.google_maps_url && (
          <a
            href={place.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center justify-center gap-2 rounded-2xl bg-nuit py-4 text-sm font-outfit font-semibold text-creme shadow-lg active:scale-[0.97] transition-transform"
          >
            <Navigation size={16} strokeWidth={2.4} />
            Y aller maintenant
          </a>
        )}
      </div>
    </main>
  )
}

function Timeline({
  scores,
  currentSlot,
}: {
  scores: { time_slot: string; score: number }[]
  currentSlot: string
}) {
  // Garder créneaux 8h → 22h (créneau full hour)
  const filtered = scores.filter((s) => {
    const [hh, mm] = s.time_slot.split(':')
    const h = parseInt(hh)
    return h >= 8 && h <= 22 && mm === '00'
  })

  if (filtered.length === 0) return null

  return (
    <div className="flex gap-1 items-end">
      {filtered.map((s) => {
        const isNow = s.time_slot === currentSlot
        const h = parseInt(s.time_slot.split(':')[0])
        const colors: Record<number, string> = {
          0: 'bg-nuit',
          1: 'bg-gris/50',
          2: 'bg-gris/70',
          3: 'bg-soleil/50',
          4: 'bg-soleil/80',
          5: 'bg-soleil',
        }
        const heights = [10, 14, 22, 32, 42, 54]
        return (
          <div key={s.time_slot} className="flex-1 flex flex-col items-center gap-1">
            <div
              className={`w-full rounded-t-sm ${colors[s.score] ?? 'bg-gris/40'} ${
                isNow ? 'ring-2 ring-ciel ring-offset-1' : ''
              }`}
              style={{ height: `${heights[s.score] ?? 22}px` }}
            />
            {h % 3 === 0 && (
              <span
                className={`text-[9px] font-outfit ${
                  isNow ? 'text-ciel font-bold' : 'text-gris'
                }`}
              >
                {h}h
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

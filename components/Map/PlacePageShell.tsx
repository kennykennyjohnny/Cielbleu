'use client'

import { useCallback, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatHourLabelPad } from '@/lib/hourSlot'
import PlacePageClient from './PlacePageClient'
import type { Place } from '@/types'

const MapView = dynamic(() => import('./MapView'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'var(--color-paper)' }}>
      <span aria-hidden="true" className="text-3xl animate-spin"
        style={{ animationDuration: '2.4s' }}>☀</span>
    </div>
  ),
})

// Même fiche que sur le home (DA moderne, drag fluide) — affichée sur mobile.
const PlacePreview = dynamic(() => import('./PlacePreview'), { ssr: false })

interface Props {
  place: Place
  scores: { time_slot: string; score: number }[]
}

function nowQuarter(): number {
  const now = new Date()
  const q = Math.round((now.getHours() + now.getMinutes() / 60) * 4) / 4
  return Math.max(6, Math.min(23.75, q))
}

export default function PlacePageShell({ place, scores }: Props) {
  const router            = useRouter()
  const [hour, setHour]   = useState<number>(nowQuarter)
  const [isDesktop, setIsDesktop] = useState(false)
  const [allPlaces, setAllPlaces] = useState<Place[]>([place])
  const [searchQuery, setSearchQuery] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  // Auth — pour que favoris / avis / photos fonctionnent aussi sur la page partagée
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_e, session) => setUserId(session?.user?.id ?? null)
    )
    return () => subscription.unsubscribe()
  }, [])

  // Layout : side panel (desktop ≥ 900px) vs bottom sheet (mobile)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Fetch TOUTES les places — la carte reste la même qu'en page d'accueil
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const now = new Date()
      const month = now.getMonth() + 1
      const h = now.getHours()
      const m = now.getMinutes() < 30 ? '00' : '30'
      const timeSlot = `${String(h).padStart(2,'0')}:${m}`
      const { data: rawPlaces } = await supabase.from('places').select('*')
        .not('lat', 'is', null).not('lng', 'is', null).limit(10000)
      if (cancelled || !rawPlaces) return
      const { data: nowScores } = await supabase.from('sun_scores').select('place_id, score')
        .eq('month', month).eq('time_slot', timeSlot)
      const scoreByPlace = new Map<string, number>()
      for (const r of nowScores ?? []) scoreByPlace.set(r.place_id, r.score)
      if (cancelled) return
      const enriched: Place[] = rawPlaces.map((p) => ({
        ...p, currentScore: scoreByPlace.get(p.id) ?? 3,
      }))
      setAllPlaces(enriched)
    })()
    return () => { cancelled = true }
  }, [])

  // Filtre search → sous-ensemble visible sur la carte
  const visiblePlaces = (() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allPlaces
    return allPlaces.filter(p =>
      p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
    )
  })()

  const handlePlaceSelect = useCallback((p: Place | null) => {
    if (p && p.id !== place.id) router.push(`/place/${p.id}`)
  }, [router, place.id])

  return (
    <main className="relative h-dvh w-full overflow-hidden">
      {/* ─── Carte = MÊME carte qu'en home, tous les lieux visibles ─── */}
      <div className="absolute inset-0">
        <MapView
          places={visiblePlaces}
          onPlaceSelect={handlePlaceSelect}
          highlightPlaceId={place.id}
          cinematicFocus={{ lng: place.lng, lat: place.lat }}
          sunHour={hour}
        />
      </div>

      {/* ─── Logo + retour (top-left) ─── */}
      <header className="absolute top-0 left-0 z-20 pointer-events-none"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)', paddingLeft: 12 }}>
        <Link href="/" className="pointer-events-auto inline-flex items-center pl-2 pr-3 py-1.5 rounded-full no-underline"
          aria-label="Retour à la carte"
          style={{
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(20,32,51,0.10)',
            boxShadow: '0 6px 22px rgba(11,31,58,0.10)',
            backdropFilter: 'blur(16px)',
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-hopsoleil.png" alt="HopSoleil"
            style={{ height: 30, width: 'auto', display: 'block', mixBlendMode: 'multiply' }} />
        </Link>
      </header>

      {/* ─── Slider mobile — bulle flottante ─── */}
      {!isDesktop && (
        <div className="absolute inset-x-0 z-[19] pointer-events-none"
          style={{ top: 'calc(max(env(safe-area-inset-top, 0px), 12px) + 58px)', padding: '0 12px' }}>
          <div className="pointer-events-auto" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,252,243,0.98)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1.5px solid rgba(237,193,69,0.42)',
            borderRadius: 999,
            padding: '7px 14px',
            boxShadow: '0 6px 22px rgba(31,58,95,0.13), 0 2px 8px rgba(237,193,69,0.15)',
          }}>
            <span style={{ fontFamily: 'var(--font-outfit)', fontSize: 10, fontWeight: 800,
              color: 'rgba(31,58,95,0.35)', whiteSpace: 'nowrap', flexShrink: 0 }}>☀ 6h</span>
            <input
              type="range" min={6} max={23.75} step={0.25}
              value={hour}
              onChange={(e) => setHour(parseFloat(e.target.value))}
              className="cb-hour-slider"
              style={{ flex: 1, minWidth: 0 }}
              aria-label="Heure du soleil"
            />
            <span style={{ fontFamily: 'var(--font-outfit)', fontSize: 10, fontWeight: 800,
              color: 'rgba(31,58,95,0.35)', whiteSpace: 'nowrap', flexShrink: 0 }}>🌙 23h</span>
            <span style={{ width: 1, height: 14, background: 'rgba(31,58,95,0.12)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-outfit)', fontSize: 13, fontWeight: 900,
              color: '#1F3A5F', lineHeight: 1, minWidth: 42, textAlign: 'right', flexShrink: 0 }}>
              {formatHourLabelPad(hour)}
            </span>
          </div>
        </div>
      )}

      {/* ─── Search bar : top-center, TOUJOURS visible ─── */}
      <div className="absolute z-20 pointer-events-auto"
        style={{
          top: 'max(env(safe-area-inset-top, 0px), 14px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(420px, calc(100% - 168px))',
        }}>
        <div className="flex items-center gap-2 px-2 rounded-2xl"
          style={{
            background: 'rgba(255,255,255,0.94)',
            border: '1px solid rgba(20,32,51,0.10)',
            boxShadow: '0 6px 22px rgba(11,31,58,0.10)',
            backdropFilter: 'blur(16px)',
            minHeight: 42,
          }}>
          <span className="w-8 h-8 grid place-items-center rounded-xl shrink-0"
            style={{ background: 'var(--color-sky-100)', color: 'var(--color-sky-700)' }}
            aria-hidden="true">
            <Search size={14} strokeWidth={2.4} />
          </span>
          <input type="text" value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Bar, terrasse, café, 11e…"
            aria-label="Chercher un lieu"
            className="flex-1 bg-transparent outline-none font-outfit font-semibold text-[13px] text-text-primary placeholder:text-text-soft/85 pr-2"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} aria-label="Effacer"
              className="p-1.5 rounded-full text-text-soft hover:bg-surface-2 shrink-0">
              <X size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      {/* ─── DESKTOP : panel droit, largeur 420px ─── */}
      {isDesktop && (
        <aside
          className="absolute top-0 right-0 z-30 h-dvh"
          style={{
            width: 420,
            display: 'flex', flexDirection: 'column',
            background: 'rgba(255,252,243,0.97)',
            backdropFilter: 'blur(22px)',
            borderLeft: '1px solid rgba(20,32,51,0.10)',
            boxShadow: '-18px 0 48px rgba(11,31,58,0.18)',
          }}
          role="complementary" aria-label={`Détails de ${place.name}`}
        >
          <PlacePageClient place={place} scores={scores}
            hour={hour} onHourChange={setHour}
            userId={userId}
            onClose={() => router.push('/')}
            onOpenProfile={() => router.push('/')} />
        </aside>
      )}

      {/* ─── MOBILE : même fiche que le home (PlacePreview, drag fluide) ─── */}
      {!isDesktop && (
        <PlacePreview
          place={place}
          hour={hour}
          onClose={() => router.push('/')}
          userId={userId}
          onOpenProfile={() => router.push('/')}
        />
      )}
    </main>
  )
}

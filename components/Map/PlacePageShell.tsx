'use client'

import { useCallback, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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

interface Props {
  place: Place
  scores: { time_slot: string; score: number }[]
}

type SheetMode = 'peek' | 'half' | 'full'
const SHEET_HEIGHTS: Record<SheetMode, string> = {
  peek: '20vh', half: '58vh', full: '92dvh',
}

function nowHalfHour(): number {
  const now = new Date()
  return Math.max(6, Math.min(23.5, now.getHours() + (now.getMinutes() >= 30 ? 0.5 : 0)))
}

export default function PlacePageShell({ place, scores }: Props) {
  const router            = useRouter()
  const [mode, setMode]   = useState<SheetMode>('half')
  const [hour, setHour]   = useState<number>(nowHalfHour)
  const [isDesktop, setIsDesktop] = useState(false)
  const [allPlaces, setAllPlaces] = useState<Place[]>([place])
  const [searchQuery, setSearchQuery] = useState('')
  const dragRef = useRef<{ y: number; mode: SheetMode } | null>(null)

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

  // Drag handle (mobile uniquement)
  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { y: e.clientY, mode }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dy = e.clientY - dragRef.current.y
    if (dy > 40)       setMode(dragRef.current.mode === 'full' ? 'half' : 'peek')
    else if (dy < -40) setMode(dragRef.current.mode === 'peek' ? 'half' : 'full')
  }
  const onPointerUp = () => { dragRef.current = null }

  useEffect(() => { setMode('half') }, [place.id])

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
              type="range" min={6} max={23.5} step={0.5}
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
              color: '#1F3A5F', lineHeight: 1, minWidth: 32, textAlign: 'right', flexShrink: 0 }}>
              {String(Math.floor(hour)).padStart(2,'0')}h{hour % 1 ? '30' : '00'}
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
          className="absolute top-0 right-0 z-30 h-dvh overflow-y-auto"
          style={{
            width: 420,
            background: 'rgba(255,252,243,0.97)',
            backdropFilter: 'blur(22px)',
            borderLeft: '1px solid rgba(20,32,51,0.10)',
            boxShadow: '-18px 0 48px rgba(11,31,58,0.18)',
          }}
          role="complementary" aria-label={`Détails de ${place.name}`}
        >
          <PlacePageClient place={place} scores={scores}
            hour={hour} onHourChange={setHour} />
        </aside>
      )}

      {/* ─── MOBILE : bottom sheet draggable ─── */}
      {!isDesktop && (
        <section
          className="absolute bottom-0 inset-x-0 z-30"
          style={{
            height: SHEET_HEIGHTS[mode],
            transition: 'height 280ms cubic-bezier(0.2,0.8,0.2,1)',
            background: 'rgba(255,252,243,0.97)',
            backdropFilter: 'blur(22px)',
            borderTopLeftRadius: 22, borderTopRightRadius: 22,
            borderTop: '1px solid rgba(20,32,51,0.10)',
            boxShadow: '0 -16px 42px rgba(11,31,58,0.20)',
            overflow: 'hidden',
          }}
          role="dialog" aria-label={`Détails de ${place.name}`}
        >
          <div
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            role="separator" aria-label="Redimensionner la fiche (glisser haut/bas)"
            className="flex items-center justify-center cursor-grab active:cursor-grabbing"
            style={{ height: 22, touchAction: 'none' }}
          >
            <span aria-hidden="true"
              style={{ width: 44, height: 5, borderRadius: 999, background: 'rgba(20,32,51,0.18)' }} />
          </div>
          <div className="overflow-y-auto" style={{ height: 'calc(100% - 22px)' }}>
            <PlacePageClient place={place} scores={scores}
              hour={hour} onHourChange={setHour} />
          </div>
        </section>
      )}
    </main>
  )
}

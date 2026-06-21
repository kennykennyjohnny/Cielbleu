'use client'

/**
 * MobileSheet — feuille glissable à paliers (bottom sheet) réutilisable, calquée
 * sur la mécanique de PlacePreview :
 *   • un `peek` toujours visible en haut (zone de drag : poignée + en-tête)
 *   • un contenu scrollable en dessous
 *   • 3 paliers (aperçu / milieu / plein), snap au plus proche avec momentum
 *   • swipe vers le bas depuis l'aperçu → fermeture
 * Le palier « aperçu » est calé sur la hauteur RÉELLE du peek (mesurée) → l'en-tête
 * et ses boutons sont toujours visibles, exactement comme la card resto.
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'

interface Props {
  onClose: () => void
  /** Bande ÉPINGLÉE tout en haut de la feuille (au-dessus du peek), ex. recos. */
  topBar?: ReactNode
  peek: ReactNode
  children: ReactNode
  ariaLabel?: string
}

export default function MobileSheet({ onClose, topBar, peek, children, ariaLabel }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const drag = useRef({ startY: 0, currentY: 0, dragging: false, t0: 0 })

  // Hauteur du panneau (92 dvh) en px, et paliers « hauteur visible depuis le bas ».
  const [sheetH, setSheetH] = useState(() => (typeof window !== 'undefined' ? window.innerHeight * 0.92 : 800))
  const [peekH, setPeekH] = useState(260)
  const levels = (() => {
    const lo = Math.min(peekH + 8, sheetH)
    const hi = sheetH
    const mid = Math.min(Math.max(lo + 280, sheetH * 0.62), hi)
    return [lo, mid, hi]
  })()
  // Ouverture au palier « aperçu » (le plus bas) → la feuille prend peu de place,
  // la carte reste bien visible. L'utilisateur glisse vers le haut pour les détails.
  const DEFAULT = 0

  const [transformY, setTransformY] = useState('translateY(100%)')
  const levelRef = useRef(DEFAULT)
  const tyFor = useCallback((i: number) => `translateY(${Math.round(sheetH - levels[i])}px)`, [sheetH, peekH]) // eslint-disable-line

  // Mesure du panneau + du peek (réactif au resize / au contenu).
  useEffect(() => {
    const update = () => setSheetH(window.innerHeight * 0.92)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  useEffect(() => {
    if (!topRef.current) return
    const ro = new ResizeObserver(() => {
      if (topRef.current) setPeekH(topRef.current.offsetHeight)
    })
    ro.observe(topRef.current)
    setPeekH(topRef.current.offsetHeight)
    return () => ro.disconnect()
  }, [])

  // Animation d'entrée vers le palier par défaut. Se met à jour tant que
  // l'utilisateur n'a pas glissé (pour suivre la hauteur de peek mesurée) ; une
  // fois qu'il a interagi, on ne réinitialise plus le palier.
  const interactedRef = useRef(false)
  useEffect(() => {
    if (interactedRef.current) return
    const id = requestAnimationFrame(() => setTransformY(tyFor(DEFAULT)))
    return () => cancelAnimationFrame(id)
  }, [tyFor])

  const snapTo = useCallback((i: number) => {
    levelRef.current = i
    if (sheetRef.current) sheetRef.current.style.transition = 'transform 360ms cubic-bezier(0.32,0.72,0,1)'
    setTransformY(tyFor(i))
  }, [tyFor])

  const close = useCallback(() => {
    const el = sheetRef.current
    if (el) { el.style.transition = 'transform 300ms cubic-bezier(0.32,0.72,0,1)'; el.style.transform = 'translateY(100%)' }
    setTimeout(onClose, 300)
  }, [onClose])

  const onTouchStart = (e: React.TouchEvent) => {
    drag.current = { startY: e.touches[0].clientY, currentY: 0, dragging: false, t0: Date.now() }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!sheetRef.current) return
    const dy = e.touches[0].clientY - drag.current.startY
    if (!drag.current.dragging && Math.abs(dy) < 6) return
    drag.current.dragging = true
    interactedRef.current = true
    drag.current.currentY = dy
    sheetRef.current.style.transition = 'none'
    const base = sheetH - levels[levelRef.current]
    sheetRef.current.style.transform = `translateY(${Math.max(0, base + dy)}px)`
  }
  const onTouchEnd = () => {
    if (!drag.current.dragging) return
    drag.current.dragging = false
    const dy = drag.current.currentY
    const elapsed = Math.max(16, Date.now() - drag.current.t0)
    const v = dy / elapsed // px/ms (+ = vers le bas)
    const cur = levelRef.current
    if (cur === 0 && (v > 0.5 || dy > 110)) { close(); return }
    const visibleNow = levels[cur] - dy
    const projected = visibleNow - v * 200
    let best = cur, dmin = Infinity
    levels.forEach((lv, i) => { const d = Math.abs(lv - projected); if (d < dmin) { dmin = d; best = i } })
    snapTo(best)
  }

  return (
    <div
      ref={sheetRef}
      role="dialog" aria-modal="true" aria-label={ariaLabel}
      className="absolute bottom-0 left-0 right-0 z-40"
      style={{ transform: transformY, transition: 'transform 400ms cubic-bezier(0.32,0.72,0,1)', height: '92dvh', fontFamily: 'var(--font-outfit)' }}
    >
      <div
        className="rounded-t-[28px] flex flex-col overflow-hidden"
        style={{ height: '92dvh', background: 'rgba(254,252,248,0.99)', backdropFilter: 'blur(18px)', boxShadow: '0 -12px 40px rgba(27,40,56,0.22)' }}
      >
        {/* ── HAUT FIXE (toujours visible) = topBar épinglé + peek (zone de drag) ── */}
        <div ref={topRef} style={{ flexShrink: 0 }}>
          {/* topBar ÉPINGLÉ au-dessus de la card (recos…), non draggable.
              Le composant gère lui-même sa bordure (et peut ne rien rendre). */}
          {topBar}
          {/* peek : poignée + en-tête, zone de drag */}
          <div
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{ touchAction: 'none', userSelect: 'none', cursor: 'grab' }}
          >
            <div className="flex items-center justify-center pt-3 pb-2" aria-hidden="true">
              <div style={{ width: 40, height: 4, borderRadius: 999, background: 'rgba(11,31,58,0.18)' }} />
            </div>
            {peek}
          </div>
        </div>

        {/* ── CONTENU SCROLLABLE ── */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehavior: 'contain', minHeight: 0 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

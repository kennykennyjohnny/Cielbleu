'use client'

// ── Créneaux solaires (100 % texte, sans emoji) ──────────────────────────────
// 4 créneaux qui, au clic, lancent une animation de ~3 s du soleil balayant la
// journée : les ombres des bâtiments glissent en direct sur la carte (et la
// card ouverte, qui partage la même heure globale).
//
// Design : pills semi-transparentes ; celle sélectionnée passe au doré et
// affiche une barre de progression qui matérialise le balayage (remplace
// l'ancienne icône qui tournait).
//
// Présentes : au-dessus de la barre de recherche (home) + en haut des cards.

interface SunSlot {
  label: string
  start: number
  end: number | 'sunset'
}

const SLOTS: SunSlot[] = [
  { label: 'Matin',      start: 9,  end: 12 },
  { label: 'Midi',       start: 12, end: 15 },
  { label: 'Après-midi', start: 15, end: 18 },
  { label: 'Soir',       start: 18, end: 'sunset' },
]

function fmtH(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`
}

interface Props {
  sunsetHour: number
  activeSlot: number | null
  onPreview: (startH: number, endH: number, idx: number) => void
  /** 'bar' = pill du bas (home) · 'card' = en-tête de fiche lieu */
  variant?: 'bar' | 'card'
}

export default function SunSlotBubbles({ sunsetHour, activeSlot, onPreview, variant = 'bar' }: Props) {
  return (
    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
      {SLOTS.map((s, i) => {
        const end    = s.end === 'sunset' ? Math.max(s.start + 1, sunsetHour) : s.end
        const active = activeSlot === i
        // "Soir" : on affiche l'heure réelle du coucher, arrondie à l'heure.
        const endLabel = s.end === 'sunset' ? `${Math.round(end)}h` : fmtH(end)
        const range  = `${fmtH(s.start)}–${endLabel}`
        return (
          <button
            key={s.label}
            type="button"
            onClick={() => onPreview(s.start, end, i)}
            aria-label={`Aperçu du soleil — ${s.label.toLowerCase()} (${range})`}
            aria-pressed={active}
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              padding: variant === 'card' ? '8px 3px' : '7px 3px',
              borderRadius: 12,
              border: `1.5px solid ${active ? '#EDC145' : 'rgba(31,58,95,0.10)'}`,
              background: active
                ? 'linear-gradient(180deg, rgba(255,224,102,0.32), rgba(237,193,69,0.15))'
                : 'rgba(255,255,255,0.66)',
              cursor: 'pointer',
              overflow: 'hidden',
              transition: 'transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
              transform: active ? 'translateY(-1px)' : 'none',
              boxShadow: active ? '0 6px 18px rgba(237,193,69,0.38)' : 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: variant === 'card' ? 13 : 12.5,
              fontWeight: 800,
              color: active ? '#7a5a00' : '#1F3A5F',
              lineHeight: 1,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {range}
            </span>
            <span style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: active ? 'rgba(122,90,0,0.78)' : 'rgba(31,58,95,0.44)',
              lineHeight: 1,
              letterSpacing: '0.01em',
              whiteSpace: 'nowrap',
            }}>
              {s.label}
            </span>

            {/* Barre de progression dorée pendant le balayage (~3 s) */}
            {active && (
              <span aria-hidden="true" style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: 2.5,
                width: '100%',
                transformOrigin: 'left center',
                background: 'linear-gradient(90deg, #FFBE0B, #f59e0b)',
                animation: 'cb-slot-sweep 3s ease-in-out forwards',
              }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

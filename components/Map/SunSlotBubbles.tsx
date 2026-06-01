'use client'

// ── Bulles de créneaux solaires ──────────────────────────────────────────────
// 3 créneaux qui, au clic, lancent une animation de ~3 s du soleil balayant
// la journée : les ombres des bâtiments bougent en direct sur la carte (et la
// card ouverte, qui partage la même heure globale).
//
// Présentes : au-dessus de la barre de recherche (home) + en haut des cards.

interface SunSlot {
  label: string
  emoji: string
  start: number
  end: number | 'sunset'
}

const SLOTS: SunSlot[] = [
  { label: 'Matin', emoji: '🌅', start: 9,  end: 12 },
  { label: 'Midi',  emoji: '🌞', start: 12, end: 14.5 },
  { label: 'Soir',  emoji: '🌇', start: 15, end: 'sunset' },
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
        const range  = s.end === 'sunset' ? `${fmtH(s.start)}–coucher` : `${fmtH(s.start)}–${fmtH(end)}`
        return (
          <button
            key={s.label}
            type="button"
            onClick={() => onPreview(s.start, end, i)}
            aria-label={`Aperçu du soleil ${s.label.toLowerCase()} (${range})`}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              padding: variant === 'card' ? '7px 4px' : '6px 4px',
              borderRadius: 13,
              border: `1.5px solid ${active ? '#EDC145' : 'rgba(31,58,95,0.12)'}`,
              background: active ? 'rgba(237,193,69,0.22)' : 'rgba(255,255,255,0.72)',
              cursor: 'pointer',
              transition: 'transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease',
              transform: active ? 'translateY(-1px)' : 'none',
              boxShadow: active ? '0 5px 16px rgba(237,193,69,0.40)' : 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: 15, lineHeight: 1,
              animation: active ? 'cb-sun-spin 2.4s linear infinite' : 'none',
            }} aria-hidden="true">
              {s.emoji}
            </span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#1F3A5F', lineHeight: 1.1, letterSpacing: '-0.01em' }}>
              {s.label}
            </span>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(31,58,95,0.42)', lineHeight: 1, whiteSpace: 'nowrap' }}>
              {range}
            </span>
          </button>
        )
      })}
    </div>
  )
}

'use client'

/**
 * FicheAmenitePanel — panel latéral (desktop) / bottom sheet (mobile)
 * pour une fontaine à boire ou une sanisette.
 * Même emplacement et même comportement que PlacePageClient.
 */

import { useState, useEffect } from 'react'
import { ArrowLeft, Navigation } from 'lucide-react'
import type { AmeniteInfo } from '@/types'

interface Props {
  amenite: AmeniteInfo
  onClose: () => void
}

const CHIP_STYLE = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 11px', borderRadius: 999,
  background: color + '18', color, border: `1px solid ${color}30`,
  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-outfit)',
  lineHeight: 1.3,
})

export default function FicheAmenitePanel({ amenite, onClose }: Props) {
  const [svError, setSvError] = useState(false)

  useEffect(() => {
    setSvError(false)
  }, [amenite.lat, amenite.lng])

  const p          = amenite.props
  const isFontaine = amenite.type === 'fontaine'

  const title       = isFontaine ? 'Fontaine à boire' : 'Sanisette'
  const emoji       = isFontaine ? '💧' : '🚻'
  const themeColor  = isFontaine ? '#3A86FF' : '#4F8F65'

  const status    = isFontaine
    ? (p.dispo === 'OUI' ? 'Disponible' : 'Indisponible')
    : (String(p.statut ?? '') === 'En service' ? 'En service' : 'Hors service')
  const statusOk  = status === 'Disponible' || status === 'En service'
  const potable   = isFontaine && p.potable ? (String(p.potable) === 'OUI' ? 'Eau potable' : 'Non potable') : null
  const pmr       = !isFontaine && p.acces_pmr ? (String(p.acces_pmr).toLowerCase() === 'oui' ? 'Accessible PMR' : null) : null
  const horaire   = !isFontaine && (p.horaire ?? p.horaire_ouverture) ? String(p.horaire ?? p.horaire_ouverture) : null
  const model     = isFontaine && p.modele ? String(p.modele) : null
  const adresse   = !isFontaine && p.adresse ? String(p.adresse) : null

  const svSrc     = `/api/streetview?lat=${amenite.lat}&lng=${amenite.lng}&w=800&h=320&fov=80`
  const svLink    = `https://maps.google.com/?cbll=${amenite.lat},${amenite.lng}&cbp=12,0,0,0,0&layer=c`
  const gmapsUrl  = `https://www.google.com/maps/dir/?api=1&destination=${amenite.lat},${amenite.lng}&travelmode=walking`

  return (
    <div style={{ background: 'transparent', fontFamily: 'var(--font-outfit)', color: '#142033' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 14px' }}>
        <button onClick={onClose} aria-label="Fermer"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(20,32,51,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={16} strokeWidth={2.5} style={{ color: '#0b1f3a' }} />
          </div>
        </button>

        {/* Status badge */}
        <div style={{
          padding: '7px 13px', borderRadius: 999,
          background: statusOk ? (themeColor + '18') : 'rgba(224,82,82,0.12)',
          color: statusOk ? themeColor : '#E05252',
          border: `1px solid ${statusOk ? themeColor + '30' : '#E0525230'}`,
          fontSize: 12.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 15 }}>{emoji}</span>
          <span>{status}</span>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div style={{ padding: '0 14px', paddingBottom: 'max(calc(88px + env(safe-area-inset-bottom,0px)), 100px)' }}>

        {/* ── TITRE + ADRESSE ── */}
        <div style={{ paddingBottom: 16 }}>
          <h1 style={{
            margin: 0, fontFamily: 'var(--font-fraunces)', fontWeight: 700,
            fontSize: 'clamp(26px,8vw,34px)', lineHeight: 0.95, letterSpacing: '-0.05em',
            color: '#0b1f3a',
          }}>
            {title}
          </h1>
          {adresse && (
            <p style={{ margin: '9px 0 0', color: '#6f7a8a', fontSize: 13.5, fontWeight: 500, lineHeight: 1.38 }}>
              {adresse}
            </p>
          )}

          {/* Chips info */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {potable && (
              <span style={CHIP_STYLE(potable === 'Eau potable' ? '#3A86FF' : '#E05252')}>
                💧 {potable}
              </span>
            )}
            {pmr && <span style={CHIP_STYLE('#7B61FF')}>♿ {pmr}</span>}
            {model && <span style={CHIP_STYLE('#8D99AE')}>{model}</span>}
          </div>
        </div>

        {/* ── HORAIRES (sanisette) ── */}
        {horaire && (
          <div style={{
            borderRadius: 18, padding: '14px 16px', marginBottom: 14,
            background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(20,32,51,0.08)',
          }}>
            <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: '#8D99AE',
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>
              Horaires
            </p>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0b1f3a', lineHeight: 1.4 }}>
              🕐 {horaire}
            </p>
          </div>
        )}

        {/* ── STREET VIEW (cliquable) ── */}
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 8px', fontSize: 10.5, fontWeight: 800, color: '#8D99AE',
            letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Voir le lieu
          </p>
          <a
            href={svLink}
            target="_blank" rel="noopener noreferrer"
            style={{ textDecoration: 'none', display: 'block', borderRadius: 18, overflow: 'hidden',
              boxShadow: '0 4px 16px rgba(5,150,105,0.14)',
              border: '1px solid rgba(5,150,105,0.22)', position: 'relative' }}
            aria-label="Voir en Street View"
          >
            {!svError ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={svSrc}
                  alt={`Street View — ${title}`}
                  onError={() => setSvError(true)}
                  style={{ width: '100%', height: 150, objectFit: 'cover', display: 'block' }}
                  loading="eager"
                />
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(to top, rgba(4,30,16,0.72) 0%, transparent 100%)',
                  padding: '22px 14px 11px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 900, fontSize: 13, color: '#fff' }}>🧍 Street View</p>
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.78)', fontWeight: 600 }}>
                      Vue depuis la rue
                    </p>
                  </div>
                  <span style={{ fontSize: 18, color: '#fff' }}>→</span>
                </div>
              </>
            ) : (
              <div style={{
                height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: `linear-gradient(135deg, ${themeColor}18 0%, ${themeColor}38 100%)`,
                flexDirection: 'column', gap: 8,
              }}>
                <span style={{ fontSize: 40 }}>{emoji}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: themeColor }}>Voir en Street View →</span>
              </div>
            )}
          </a>
        </div>

        {/* ── INFO COMPLÉMENTAIRE : lat/lng + description ── */}
        <div style={{
          borderRadius: 18, padding: '14px 16px', marginBottom: 14,
          background: 'rgba(255,255,255,0.68)', border: '1px solid rgba(20,32,51,0.08)',
        }}>
          <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: '#8D99AE',
            letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            Informations
          </p>
          {isFontaine ? (
            <p style={{ margin: 0, fontSize: 13, color: '#3d6b9a', fontWeight: 600, lineHeight: 1.5 }}>
              Fontaine publique de la Ville de Paris.<br />
              Eau froide disponible gratuitement.
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: 13, color: '#3d6b5a', fontWeight: 600, lineHeight: 1.5 }}>
              Sanitaire public automatique.<br />
              Accès libre, nettoyage automatique entre chaque utilisation.
            </p>
          )}
        </div>
      </div>

      {/* ── ACTION BAR STICKY ── */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 40,
        paddingBottom: 'max(env(safe-area-inset-bottom,0px),12px)' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 48px', gap: 8,
          margin: '0 12px', padding: '12px 12px 14px',
          background: 'rgba(255,252,243,0.94)', backdropFilter: 'blur(18px)',
          borderRadius: '24px 24px 0 0',
          borderTop: '1px solid rgba(20,32,51,0.10)',
          boxShadow: '0 -4px 24px rgba(11,31,58,0.12)',
        }}>
          <a
            href={gmapsUrl}
            target="_blank" rel="noopener noreferrer"
            style={{
              height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              borderRadius: 14, textDecoration: 'none',
              fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 14,
              background: statusOk ? themeColor : 'rgba(20,32,51,0.08)',
              color: statusOk ? '#fff' : '#98a2b3',
              boxShadow: statusOk ? `0 8px 20px ${themeColor}40` : 'none',
              pointerEvents: statusOk ? 'auto' : 'none',
            }}
            aria-disabled={!statusOk}
          >
            <Navigation size={15} strokeWidth={2.5} />
            Y aller à pied
          </a>

          {/* Bouton fermer / Maps */}
          <a
            href={`https://www.google.com/maps?q=${amenite.lat},${amenite.lng}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 14, background: '#fff', border: '1px solid rgba(20,32,51,0.10)',
              fontSize: 20, textDecoration: 'none',
            }}
            aria-label="Voir sur Google Maps"
            title="Voir sur Google Maps"
          >
            🗺️
          </a>
        </div>
      </div>
    </div>
  )
}

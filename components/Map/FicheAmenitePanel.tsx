'use client'

/**
 * FicheAmenitePanel — panel latéral (desktop) / bottom sheet (mobile)
 * pour une fontaine à boire ou une sanisette.
 * Même emplacement et même comportement que PlacePageClient.
 */

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Navigation } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { AmeniteInfo } from '@/types'

interface Props {
  amenite: AmeniteInfo
  onClose: () => void
  userId?: string | null
  onOpenProfile?: () => void
}

const CHIP_STYLE = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 11px', borderRadius: 999,
  background: color + '18', color, border: `1px solid ${color}30`,
  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-outfit)',
  lineHeight: 1.3,
})

export default function FicheAmenitePanel({ amenite, onClose, userId, onOpenProfile }: Props) {
  const [svError, setSvError] = useState(false)
  const [reviews, setReviews] = useState<{ id: string; comment: string | null; created_at: string; display_name?: string | null }[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [commentSent, setCommentSent] = useState(false)

  const ameniteKey = `${amenite.lat.toFixed(6)}_${amenite.lng.toFixed(6)}`

  const loadReviews = useCallback(async () => {
    const { data } = await supabase
      .from('reviews')
      .select('id, comment, created_at, profile:profiles(display_name)')
      .eq('amenite_key', ameniteKey)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) {
      setReviews(data.map((r: { id: string; comment: string | null; created_at: string; profile?: { display_name?: string | null } | null | { display_name?: string | null }[] }) => ({
        id: r.id,
        comment: r.comment,
        created_at: r.created_at,
        display_name: Array.isArray(r.profile)
          ? r.profile[0]?.display_name
          : (r.profile as { display_name?: string | null } | null)?.display_name,
      })))
    }
  }, [ameniteKey])

  useEffect(() => {
    setSvError(false)
    setCommentSent(false)
    setCommentText('')
    loadReviews()
  }, [amenite.lat, amenite.lng, loadReviews])

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!commentText.trim() || !userId) return
    setCommentSending(true)
    await supabase.from('reviews').insert({
      amenite_key: ameniteKey,
      place_id: null,
      device_id: 'auth',
      rating: 3,
      user_id: userId,
      comment: commentText.trim(),
    })
    setCommentSending(false)
    setCommentSent(true)
    setCommentText('')
    loadReviews()
  }

  const p          = amenite.props
  const isFontaine = amenite.type === 'fontaine'

  const title       = isFontaine ? 'Fontaine à boire' : 'Sanisette'
  const emoji       = isFontaine ? '💧' : '🚻'
  const themeColor  = isFontaine ? '#1F3A5F' : '#1F3A5F'  // DA v2 — navy pour les deux

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

      {/* ── STATUS BADGE ── */}
        <div style={{
          padding: '7px 13px', borderRadius: 999,
          background: statusOk
            ? (isFontaine ? 'rgba(58,134,255,0.12)' : 'rgba(52,168,83,0.12)')
            : 'rgba(224,82,82,0.12)',
          color: statusOk ? (isFontaine ? '#3A86FF' : '#34A853') : '#E05252',
          border: `1px solid ${statusOk ? (isFontaine ? 'rgba(58,134,255,0.25)' : 'rgba(52,168,83,0.25)') : '#E0525230'}`,
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
            background: 'rgba(31,58,95,0.05)', border: '1px solid rgba(31,58,95,0.08)',
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
          background: 'rgba(31,58,95,0.05)', border: '1px solid rgba(31,58,95,0.08)',
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
        {/* ── ESPACE COMMUNAUTAIRE ── */}
        <div style={{ borderTop: '1px solid rgba(20,32,51,0.07)', marginTop: 6, paddingTop: 18, paddingBottom: 20 }}>
          <p style={{ margin: '0 0 14px', color: 'rgba(31,58,95,0.45)', fontSize: 11, fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '0.12em' }}>
            Avis
          </p>

          {userId
            ? (
              commentSent
                ? <p style={{ fontSize: 13, fontWeight: 800, color: '#34A853', textAlign: 'center', padding: '8px 0' }}>Merci pour ton avis ! 👍</p>
                : (
                  <form onSubmit={handleCommentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder={`Partage ton expérience sur cette ${isFontaine ? 'fontaine' : 'sanisette'}…`}
                      rows={2}
                      maxLength={300}
                      style={{
                        width: '100%', borderRadius: 14, padding: '11px 13px',
                        border: '1.5px solid rgba(31,58,95,0.12)',
                        background: 'rgba(31,58,95,0.04)',
                        fontFamily: 'var(--font-outfit)', fontSize: 13, fontWeight: 600,
                        color: '#1F3A5F', resize: 'none', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <button type="submit" disabled={commentSending || !commentText.trim()}
                      style={{
                        height: 42, borderRadius: 12, border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 13,
                        background: commentText.trim() ? '#1F3A5F' : 'rgba(31,58,95,0.08)',
                        color: commentText.trim() ? '#fff' : 'rgba(31,58,95,0.35)',
                        transition: 'all 150ms',
                      }}
                    >
                      {commentSending ? '…' : 'Publier'}
                    </button>
                  </form>
                )
            )
            : (
              <button onClick={onOpenProfile}
                style={{
                  width: '100%', height: 42, borderRadius: 12, border: '1.5px dashed rgba(31,58,95,0.20)',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 13,
                  color: 'rgba(31,58,95,0.55)',
                }}
              >
                ✍️ Se connecter pour laisser un avis
              </button>
            )
          }

          {reviews.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reviews.map(r => (
                <div key={r.id} style={{
                  borderRadius: 14, padding: '11px 13px',
                  background: 'rgba(31,58,95,0.04)', border: '1px solid rgba(31,58,95,0.08)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1F3A5F' }}>{r.display_name ?? 'Anonyme'}</span>
                    <span style={{ fontSize: 11, color: 'rgba(31,58,95,0.40)', fontWeight: 600 }}>
                      {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1F3A5F', lineHeight: 1.5 }}>{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── ACTION BAR STICKY — DA v2 ── */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 40,
        paddingBottom: 'max(env(safe-area-inset-bottom,0px),12px)' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 48px', gap: 8,
          margin: '0 12px', padding: '12px 12px 14px',
          background: 'rgba(255,248,236,0.96)', backdropFilter: 'blur(18px)',
          borderRadius: '24px 24px 0 0',
          borderTop: '1px solid rgba(31,58,95,0.10)',
          boxShadow: '0 -4px 24px rgba(31,58,95,0.10)',
        }}>
          {/* Itinéraire Google Maps — fonctionne sur iOS/Android/desktop */}
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${amenite.lat},${amenite.lng}&travelmode=walking`}
            target="_blank" rel="noopener noreferrer"
            style={{
              height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              borderRadius: 14, textDecoration: 'none',
              fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 14,
              background: '#EDC145',
              color: '#1F3A5F',
              boxShadow: '0 8px 20px rgba(237,193,69,0.35)',
            }}
          >
            <Navigation size={15} strokeWidth={2.5} />
            Y aller à pied
          </a>

          {/* Voir sur Google Maps */}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${amenite.lat},${amenite.lng}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              height: 46, display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 14, background: '#1F3A5F', border: '1.5px solid rgba(31,58,95,0.15)',
              fontSize: 18, textDecoration: 'none',
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

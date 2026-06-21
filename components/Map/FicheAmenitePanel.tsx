'use client'

/**
 * FicheAmenitePanel — panel latéral (desktop) / bottom sheet (mobile)
 * pour une fontaine à boire ou une sanisette.
 * Même emplacement et même comportement que PlacePageClient.
 */

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Navigation, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { openMaps, webMapsUrl, type MapTarget, type MapMode } from '@/lib/maps'
import { distanceM } from '@/lib/sunNote'
import type { AmeniteInfo } from '@/types'

interface Props {
  amenite: AmeniteInfo
  onClose: () => void
  userId?: string | null
  onOpenProfile?: () => void
  /** Mode « feuille mobile » : on n'affiche PAS l'en-tête, le titre ni la barre
   *  d'action (ils sont rendus dans le peek de MobileSheet via <AmenitePeek/>). */
  bare?: boolean
}

/** Infos d'affichage dérivées d'un point d'eau / sanisette (titre, statut…). */
function ameniteMeta(amenite: AmeniteInfo) {
  const p = amenite.props
  const isFontaine = amenite.type === 'fontaine'
  const title = isFontaine ? 'Fontaine à boire' : 'Sanisette'
  const emoji = isFontaine ? '💧' : '🚻'
  const status = isFontaine
    ? (p.dispo === 'OUI' ? 'Disponible' : 'Indisponible')
    : (String(p.statut ?? '') === 'En service' ? 'En service' : 'Hors service')
  const statusOk = status === 'Disponible' || status === 'En service'
  const adresse = !isFontaine && p.adresse ? String(p.adresse) : null
  return { isFontaine, title, emoji, status, statusOk, adresse }
}

/**
 * AmenitePeek — en-tête compact (statut + titre + adresse + boutons) destiné au
 * peek de MobileSheet : toujours visible, donc « Y aller » accessible direct.
 */
export function AmenitePeek({ amenite, onClose }: { amenite: AmeniteInfo; onClose: () => void }) {
  const { title, emoji, status, statusOk, adresse, isFontaine } = ameniteMeta(amenite)
  const mapTarget: MapTarget = { lat: amenite.lat, lng: amenite.lng }
  const onMapClick = (mode: MapMode) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
    e.preventDefault(); openMaps(mapTarget, mode)
  }
  return (
    <div style={{ padding: '0 16px 12px', position: 'relative' }}>
      <button onClick={onClose} aria-label="Fermer"
        style={{ position: 'absolute', top: -2, right: 12, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'rgba(20,32,51,0.08)', color: '#0b1f3a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'manipulation' }}>
        <X size={15} strokeWidth={2.5} />
      </button>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
        background: statusOk ? (isFontaine ? 'rgba(58,134,255,0.12)' : 'rgba(52,168,83,0.12)') : 'rgba(224,82,82,0.12)',
        color: statusOk ? (isFontaine ? '#3A86FF' : '#34A853') : '#E05252',
        border: `1px solid ${statusOk ? (isFontaine ? 'rgba(58,134,255,0.25)' : 'rgba(52,168,83,0.25)') : '#E0525230'}`,
        fontSize: 12, fontWeight: 800,
      }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>{status}
      </span>
      <h2 style={{ margin: '8px 0 0', fontFamily: 'var(--font-playfair)', fontWeight: 700, fontSize: 'clamp(20px,6vw,26px)', lineHeight: 1.05, letterSpacing: '-0.03em', color: '#0b1f3a', paddingRight: 40 }}>
        {title}
      </h2>
      {adresse && (
        <p style={{ margin: '4px 0 0', color: '#6f7a8a', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{adresse}</p>
      )}
      {/* Boutons : Y aller (itinéraire appli nav) + Maps (fiche/lieu) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 48px', gap: 8, marginTop: 12 }}>
        <a href={webMapsUrl(mapTarget, 'directions')} target="_blank" rel="noopener noreferrer" onClick={onMapClick('directions')}
          style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, textDecoration: 'none', fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 14, background: '#EDC145', color: '#1F3A5F', boxShadow: '0 6px 16px rgba(237,193,69,0.32)' }}>
          <Navigation size={15} strokeWidth={2.5} /> Y aller
        </a>
        <a href={webMapsUrl(mapTarget, 'view')} target="_blank" rel="noopener noreferrer" onClick={onMapClick('view')}
          aria-label="Voir sur Google Maps" title="Voir sur Google Maps"
          style={{ height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 13, background: '#1F3A5F', border: 'none', fontSize: 18, textDecoration: 'none' }}>
          🗺️
        </a>
      </div>
    </div>
  )
}

const CHIP_STYLE = (color: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '4px 11px', borderRadius: 999,
  background: color + '18', color, border: `1px solid ${color}30`,
  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-outfit)',
  lineHeight: 1.3,
})

/**
 * AmeniteNearby — bande des points du MÊME type les plus proches (par distance),
 * destinée à être ÉPINGLÉE AU-DESSUS de la card (comme les recos des bars), et
 * non dans le contenu scrollable. Clic → sélectionne le point.
 */
export function AmeniteNearby({ amenite, onSelect }: { amenite: AmeniteInfo; onSelect: (a: AmeniteInfo) => void }) {
  const { emoji, isFontaine } = ameniteMeta(amenite)
  const [nearby, setNearby] = useState<{ a: AmeniteInfo; dist: number }[]>([])
  useEffect(() => {
    let cancelled = false
    setNearby([])
    fetch(`/api/place-context?lat=${amenite.lat}&lng=${amenite.lng}`, { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((ctx) => {
        if (cancelled || !ctx) return
        const list = (amenite.type === 'fontaine' ? ctx.fontaines : ctx.sanisettes) as Record<string, unknown>[] | undefined
        const items = (list ?? [])
          .map((rec) => {
            const g = rec.geo_point_2d as { lat?: number; lon?: number } | undefined
            if (!g || typeof g.lat !== 'number' || typeof g.lon !== 'number') return null
            const dist = distanceM(amenite.lat, amenite.lng, g.lat, g.lon)
            return { a: { type: amenite.type, props: rec, lat: g.lat, lng: g.lon } as AmeniteInfo, dist }
          })
          .filter((x): x is { a: AmeniteInfo; dist: number } => x !== null && x.dist > 8)
          .sort((x, y) => x.dist - y.dist)
          .slice(0, 6)
        setNearby(items)
      })
      .catch(() => { /* réseau indispo → pas de recos */ })
    return () => { cancelled = true }
  }, [amenite.lat, amenite.lng, amenite.type])

  if (nearby.length === 0) return null
  return (
    <div style={{ padding: '8px 14px 9px', borderBottom: '1px solid rgba(31,58,95,0.08)' }}>
      <p style={{ margin: '0 0 7px', fontSize: 10.5, fontWeight: 800, color: '#8D99AE', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span aria-hidden="true">{emoji}</span> {isFontaine ? 'Fontaines à proximité' : 'Sanisettes à proximité'}
      </p>
      <div className="flex gap-2 overflow-x-auto scrollbar-none" style={{ paddingBottom: 2 }}>
        {nearby.map((n, i) => (
          <button
            key={i}
            onClick={() => onSelect(n.a)}
            className="shrink-0 inline-flex items-center active:scale-[0.96] transition-transform"
            style={{ gap: 6, height: 32, paddingLeft: 9, paddingRight: 12, borderRadius: 999, background: '#fff', border: '1px solid rgba(31,58,95,0.12)', boxShadow: '0 2px 8px rgba(31,58,95,0.07)', cursor: 'pointer' }}
          >
            <span style={{ fontSize: 13 }} aria-hidden="true">{emoji}</span>
            <span style={{ fontFamily: 'var(--font-outfit)', fontSize: 12.5, fontWeight: 800, color: '#1F3A5F' }}>
              {n.dist < 1000 ? `${Math.round(n.dist)} m` : `${(n.dist / 1000).toFixed(1)} km`}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function FicheAmenitePanel({ amenite, onClose, userId, onOpenProfile, bare = false }: Props) {
  const [svError, setSvError] = useState(false)
  const [reviews, setReviews] = useState<{ id: string; comment: string | null; created_at: string; display_name?: string | null; user_id?: string | null }[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentSending, setCommentSending] = useState(false)
  const [commentSent, setCommentSent] = useState(false)

  const ameniteKey = `${amenite.lat.toFixed(6)}_${amenite.lng.toFixed(6)}`

  // Liens cartes : ouverture dans l'appli native sur mobile (voir lib/maps.ts).
  const mapTarget: MapTarget = { lat: amenite.lat, lng: amenite.lng }
  const onMapClick = (mode: MapMode) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return
    e.preventDefault()
    openMaps(mapTarget, mode)
  }

  const loadReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from('reviews')
      .select('id, comment, created_at, user_id')
      .eq('amenite_key', ameniteKey)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error || !data) return
    const userIds = [...new Set(data.map(r => r.user_id).filter(Boolean) as string[])]
    const profileMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name')
        .in('id', userIds)
      profiles?.forEach((p: { id: string; display_name?: string | null }) => {
        if (p.display_name) profileMap[p.id] = p.display_name
      })
    }
    setReviews(data.map(r => ({
      id: r.id,
      comment: r.comment,
      created_at: r.created_at,
      user_id: r.user_id ?? null,
      display_name: r.user_id ? (profileMap[r.user_id] ?? 'Soleiliste') : 'Anonyme',
    })))
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

  const handleDeleteReview = async (reviewId: string) => {
    await supabase.from('reviews').delete().eq('id', reviewId).eq('user_id', userId!)
    setReviews(prev => prev.filter(r => r.id !== reviewId))
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

      {/* ── HEADER ── (masqué en mode feuille mobile : géré par le peek) */}
      {!bare && (
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
      )}

      {/* ── SCROLLABLE BODY ── */}
      <div style={{ padding: bare ? '4px 16px 0' : '0 14px', paddingBottom: bare ? 24 : 'max(calc(88px + env(safe-area-inset-bottom,0px)), 100px)' }}>

        {/* ── TITRE + ADRESSE ── (titre masqué en mode feuille : dans le peek) */}
        <div style={{ paddingBottom: 16 }}>
          {!bare && (
            <h1 style={{
              margin: 0, fontFamily: 'var(--font-fraunces)', fontWeight: 700,
              fontSize: 'clamp(26px,8vw,34px)', lineHeight: 0.95, letterSpacing: '-0.05em',
              color: '#0b1f3a',
            }}>
              {title}
            </h1>
          )}
          {!bare && adresse && (
            <p style={{ margin: '9px 0 0', color: '#6f7a8a', fontSize: 13.5, fontWeight: 500, lineHeight: 1.38 }}>
              {adresse}
            </p>
          )}

          {/* Chips info */}
          {(potable || pmr || model) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: bare ? 0 : 12 }}>
              {potable && (
                <span style={CHIP_STYLE(potable === 'Eau potable' ? '#3A86FF' : '#E05252')}>
                  💧 {potable}
                </span>
              )}
              {pmr && <span style={CHIP_STYLE('#7B61FF')}>♿ {pmr}</span>}
              {model && <span style={CHIP_STYLE('#8D99AE')}>{model}</span>}
            </div>
          )}
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#1F3A5F' }}>{r.display_name ?? 'Anonyme'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'rgba(31,58,95,0.40)', fontWeight: 600 }}>
                        {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </span>
                      {userId && r.user_id === userId && (
                        <button
                          onClick={() => handleDeleteReview(r.id)}
                          aria-label="Supprimer mon avis"
                          style={{ background: 'none', border: 'none', cursor: 'pointer',
                            padding: '1px 4px', borderRadius: 6,
                            color: 'rgba(224,82,82,0.65)', fontSize: 15, lineHeight: 1 }}
                        >×</button>
                      )}
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1F3A5F', lineHeight: 1.5 }}>{r.comment}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── ACTION BAR STICKY — DA v2 ── (masquée en mode feuille : dans le peek) */}
      {!bare && (
      <div style={{ position: 'sticky', bottom: 0, zIndex: 40,
        paddingBottom: 'max(env(safe-area-inset-bottom,0px),12px)' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 48px', gap: 8,
          margin: '0 12px', padding: '12px 12px 14px',
          background: 'rgba(254,252,248,0.99)', backdropFilter: 'blur(18px)',
          borderRadius: '24px 24px 0 0',
          borderTop: '1px solid rgba(31,58,95,0.10)',
          boxShadow: '0 -4px 24px rgba(31,58,95,0.10)',
        }}>
          {/* Itinéraire — ouvre l'appli de navigation (Google Maps / Plans) */}
          <a
            href={webMapsUrl(mapTarget, 'directions')}
            target="_blank" rel="noopener noreferrer"
            onClick={onMapClick('directions')}
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
            href={webMapsUrl(mapTarget, 'view')}
            target="_blank" rel="noopener noreferrer"
            onClick={onMapClick('view')}
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
      )}
    </div>
  )
}

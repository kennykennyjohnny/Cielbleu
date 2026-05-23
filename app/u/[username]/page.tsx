'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface Review {
  id: string
  comment: string | null
  photos?: string[]
  created_at: string
  place?: { name: string; type: string } | null
}

const INPUT: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid rgba(31,58,95,0.15)',
  background: 'rgba(31,58,95,0.04)',
  fontFamily: 'var(--font-outfit)',
  fontSize: 14,
  fontWeight: 600,
  color: '#1F3A5F',
  outline: 'none',
  boxSizing: 'border-box',
}

const BTN_PRIMARY: React.CSSProperties = {
  width: '100%',
  height: 46,
  borderRadius: 14,
  background: '#EDC145',
  color: '#1F3A5F',
  fontFamily: 'var(--font-outfit)',
  fontWeight: 900,
  fontSize: 15,
  border: 'none',
  cursor: 'pointer',
  boxShadow: '0 8px 20px rgba(237,193,69,0.35)',
}

function placeEmoji(type: string) {
  return type === 'bar' ? '🍺' : type === 'restaurant' ? '🍽️' : type === 'park' ? '🌳' : '☕'
}

export default function UserProfilePage() {
  const params = useParams()
  const router = useRouter()
  const username = typeof params.username === 'string' ? params.username : params.username?.[0] ?? ''

  const [profile, setProfile]         = useState<Profile | null>(null)
  const [reviews, setReviews]         = useState<Review[]>([])
  const [loading, setLoading]         = useState(true)
  const [notFound, setNotFound]       = useState(false)

  const [currentUser, setCurrentUser] = useState<User | null | undefined>(undefined)
  const [alreadyFriend, setAlreadyFriend] = useState(false)
  const [friendSent, setFriendSent]   = useState(false)

  // Auth form
  const [authMode, setAuthMode]       = useState<'login' | 'register'>('login')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [displayName, setDisplayName] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError]     = useState<string | null>(null)
  const [pendingAdd, setPendingAdd]   = useState(false)
  const pendingAddRef = useRef(false)

  // ── Auth state ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setCurrentUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Fetch profile + reviews ────────────────────────────────────────────────
  useEffect(() => {
    if (!username) return
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('username', username)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); setLoading(false); return }
        setProfile(data)
        setLoading(false)
        supabase
          .from('reviews')
          .select('id, comment, photos, created_at, place:places(name, type)')
          .eq('user_id', data.id)
          .order('created_at', { ascending: false })
          .limit(5)
          .then(({ data: revs }) => setReviews((revs as unknown as Review[]) ?? []))
      })
  }, [username])

  // ── Check friendship ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || !profile) return
    supabase
      .from('friendships')
      .select('id, status')
      .or(
        `and(requester_id.eq.${currentUser.id},addressee_id.eq.${profile.id}),` +
        `and(requester_id.eq.${profile.id},addressee_id.eq.${currentUser.id})`
      )
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setAlreadyFriend(true)
      })
  }, [currentUser, profile])

  // ── Auto-add friend after auth (if pendingAdd) ─────────────────────────────
  useEffect(() => {
    if (!pendingAddRef.current || !currentUser || !profile) return
    if (currentUser.id === profile.id) return
    pendingAddRef.current = false
    setPendingAdd(false)
    supabase
      .from('friendships')
      .insert({ requester_id: currentUser.id, addressee_id: profile.id })
      .then(({ error }) => {
        if (!error || error.code === '23505') { setAlreadyFriend(true); setFriendSent(true) }
      })
  }, [currentUser, profile])

  const handleAddFriend = useCallback(async () => {
    if (!currentUser || !profile) return
    const { error } = await supabase
      .from('friendships')
      .insert({ requester_id: currentUser.id, addressee_id: profile.id })
    if (!error || error.code === '23505') { setAlreadyFriend(true); setFriendSent(true) }
  }, [currentUser, profile])

  const handleAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true); setAuthError(null)
    pendingAddRef.current = true
    setPendingAdd(true)
    if (authMode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { pendingAddRef.current = false; setPendingAdd(false); setAuthError(error.message); setAuthLoading(false); return }
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: displayName } },
      })
      if (error) { pendingAddRef.current = false; setPendingAdd(false); setAuthError(error.message); setAuthLoading(false); return }
    }
    setAuthLoading(false)
  }, [authMode, email, password, displayName])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#FFF8EC', fontFamily: 'var(--font-outfit)', color: '#1F3A5F' }}>
        <p style={{ margin: 0, fontWeight: 700, opacity: 0.5 }}>Chargement…</p>
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: '#FFF8EC', fontFamily: 'var(--font-outfit)', color: '#1F3A5F', padding: 24 }}>
        <p style={{ fontSize: 40, margin: '0 0 12px' }}>😶</p>
        <p style={{ margin: 0, fontWeight: 900, fontSize: 20 }}>Profil introuvable</p>
        <p style={{ margin: '8px 0 24px', color: 'rgba(31,58,95,0.55)', fontWeight: 600, textAlign: 'center' }}>
          Ce profil n&apos;existe pas ou a été supprimé.
        </p>
        <Link href="/" style={{ background: '#EDC145', color: '#1F3A5F', borderRadius: 14,
          padding: '12px 28px', fontWeight: 900, fontSize: 15, textDecoration: 'none' }}>
          Retour à la carte
        </Link>
      </div>
    )
  }

  const initiale = (profile.display_name ?? profile.username ?? '?').charAt(0).toUpperCase()
  const isSelf = currentUser && currentUser.id === profile.id

  return (
    <div style={{ minHeight: '100dvh', background: '#FFF8EC', fontFamily: 'var(--font-outfit)', color: '#1F3A5F' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
        borderBottom: '1px solid rgba(31,58,95,0.08)', background: 'rgba(255,248,236,0.97)',
        backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(31,58,95,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={16} strokeWidth={2.5} style={{ color: '#1F3A5F' }} />
          </div>
        </button>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em' }}>Profil</p>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 80px' }}>

        {/* Hero carte profil */}
        <div style={{
          margin: '16px 16px 0',
          borderRadius: 24,
          background: 'linear-gradient(145deg, #1a3358 0%, #1F3A5F 55%, #254878 100%)',
          padding: '24px 20px 20px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: -25, right: -25, width: 110, height: 110,
            borderRadius: '50%', background: 'rgba(237,193,69,0.14)', pointerEvents: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
            {/* Avatar */}
            <div style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
              background: profile.avatar_url ? 'transparent' : '#EDC145',
              boxShadow: '0 0 0 3px rgba(237,193,69,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {profile.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={profile.avatar_url} alt={profile.display_name ?? ''} width={64} height={64} style={{ objectFit: 'cover' }} />
                : <span style={{ fontSize: 26, fontWeight: 900, color: '#1F3A5F', lineHeight: 1 }}>{initiale}</span>
              }
            </div>
            <div>
              <p style={{ margin: 0, fontFamily: 'var(--font-bricolage)', fontWeight: 900, fontSize: 20,
                color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                {profile.display_name ?? profile.username}
              </p>
              {profile.username && (
                <p style={{ margin: '5px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.50)', fontWeight: 700 }}>
                  @{profile.username}
                </p>
              )}
            </div>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.45)',
            fontWeight: 600, position: 'relative', zIndex: 1 }}>
            {reviews.length} avis publics
          </p>
        </div>

        {/* CTA ajouter ami */}
        <div style={{ margin: '16px 16px 0' }}>
          {isSelf ? (
            <Link href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, borderRadius: 14, background: '#EDC145', color: '#1F3A5F',
              fontWeight: 900, fontSize: 14, textDecoration: 'none',
              boxShadow: '0 8px 20px rgba(237,193,69,0.30)' }}>
              ☀ Voir la carte
            </Link>
          ) : alreadyFriend || friendSent ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              height: 46, borderRadius: 14, background: 'rgba(52,168,83,0.12)',
              border: '1.5px solid rgba(52,168,83,0.30)', color: '#1a7d38',
              fontWeight: 800, fontSize: 14 }}>
              <Check size={16} strokeWidth={2.5} />
              {friendSent ? 'Demande envoyée !' : 'Déjà amis'}
            </div>
          ) : currentUser ? (
            <button onClick={handleAddFriend} style={{ ...BTN_PRIMARY, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <UserPlus size={16} strokeWidth={2.5} />
              Ajouter {profile.display_name ?? profile.username} comme ami
            </button>
          ) : (
            /* Pas connecté — formulaire d'auth */
            <div style={{ borderRadius: 20, background: '#fff', border: '1px solid rgba(31,58,95,0.10)',
              padding: '20px 18px', boxShadow: '0 4px 20px rgba(31,58,95,0.08)' }}>
              <p style={{ margin: '0 0 4px', fontWeight: 900, fontSize: 16 }}>
                Ajouter {profile.display_name ?? profile.username} comme ami
              </p>
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'rgba(31,58,95,0.55)', fontWeight: 600 }}>
                Connecte-toi ou crée un compte — l&apos;ami sera ajouté automatiquement.
              </p>

              {/* Tab login / register */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14,
                background: 'rgba(31,58,95,0.06)', borderRadius: 12, padding: 4 }}>
                {(['login', 'register'] as const).map(t => (
                  <button key={t} onClick={() => { setAuthMode(t); setAuthError(null) }}
                    style={{ flex: 1, height: 34, borderRadius: 9, border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 13,
                      background: authMode === t ? '#1F3A5F' : 'transparent',
                      color: authMode === t ? '#fff' : 'rgba(31,58,95,0.45)',
                      transition: 'all 150ms' }}>
                    {t === 'login' ? 'Connexion' : 'Inscription'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {authMode === 'register' && (
                  <input style={INPUT} type="text" placeholder="Ton prénom ou pseudo"
                    value={displayName} onChange={e => setDisplayName(e.target.value)} required />
                )}
                <input style={INPUT} type="email" placeholder="Adresse email"
                  value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
                <input style={INPUT} type="password" placeholder="Mot de passe"
                  value={password} onChange={e => setPassword(e.target.value)}
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} required />
                {authError && (
                  <p style={{ margin: 0, fontSize: 13, color: '#E05252', fontWeight: 700,
                    background: 'rgba(224,82,82,0.08)', padding: '8px 12px', borderRadius: 10 }}>
                    {authError}
                  </p>
                )}
                <button type="submit" style={BTN_PRIMARY} disabled={authLoading}>
                  {authLoading ? '…' : authMode === 'login' ? 'Se connecter & ajouter' : 'Créer un compte & ajouter'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Avis publics */}
        {reviews.length > 0 && (
          <div style={{ margin: '20px 16px 0' }}>
            <p style={{ margin: '0 0 10px', color: 'rgba(31,58,95,0.45)', fontSize: 11,
              fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
              Derniers avis
            </p>
            {reviews.map(r => (
              <div key={r.id} style={{ borderRadius: 16, padding: '12px 14px', marginBottom: 10,
                background: 'rgba(31,58,95,0.05)', border: '1px solid rgba(31,58,95,0.08)' }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1F3A5F' }}>
                  {placeEmoji(r.place?.type ?? '')} {r.place?.name ?? '—'}
                </p>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#1F3A5F', fontWeight: 600,
                  lineHeight: 1.5, borderLeft: '3px solid rgba(237,193,69,0.55)',
                  paddingLeft: 10, background: 'rgba(255,255,255,0.70)', borderRadius: '0 8px 8px 0',
                  padding: '6px 10px' }}>
                  {r.comment ?? (r.photos && r.photos.length > 0 ? 'Photo partagée depuis HopSoleil' : 'Aucun commentaire')}
                </p>
                {r.photos && r.photos.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
                    {r.photos.map((url, index) => (
                      <img key={index} src={url} alt={`Photo avis ${index + 1}`} style={{ width: 110, height: 80, objectFit: 'cover', borderRadius: 16, flexShrink: 0 }} />
                    ))}
                  </div>
                )}
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'rgba(31,58,95,0.40)', fontWeight: 600 }}>
                  {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Lien retour carte */}
        <div style={{ margin: '24px 16px 0', textAlign: 'center' }}>
          <Link href="/" style={{ fontSize: 13, color: 'rgba(31,58,95,0.45)', fontWeight: 700,
            textDecoration: 'none' }}>
            ☀ Découvrir HopSoleil
          </Link>
        </div>

      </div>
    </div>
  )
}

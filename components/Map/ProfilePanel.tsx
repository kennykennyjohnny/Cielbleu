'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, LogOut, Heart, MessageSquare, Users, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
}

interface Favorite {
  id: string
  place_id: string
  created_at: string
  place?: { name: string; address: string; type: string }
}

interface FriendRequest {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'rejected'
  profile?: { display_name: string | null; username: string | null }
}

interface UserReview {
  id: string
  comment: string | null
  created_at: string
  place_id: string | null
  place?: { name: string; address: string; type: string } | null
}

// ── Style constants ─────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  borderRadius: 18,
  padding: '14px 16px',
  background: 'rgba(31,58,95,0.05)',
  border: '1px solid rgba(31,58,95,0.08)',
  marginBottom: 12,
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

const BTN_SECONDARY: React.CSSProperties = {
  width: '100%',
  height: 46,
  borderRadius: 14,
  background: 'rgba(31,58,95,0.08)',
  color: '#1F3A5F',
  fontFamily: 'var(--font-outfit)',
  fontWeight: 800,
  fontSize: 14,
  border: '1.5px solid rgba(31,58,95,0.12)',
  cursor: 'pointer',
}

const EYEBROW: React.CSSProperties = {
  margin: '0 0 10px',
  color: 'rgba(31,58,95,0.45)',
  fontSize: 11,
  fontWeight: 800,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
}

type AuthTab = 'login' | 'register'
type ProfileTab = 'favoris' | 'avis' | 'amis'

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  /** Callback appelé quand l'état auth change (login/logout) */
  onAuthChange?: (user: User | null) => void
}

export default function ProfilePanel({ onClose, onAuthChange }: Props) {
  const [user, setUser]               = useState<User | null>(null)
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [favorites, setFavorites]     = useState<Favorite[]>([])
  const [friends, setFriends]         = useState<FriendRequest[]>([])
  const [userReviews, setUserReviews] = useState<UserReview[]>([])
  const [authTab, setAuthTab]         = useState<AuthTab>('login')
  const [profileTab, setProfileTab]   = useState<ProfileTab>('favoris')

  const [email, setEmail]      = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [message, setMessage]   = useState<string | null>(null)
  const [friendEmail, setFriendEmail] = useState('')

  // ── Auth state ─────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      onAuthChange?.(data.user ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      onAuthChange?.(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [onAuthChange])

  // ── Fetch profile + data when logged in ────────────────────────────────────

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) setProfile(data)
  }, [])

  const fetchFavorites = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('favorites')
      .select('id, place_id, created_at, place:places(name, address, type)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setFavorites(data as unknown as Favorite[])
  }, [])

  const fetchUserReviews = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('reviews')
      .select('id, comment, created_at, place_id, place:places(name, address, type)')
      .eq('user_id', userId)
      .not('comment', 'is', null)
      .neq('comment', '')
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setUserReviews(data as unknown as UserReview[])
  }, [])

  const handleDeleteReview = useCallback(async (reviewId: string) => {
    await supabase.from('reviews').delete().eq('id', reviewId)
    setUserReviews(prev => prev.filter(r => r.id !== reviewId))
  }, [])

  const fetchFriends = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, profile:profiles!friendships_addressee_id_fkey(display_name, username)')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .in('status', ['pending', 'accepted'])
      .limit(30)
    if (data) setFriends(data as unknown as FriendRequest[])
  }, [])

  useEffect(() => {
    if (!user) {
      setProfile(null); setFavorites([]); setFriends([]); setUserReviews([])
      return
    }
    fetchProfile(user.id)
    fetchFavorites(user.id)
    fetchFriends(user.id)
    fetchUserReviews(user.id)
  }, [user, fetchProfile, fetchFavorites, fetchFriends, fetchUserReviews])

  // ── Auth actions ───────────────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: displayName } },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setMessage('Vérifie ta boîte mail pour confirmer ton compte 📬')
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function handleRemoveFavorite(favId: string) {
    await supabase.from('favorites').delete().eq('id', favId)
    setFavorites(f => f.filter(x => x.id !== favId))
  }

  async function handleAddFriend(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !friendEmail.trim()) return
    setLoading(true); setError(null)

    // Cherche l'utilisateur par email via la RPC (ou on ne peut pas — email est privé)
    // On doit chercher par username pour la vie privée
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', friendEmail.trim().toLowerCase())
      .single()

    if (!targetProfile) {
      setError('Aucun utilisateur trouvé avec ce pseudo.')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: targetProfile.id,
    })

    setLoading(false)
    if (error) setError(error.code === '23505' ? 'Demande déjà envoyée.' : error.message)
    else { setFriendEmail(''); fetchFriends(user.id) }
  }

  async function handleAcceptFriend(friendshipId: string) {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    setFriends(f => f.map(x => x.id === friendshipId ? { ...x, status: 'accepted' } : x))
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const placeEmoji = (type: string) =>
    type === 'bar' ? '🍺' : type === 'restaurant' ? '🍽️' : type === 'park' ? '🌳' : '☕'

  // ── AUTH PANEL ─────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={{ background: 'transparent', fontFamily: 'var(--font-outfit)', color: '#1F3A5F', padding: '0 0 80px' }}>

        {/* Header minimal */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(31,58,95,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={16} strokeWidth={2.5} />
            </div>
          </button>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em' }}>Mon espace</p>
        </div>

        {/* Hero — gradient navy avec soleil doré */}
        <div style={{
          margin: '16px 16px 0',
          borderRadius: 24,
          background: 'linear-gradient(145deg, #1a3358 0%, #1F3A5F 55%, #254878 100%)',
          padding: '28px 22px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Halos décoratifs */}
          <div style={{ position: 'absolute', top: -30, right: -30, width: 130, height: 130,
            borderRadius: '50%', background: 'rgba(237,193,69,0.14)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: -20, left: -20, width: 90, height: 90,
            borderRadius: '50%', background: 'rgba(237,193,69,0.08)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Logo HopSoleil */}
            <div style={{
              width: 88, height: 88, borderRadius: '50%',
              background: '#FFFFFF',
              boxShadow: '0 0 0 8px rgba(237,193,69,0.18), 0 12px 32px rgba(31,58,95,0.30)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 16,
              overflow: 'hidden',
              flexShrink: 0,
            }}>
              <img
                src="/logo-icon.png"
                alt="HopSoleil"
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
            <p style={{ margin: 0, fontFamily: 'var(--font-bricolage)', fontSize: 19, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>
              Rejoins HopSoleil
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'rgba(255,255,255,0.60)', fontWeight: 600, lineHeight: 1.55 }}>
              Garde tes terrasses chouchous,<br />vote sur l&apos;ensoleillement, retrouve tes amis.
            </p>
          </div>
        </div>

        {/* Perks — 4 pills iconiques */}
        <div style={{ display: 'flex', gap: 7, margin: '14px 16px 0' }}>
          {([
            { icon: <Heart size={16} strokeWidth={2} style={{ color: '#c04f4f' }} />, label: 'Favoris', color: 'rgba(224,82,82,0.12)', border: 'rgba(224,82,82,0.20)' },
            { icon: <span style={{ fontSize: 16, lineHeight: 1 }}>☀️</span>, label: 'Votes', color: 'rgba(237,193,69,0.14)', border: 'rgba(237,193,69,0.35)' },
            { icon: <MessageSquare size={16} strokeWidth={2} style={{ color: 'rgba(31,58,95,0.55)' }} />, label: 'Avis', color: 'rgba(31,58,95,0.06)', border: 'rgba(31,58,95,0.12)' },
            { icon: <Users size={16} strokeWidth={2} style={{ color: '#34A853' }} />, label: 'Amis', color: 'rgba(52,168,83,0.10)', border: 'rgba(52,168,83,0.25)' },
          ] as { icon: React.ReactNode; label: string; color: string; border: string }[]).map(({ icon, label, color, border }) => (
            <div key={label} style={{
              flex: 1, borderRadius: 14, padding: '10px 4px', textAlign: 'center',
              background: color, border: `1.5px solid ${border}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6, height: 20, alignItems: 'center' }}>{icon}</div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(31,58,95,0.60)', letterSpacing: '0.01em' }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 6, margin: '18px 16px 14px',
          background: 'rgba(31,58,95,0.06)', borderRadius: 14, padding: 4 }}>
          {(['login', 'register'] as AuthTab[]).map(t => (
            <button key={t} onClick={() => { setAuthTab(t); setError(null); setMessage(null) }}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 13,
                background: authTab === t ? '#1F3A5F' : 'transparent',
                color: authTab === t ? '#fff' : 'rgba(31,58,95,0.45)',
                boxShadow: authTab === t ? '0 4px 14px rgba(31,58,95,0.22)' : 'none',
                transition: 'all 150ms',
                letterSpacing: '-0.01em',
              }}>
              {t === 'login' ? 'Connexion' : 'Inscription'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={authTab === 'login' ? handleLogin : handleRegister}
          style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {authTab === 'register' && (
            <input style={INPUT} type="text" placeholder="Ton prénom ou pseudo"
              value={displayName} onChange={e => setDisplayName(e.target.value)} required />
          )}

          <input style={INPUT} type="email" placeholder="Adresse email"
            value={email} onChange={e => setEmail(e.target.value)}
            autoComplete="email" required />

          <input style={INPUT} type="password" placeholder="Mot de passe"
            value={password} onChange={e => setPassword(e.target.value)}
            autoComplete={authTab === 'login' ? 'current-password' : 'new-password'} required />

          {error && (
            <p style={{ margin: 0, fontSize: 13, color: '#E05252', fontWeight: 700, background: 'rgba(224,82,82,0.08)', padding: '8px 12px', borderRadius: 10 }}>{error}</p>
          )}
          {message && (
            <p style={{ margin: 0, fontSize: 13, color: '#34A853', fontWeight: 700, background: 'rgba(52,168,83,0.08)', padding: '8px 12px', borderRadius: 10 }}>{message}</p>
          )}

          <button type="submit" style={{ ...BTN_PRIMARY, marginTop: 4 }} disabled={loading}>
            {loading ? '…' : authTab === 'login' ? 'Se connecter' : "Créer mon compte"}
          </button>
        </form>

      </div>
    )
  }

  // ── LOGGED-IN PANEL ────────────────────────────────────────────────────────

  const displayNameResolved = profile?.display_name ?? user.email?.split('@')[0] ?? 'Soleiliste'

  const pendingRequests = friends.filter(f => f.status === 'pending' && f.addressee_id === user.id)
  const acceptedFriends = friends.filter(f => f.status === 'accepted')

  // Initiale pour l'avatar généré
  const initiale = displayNameResolved.charAt(0).toUpperCase()

  return (
    <div style={{ background: 'transparent', fontFamily: 'var(--font-outfit)', color: '#1F3A5F', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(31,58,95,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={16} strokeWidth={2.5} />
            </div>
          </button>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em' }}>Mon espace</p>
        </div>
        <button onClick={handleLogout} title="Se déconnecter"
          style={{ background: 'rgba(31,58,95,0.06)', border: '1px solid rgba(31,58,95,0.10)', borderRadius: 10,
            padding: '6px 10px', cursor: 'pointer', color: 'rgba(31,58,95,0.55)',
            display: 'flex', alignItems: 'center', gap: 5,
            fontFamily: 'var(--font-outfit)', fontWeight: 700, fontSize: 12 }}>
          <LogOut size={13} strokeWidth={2} />
          <span>Déco</span>
        </button>
      </div>

      {/* Carte avatar + stats — DA v2 */}
      <div style={{
        margin: '14px 16px 0',
        borderRadius: 24,
        background: 'linear-gradient(145deg, #1a3358 0%, #1F3A5F 55%, #254878 100%)',
        padding: '20px 20px 18px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Halos décoratifs */}
        <div style={{ position: 'absolute', top: -25, right: -25, width: 110, height: 110,
          borderRadius: '50%', background: 'rgba(237,193,69,0.15)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -15, left: -15, width: 70, height: 70,
          borderRadius: '50%', background: 'rgba(237,193,69,0.08)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative', zIndex: 1 }}>
          {/* Avatar — photo ou initiale */}
          <div style={{
            width: 54, height: 54, borderRadius: '50%', flexShrink: 0,
            background: profile?.avatar_url ? 'transparent' : '#EDC145',
            boxShadow: '0 0 0 3px rgba(237,193,69,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {profile?.avatar_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={profile.avatar_url} alt={displayNameResolved} width={54} height={54} style={{ objectFit: 'cover' }} />
              : <span style={{ fontSize: 22, fontWeight: 900, color: '#1F3A5F', lineHeight: 1 }}>{initiale}</span>
            }
          </div>
          <div>
            <p style={{ margin: 0, fontFamily: 'var(--font-bricolage)', fontWeight: 900, fontSize: 18, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {displayNameResolved}
            </p>
            {profile?.username && (
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'rgba(255,255,255,0.50)', fontWeight: 700 }}>
                @{profile.username}
              </p>
            )}
          </div>
        </div>
        {/* Stats row */}
        <div style={{ display: 'flex', marginTop: 16, position: 'relative', zIndex: 1,
          borderTop: '1px solid rgba(255,255,255,0.10)', paddingTop: 14 }}>
          {[
            { value: favorites.length, label: 'Favoris', color: '#EDC145' },
            { value: acceptedFriends.length, label: 'Amis', color: '#EDC145' },
            { value: pendingRequests.length, label: 'Demandes', color: pendingRequests.length > 0 ? '#f5d060' : 'rgba(255,255,255,0.40)' },
          ].map(({ value, label, color }, i) => (
            <div key={label} style={{ flex: 1, textAlign: 'center',
              borderRight: i < 2 ? '1px solid rgba(255,255,255,0.10)' : 'none' }}>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color, lineHeight: 1, letterSpacing: '-0.02em' }}>{value}</p>
              <p style={{ margin: '4px 0 0', fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs — DA v2 : actif = navy fond blanc, inactif = transparent */}
      <div style={{ display: 'flex', gap: 6, margin: '14px 16px 16px',
        background: 'rgba(31,58,95,0.06)', borderRadius: 14, padding: 4 }}>
        {([
          { id: 'favoris', label: 'Favoris', icon: <Heart size={12} /> },
          { id: 'avis',    label: 'Avis',    icon: <MessageSquare size={12} /> },
          { id: 'amis',    label: 'Amis',    icon: <Users size={12} /> },
        ] as { id: ProfileTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id} onClick={() => setProfileTab(t.id)}
            style={{
              flex: 1, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 12.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              background: profileTab === t.id ? '#1F3A5F' : 'transparent',
              color: profileTab === t.id ? '#EDC145' : 'rgba(31,58,95,0.45)',
              boxShadow: profileTab === t.id ? '0 4px 14px rgba(31,58,95,0.20)' : 'none',
              transition: 'all 150ms',
              letterSpacing: '-0.01em',
            }}>
            {t.icon} {t.label}
            {t.id === 'amis' && pendingRequests.length > 0 && (
              <span style={{ background: '#EDC145', color: '#1F3A5F', borderRadius: 999,
                fontSize: 9, fontWeight: 900, padding: '1px 5px', lineHeight: '14px' }}>
                {pendingRequests.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: '0 16px' }}>

        {/* ── FAVORIS ── */}
        {profileTab === 'favoris' && (
          <>
            {favorites.length === 0
              ? (
                <div style={{ ...CARD, textAlign: 'center', padding: '30px 16px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(237,193,69,0.14)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Heart size={22} strokeWidth={1.8} style={{ color: '#c98e00' }} />
                  </div>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: '#1F3A5F' }}>
                    Aucun favori pour l&apos;instant
                  </p>
                  <p style={{ margin: '5px 0 0', fontSize: 12, color: 'rgba(31,58,95,0.50)', fontWeight: 600, lineHeight: 1.5 }}>
                    Ouvre une fiche de terrasse et clique sur ♥ pour la sauvegarder ici.
                  </p>
                </div>
              )
              : favorites.map(fav => (
                <div key={fav.id} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 22, flexShrink: 0 }}>
                    {fav.place ? placeEmoji(fav.place.type) : <MapPin size={18} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: '#1F3A5F', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fav.place?.name ?? 'Lieu inconnu'}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: 'rgba(31,58,95,0.50)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fav.place?.address?.split(',')[0]}
                    </p>
                  </div>
                  <button onClick={() => handleRemoveFavorite(fav.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#E05252', flexShrink: 0 }}
                    aria-label="Retirer des favoris">
                    <Heart size={16} fill="#E05252" />
                  </button>
                </div>
              ))
            }
          </>
        )}

        {/* ── AVIS ── */}
        {profileTab === 'avis' && (
          <>
            {userReviews.length === 0 ? (
              <div style={{ ...CARD, textAlign: 'center', padding: '30px 16px' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(31,58,95,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <MessageSquare size={22} strokeWidth={1.8} style={{ color: 'rgba(31,58,95,0.45)' }} />
                </div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: '#1F3A5F' }}>
                  Aucun avis pour l&apos;instant
                </p>
                <p style={{ margin: '5px 0 0', fontSize: 12, color: 'rgba(31,58,95,0.50)', fontWeight: 600, lineHeight: 1.5 }}>
                  Commente une terrasse depuis sa fiche pour la retrouver ici.
                </p>
              </div>
            ) : userReviews.map(r => {
              const typeEmoji = r.place?.type === 'bar' ? '🍺' : r.place?.type === 'restaurant' ? '🍽️' : r.place?.type === 'park' ? '🌳' : '☕'
              return (
                <div key={r.id} style={{ ...CARD }}>
                  {/* Lieu */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{typeEmoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1F3A5F',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.place?.name ?? 'Lieu inconnu'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'rgba(31,58,95,0.45)', fontWeight: 600 }}>
                        {new Date(r.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteReview(r.id)}
                      aria-label="Supprimer cet avis"
                      title="Supprimer"
                      style={{ flexShrink: 0, background: 'rgba(224,82,82,0.09)',
                        border: '1px solid rgba(224,82,82,0.22)', borderRadius: 8,
                        cursor: 'pointer', color: 'rgba(224,82,82,0.75)',
                        fontSize: 15, fontWeight: 900, lineHeight: 1,
                        width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      ×
                    </button>
                  </div>
                  {/* Commentaire */}
                  <p style={{ margin: 0, fontSize: 13, color: '#1F3A5F', fontWeight: 600, lineHeight: 1.55,
                    background: 'rgba(255,255,255,0.75)', borderRadius: 10, padding: '8px 10px',
                    borderLeft: '3px solid rgba(237,193,69,0.55)' }}>
                    {r.comment}
                  </p>
                </div>
              )
            })}
          </>
        )}

        {/* ── AMIS ── */}
        {profileTab === 'amis' && (
          <>
            {/* Ajouter un ami par pseudo */}
            <p style={EYEBROW}>Ajouter un ami (par pseudo)</p>
            <form onSubmit={handleAddFriend} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input style={{ ...INPUT, flex: 1 }} type="text" placeholder="@pseudo"
                value={friendEmail} onChange={e => setFriendEmail(e.target.value)} />
              <button type="submit" disabled={loading}
                style={{ height: 46, padding: '0 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: '#EDC145', color: '#1F3A5F', fontWeight: 900, fontFamily: 'var(--font-outfit)', flexShrink: 0 }}>
                +
              </button>
            </form>
            {error && <p style={{ margin: '-8px 0 12px', fontSize: 12, color: '#E05252', fontWeight: 700 }}>{error}</p>}

            {/* Demandes en attente */}
            {pendingRequests.length > 0 && (
              <>
                <p style={EYEBROW}>Demandes reçues</p>
                {pendingRequests.map(req => (
                  <div key={req.id} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(237,193,69,0.20)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      👤
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1F3A5F' }}>
                        {req.profile?.display_name ?? '—'}
                      </p>
                      {req.profile?.username && (
                        <p style={{ margin: '1px 0 0', fontSize: 11, color: 'rgba(31,58,95,0.50)', fontWeight: 700 }}>
                          @{req.profile.username}
                        </p>
                      )}
                    </div>
                    <button onClick={() => handleAcceptFriend(req.id)}
                      style={{ ...BTN_SECONDARY, width: 'auto', padding: '0 12px', height: 32, fontSize: 12 }}>
                      Accepter
                    </button>
                  </div>
                ))}
              </>
            )}

            {/* Amis acceptés */}
            <p style={{ ...EYEBROW, marginTop: pendingRequests.length > 0 ? 16 : 0 }}>
              Mes amis ({acceptedFriends.length})
            </p>
            {acceptedFriends.length === 0
              ? (
                <div style={{ ...CARD, textAlign: 'center', padding: '26px 16px' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(52,168,83,0.10)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                    <Users size={20} strokeWidth={1.8} style={{ color: '#34A853' }} />
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: '#1F3A5F', fontWeight: 800 }}>
                    Pas encore d&apos;amis ajoutés
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(31,58,95,0.50)', fontWeight: 600, lineHeight: 1.5 }}>
                    Invite tes amis via leur pseudo pour explorer Paris au soleil ensemble.
                  </p>
                </div>
              )
              : acceptedFriends.map(f => {
                const isRequester = f.requester_id === user.id
                const p = isRequester ? f.profile : f.profile // même champ via FK addressee
                return (
                  <div key={f.id} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(237,193,69,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      fontWeight: 900, fontSize: 14, color: '#1F3A5F' }}>
                      {p?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1F3A5F' }}>
                        {p?.display_name ?? '—'}
                      </p>
                      {p?.username && (
                        <p style={{ margin: '1px 0 0', fontSize: 11, color: 'rgba(31,58,95,0.50)', fontWeight: 700 }}>
                          @{p.username}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })
            }
          </>
        )}
      </div>

      {/* ── Sticky action bar ── */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 40,
        paddingBottom: 'max(env(safe-area-inset-bottom,0px),12px)' }}>
        <div style={{
          margin: '0 12px', padding: '12px 12px 14px',
          background: 'rgba(255,248,236,0.96)', backdropFilter: 'blur(18px)',
          borderRadius: '24px 24px 0 0',
          borderTop: '1px solid rgba(31,58,95,0.10)',
          boxShadow: '0 -4px 24px rgba(31,58,95,0.10)',
        }}>
          <button onClick={handleLogout} style={{ ...BTN_SECONDARY, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <LogOut size={14} strokeWidth={2} />
            Se déconnecter
          </button>
        </div>
      </div>

    </div>
  )
}

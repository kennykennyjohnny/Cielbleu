'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, LogOut, Heart, MessageSquare, Users, Star, MapPin } from 'lucide-react'
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
      setProfile(null); setFavorites([]); setFriends([])
      return
    }
    fetchProfile(user.id)
    fetchFavorites(user.id)
    fetchFriends(user.id)
  }, [user, fetchProfile, fetchFavorites, fetchFriends])

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

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(31,58,95,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={16} strokeWidth={2.5} />
            </div>
          </button>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Mon profil</p>
        </div>

        {/* Hero */}
        <div style={{ textAlign: 'center', padding: '28px 20px 20px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(237,193,69,0.20)',
            border: '2px solid rgba(237,193,69,0.40)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 12px', fontSize: 28 }}>
            ☀️
          </div>
          <p style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#1F3A5F' }}>
            Connexion à HopSoleil
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(31,58,95,0.55)', fontWeight: 600 }}>
            Sauvegarde tes terrasses favorites,<br />note l'ensoleillement, retrouve tes amis.
          </p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 6, margin: '0 16px 20px',
          background: 'rgba(31,58,95,0.06)', borderRadius: 14, padding: 4 }}>
          {(['login', 'register'] as AuthTab[]).map(t => (
            <button key={t} onClick={() => { setAuthTab(t); setError(null); setMessage(null) }}
              style={{
                flex: 1, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 13,
                background: authTab === t ? '#fff' : 'transparent',
                color: authTab === t ? '#1F3A5F' : 'rgba(31,58,95,0.45)',
                boxShadow: authTab === t ? '0 2px 8px rgba(31,58,95,0.10)' : 'none',
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
            <p style={{ margin: 0, fontSize: 13, color: '#E05252', fontWeight: 700 }}>{error}</p>
          )}
          {message && (
            <p style={{ margin: 0, fontSize: 13, color: '#34A853', fontWeight: 700 }}>{message}</p>
          )}

          <button type="submit" style={{ ...BTN_PRIMARY, marginTop: 4 }} disabled={loading}>
            {loading ? '…' : authTab === 'login' ? 'Se connecter' : "S'inscrire"}
          </button>
        </form>

        {/* Avantages */}
        <div style={{ margin: '24px 16px 0' }}>
          <p style={EYEBROW}>Ce que tu débloques</p>
          {[
            { icon: <Heart size={14} />, label: 'Tes terrasses favorites' },
            { icon: <Star size={14} />, label: 'Confirmer l\'ensoleillement' },
            { icon: <MessageSquare size={14} />, label: 'Laisser un avis' },
            { icon: <Users size={14} />, label: 'Inviter des amis' },
          ].map(({ icon, label }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 0', borderBottom: i < 3 ? '1px solid rgba(31,58,95,0.06)' : 'none' }}>
              <span style={{ color: '#EDC145', flexShrink: 0 }}>{icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1F3A5F' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── LOGGED-IN PANEL ────────────────────────────────────────────────────────

  const displayNameResolved = profile?.display_name ?? user.email?.split('@')[0] ?? 'Soleiliste'

  const pendingRequests = friends.filter(f => f.status === 'pending' && f.addressee_id === user.id)
  const acceptedFriends = friends.filter(f => f.status === 'accepted')

  return (
    <div style={{ background: 'transparent', fontFamily: 'var(--font-outfit)', color: '#1F3A5F', paddingBottom: 80 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(31,58,95,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowLeft size={16} strokeWidth={2.5} />
            </div>
          </button>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 900 }}>Mon profil</p>
        </div>
        <button onClick={handleLogout} title="Se déconnecter"
          style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', color: 'rgba(31,58,95,0.45)' }}>
          <LogOut size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Avatar + name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 16px 14px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
          background: 'rgba(237,193,69,0.22)', border: '2px solid rgba(237,193,69,0.40)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>
          {profile?.avatar_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={profile.avatar_url} alt={displayNameResolved} width={52} height={52} style={{ objectFit: 'cover' }} />
            : '☀️'}
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 900, fontSize: 17, color: '#1F3A5F' }}>{displayNameResolved}</p>
          {profile?.username && (
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(31,58,95,0.50)', fontWeight: 700 }}>
              @{profile.username}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, margin: '0 16px 18px',
        background: 'rgba(31,58,95,0.06)', borderRadius: 14, padding: 4 }}>
        {([
          { id: 'favoris', label: 'Favoris', icon: <Heart size={12} /> },
          { id: 'avis',    label: 'Avis',    icon: <MessageSquare size={12} /> },
          { id: 'amis',    label: 'Amis',    icon: <Users size={12} /> },
        ] as { id: ProfileTab; label: string; icon: React.ReactNode }[]).map(t => (
          <button key={t.id} onClick={() => setProfileTab(t.id)}
            style={{
              flex: 1, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              background: profileTab === t.id ? '#fff' : 'transparent',
              color: profileTab === t.id ? '#1F3A5F' : 'rgba(31,58,95,0.45)',
              boxShadow: profileTab === t.id ? '0 2px 8px rgba(31,58,95,0.10)' : 'none',
            }}>
            {t.icon} {t.label}
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
                <div style={{ ...CARD, textAlign: 'center', padding: '28px 16px' }}>
                  <p style={{ margin: 0, fontSize: 28 }}>🌅</p>
                  <p style={{ margin: '8px 0 0', fontWeight: 800, fontSize: 14, color: '#1F3A5F' }}>
                    Pas encore de favoris
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(31,58,95,0.50)', fontWeight: 600 }}>
                    Clique sur le ❤️ sur une fiche pour sauvegarder un lieu.
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
          <div style={{ ...CARD, textAlign: 'center', padding: '28px 16px' }}>
            <p style={{ margin: 0, fontSize: 28 }}>✍️</p>
            <p style={{ margin: '8px 0 0', fontWeight: 800, fontSize: 14, color: '#1F3A5F' }}>
              Tes avis apparaissent ici
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(31,58,95,0.50)', fontWeight: 600 }}>
              Commente une terrasse depuis sa fiche pour retrouver tes avis ici.
            </p>
          </div>
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
                <div style={{ ...CARD, textAlign: 'center', padding: '24px 16px' }}>
                  <p style={{ margin: 0, fontSize: 24 }}>👥</p>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(31,58,95,0.55)', fontWeight: 700 }}>
                    Tes amis découvrent Paris au soleil avec toi.
                  </p>
                </div>
              )
              : acceptedFriends.map(f => {
                const isRequester = f.requester_id === user.id
                const p = isRequester ? f.profile : f.profile // même champ via FK addressee
                return (
                  <div key={f.id} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(31,58,95,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                      ☀️
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

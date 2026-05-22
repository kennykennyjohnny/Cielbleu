'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ArrowLeft, LogOut, Heart, MessageSquare, Users, MapPin, Share2, Camera, Settings } from 'lucide-react'
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
  requester?: { display_name: string | null; username: string | null }
  addressee?: { display_name: string | null; username: string | null }
}

interface FriendReview {
  id: string
  comment: string | null
  created_at: string
  place?: { name: string; type: string } | null
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
  const [friendSuggestions, setFriendSuggestions] = useState<{ id: string; username: string | null; display_name: string | null }[]>([])
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const skipNextSearchRef = useRef(false)

  // ── Username setup (Google users) ──────────────────────────────────
  const [needsUsername, setNeedsUsername] = useState(false)
  const [newUsername, setNewUsername]     = useState('')

  // ── Paramètres profil ──────────────────────────────────────────────
  const [showSettings, setShowSettings]     = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editUsername, setEditUsername]     = useState('')

  // ── Avatar upload ──────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)

  // ── Aperçu profil ami (à la demande) ───────────────────────────────
  const [friendProfileId, setFriendProfileId] = useState<string | null>(null)
  const [friendReviews, setFriendReviews] = useState<FriendReview[]>([])
  const [friendProfileLoading, setFriendProfileLoading] = useState(false)

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
    if (data) {
      setProfile(data)
      if (!data.username) setNeedsUsername(true)
    }
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
    // friendships.requester_id references auth.users (not profiles),
    // so we can't auto-join to profiles. Fetch in two steps.
    const { data: rows } = await supabase
      .from('friendships')
      .select('id, requester_id, addressee_id, status, created_at')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
      .in('status', ['pending', 'accepted'])
      .limit(50)
    if (!rows?.length) { setFriends([]); return }

    const otherIds = [...new Set(
      rows.flatMap(r => [r.requester_id, r.addressee_id])
    )]
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, display_name, username')
      .in('id', otherIds)
    const pm: Record<string, { display_name: string | null; username: string | null }> =
      Object.fromEntries((profileRows ?? []).map(p => [p.id, p]))

    setFriends(rows.map(r => ({
      ...r,
      requester: pm[r.requester_id] ?? null,
      addressee: pm[r.addressee_id] ?? null,
    })) as unknown as FriendRequest[])
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

  // ── Friend search autocomplete ─────────────────────────────────────────────

  useEffect(() => {
    if (skipNextSearchRef.current) { skipNextSearchRef.current = false; return }
    setSelectedFriendId(null)
    const q = friendEmail.trim().toLowerCase()
    if (!q || q.length < 2) { setFriendSuggestions([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .neq('id', user?.id ?? '')
        .limit(6)
      setFriendSuggestions(data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [friendEmail, user?.id])

  // ── Avatar upload ──────────────────────────────────────────────────────────

  const handleAvatarUpload = useCallback(async (file: File) => {
    if (!user) return
    setAvatarUploading(true)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/avatar.${ext}`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (upErr) { setError(upErr.message); setAvatarUploading(false); return }
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    setProfile(p => p ? { ...p, avatar_url: publicUrl } : p)
    setAvatarUploading(false)
  }, [user])

  // ── Auth actions ───────────────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('email not confirmed') || msg.includes('email_not_confirmed')) {
        setError('Email non confirmé — vérifie ta boîte mail.')
      } else if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
        setError('Email ou mot de passe incorrect.')
      } else {
        setError(error.message)
      }
    }
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

  async function handleGoogleSignIn() {
    setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : '' },
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return
    setLoading(true); setError(null)
    const username = editUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    const display_name = editDisplayName.trim()
    const { error } = await supabase.from('profiles')
      .update({ username: username || null, display_name: display_name || null })
      .eq('id', user.id)
    setLoading(false)
    if (error) setError(error.code === '23505' ? 'Ce pseudo est déjà pris.' : error.message)
    else { setProfile(p => p ? { ...p, username: username || null, display_name: display_name || null } : p); setShowSettings(false) }
  }

  async function handleSaveUsername(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !newUsername.trim()) return
    setLoading(true); setError(null)
    const username = newUsername.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
    const { error } = await supabase.from('profiles').update({ username }).eq('id', user.id)
    setLoading(false)
    if (error) setError(error.code === '23505' ? 'Ce pseudo est déjà pris.' : error.message)
    else { setProfile(p => p ? { ...p, username } : p); setNeedsUsername(false) }
  }

  async function handleRemoveFavorite(favId: string) {
    await supabase.from('favorites').delete().eq('id', favId)
    setFavorites(f => f.filter(x => x.id !== favId))
  }

  async function handleAddFriend(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !friendEmail.trim()) return
    setLoading(true); setError(null)

    let targetId = selectedFriendId
    if (!targetId) {
      const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', friendEmail.trim())
        .single()
      targetId = targetProfile?.id ?? null
    }

    if (!targetId) {
      setError('Aucun utilisateur trouvé avec ce pseudo.')
      setLoading(false)
      return
    }

    const { error } = await supabase.from('friendships').insert({
      requester_id: user.id,
      addressee_id: targetId,
    })

    setLoading(false)
    if (error) setError(error.code === '23505' ? 'Demande déjà envoyée.' : error.message)
    else { setFriendEmail(''); setSelectedFriendId(null); setFriendSuggestions([]); fetchFriends(user.id) }
  }

  async function handleAcceptFriend(friendshipId: string) {
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    setFriends(f => f.map(x => x.id === friendshipId ? { ...x, status: 'accepted' } : x))
  }

  async function handleRejectFriend(friendshipId: string) {
    await supabase.from('friendships').update({ status: 'rejected' }).eq('id', friendshipId)
    setFriends(f => f.filter(x => x.id !== friendshipId))
  }

  async function handleRemoveFriend(friendshipId: string) {
    await supabase.from('friendships').delete().eq('id', friendshipId)
    setFriends(f => f.filter(x => x.id !== friendshipId))
    setFriendProfileId(null)
  }

  // ── Render helpers ─────────────────────────────────────────────────────────
  async function loadFriendProfile(friendId: string) {
    // Toggle
    if (friendProfileId === friendId) { setFriendProfileId(null); return }
    setFriendProfileId(friendId)
    setFriendProfileLoading(true)
    setFriendReviews([])
    const { data } = await supabase
      .from('reviews')
      .select('id, comment, created_at, place:places(name, type)')
      .eq('user_id', friendId)
      .not('comment', 'is', null)
      .neq('comment', '')
      .order('created_at', { ascending: false })
      .limit(3)
    setFriendReviews((data as unknown as FriendReview[]) ?? [])
    setFriendProfileLoading(false)
  }
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
                src="/favicon-vdef.png"
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

        {/* ── Google OAuth ── */}
        <div style={{ padding: '10px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ flex: 1, height: 1, background: 'rgba(31,58,95,0.12)' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(31,58,95,0.35)', whiteSpace: 'nowrap' }}>ou</span>
            <span style={{ flex: 1, height: 1, background: 'rgba(31,58,95,0.12)' }} />
          </div>
          <button type="button" onClick={handleGoogleSignIn} disabled={loading}
            style={{ width: '100%', height: 46, borderRadius: 14, background: '#fff',
              border: '1.5px solid rgba(31,58,95,0.15)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 14, color: '#1F3A5F',
              boxShadow: '0 2px 8px rgba(31,58,95,0.08)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continuer avec Google
          </button>
        </div>

      </div>
    )
  }

  // ── LOGGED-IN PANEL ──────────────────────────────────────────────

  // ── Paramètres ────────────────────────────────────────────────────
  if (showSettings) return (
    <div style={{ background: 'transparent', fontFamily: 'var(--font-outfit)', color: '#1F3A5F', padding: '0 0 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
        <button onClick={() => { setShowSettings(false); setError(null) }}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(31,58,95,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={16} strokeWidth={2.5} />
          </div>
        </button>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em' }}>Paramètres du profil</p>
      </div>

      <form onSubmit={handleSaveSettings}
        style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Prénom / Pseudo affiché */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'rgba(31,58,95,0.45)' }}>
            Prénom / Pseudo affiché
          </label>
          <input style={INPUT} type="text" placeholder="ex. Alex"
            value={editDisplayName} onChange={e => { setEditDisplayName(e.target.value); setError(null) }}
            maxLength={50} />
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(31,58,95,0.40)', fontWeight: 600, lineHeight: 1.4 }}>
            Visible par tes amis et sur la carte.
          </p>
        </div>

        {/* Identifiant unique */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'rgba(31,58,95,0.45)' }}>
            Identifiant unique (@username)
          </label>
          <input style={INPUT} type="text" placeholder="ex. alex_soleil"
            value={editUsername} onChange={e => { setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')); setError(null) }}
            minLength={2} maxLength={30} />
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(31,58,95,0.40)', fontWeight: 600, lineHeight: 1.4 }}>
            Utilisé pour te retrouver et partager ton profil. Minuscules, chiffres, underscore.
          </p>
        </div>

        {error && <p style={{ margin: 0, fontSize: 13, color: '#E05252', fontWeight: 700,
          background: 'rgba(224,82,82,0.08)', padding: '8px 12px', borderRadius: 10 }}>{error}</p>}

        <button type="submit" style={{ ...BTN_PRIMARY, marginTop: 4 }} disabled={loading}>
          {loading ? '…' : 'Enregistrer'}
        </button>
        <button type="button" onClick={() => { setShowSettings(false); setError(null) }}
          style={{ ...BTN_SECONDARY, fontSize: 13 }}>
          Annuler
        </button>
      </form>
    </div>
  )

  // Étape pseudo manquant (ex. après connexion Google)
  if (needsUsername) return (
    <div style={{ background: 'transparent', fontFamily: 'var(--font-outfit)', color: '#1F3A5F', padding: '0 0 80px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 0' }}>
        <button onClick={() => setNeedsUsername(false)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(31,58,95,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={16} strokeWidth={2.5} />
          </div>
        </button>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 900, letterSpacing: '-0.02em' }}>Choisis ton pseudo</p>
      </div>
      <div style={{ margin: '20px 16px 0', borderRadius: 22,
        background: 'linear-gradient(145deg, #1a3358 0%, #1F3A5F 55%, #254878 100%)',
        padding: '24px 20px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -25, right: -25, width: 100, height: 100,
          borderRadius: '50%', background: 'rgba(237,193,69,0.15)', pointerEvents: 'none' }} />
        <p style={{ margin: 0, fontFamily: 'var(--font-bricolage)', fontSize: 17, fontWeight: 900,
          color: '#fff', letterSpacing: '-0.03em', position: 'relative' }}>Bienvenue 👋</p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.60)', fontWeight: 600,
          lineHeight: 1.55, position: 'relative' }}>
          Ton compte est créé ! Choisis le pseudo qui<br />t&apos;identifiera auprès de tes amis.
        </p>
      </div>
      <form onSubmit={handleSaveUsername}
        style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input style={INPUT} type="text" placeholder="ton_pseudo"
          value={newUsername} onChange={e => { setNewUsername(e.target.value); setError(null) }}
          minLength={2} maxLength={30} required />
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(31,58,95,0.45)', fontWeight: 600 }}>
          Minuscules, chiffres, underscore — 2 à 30 caractères.
        </p>
        {error && <p style={{ margin: 0, fontSize: 13, color: '#E05252', fontWeight: 700,
          background: 'rgba(224,82,82,0.08)', padding: '8px 12px', borderRadius: 10 }}>{error}</p>}
        <button type="submit" style={{ ...BTN_PRIMARY, marginTop: 4 }} disabled={loading}>
          {loading ? '…' : 'Confirmer mon pseudo'}
        </button>
        <button type="button" onClick={() => setNeedsUsername(false)}
          style={{ ...BTN_SECONDARY, fontSize: 13 }}>
          Choisir plus tard
        </button>
      </form>
    </div>
  )

  const displayNameResolved = profile?.display_name ?? user.email?.split('@')[0] ?? 'Soleiliste'

  const pendingRequests = friends.filter(f => f.status === 'pending' && f.addressee_id === user.id)
  const sentRequests    = friends.filter(f => f.status === 'pending' && f.requester_id === user.id)
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
        <div style={{ display: 'flex', gap: 6 }}>
          {profile?.username && (
            <button
              onClick={() => {
                const url = `https://hopsoleil.fr/u/${profile.username}`
                if (navigator?.share) navigator.share({ title: (profile.display_name ?? 'Mon profil') + ' sur HopSoleil', url }).catch(() => {})
                else navigator.clipboard.writeText(url).catch(() => {})
              }}
              title="Partager mon profil"
              style={{ background: 'rgba(31,58,95,0.06)', border: '1px solid rgba(31,58,95,0.10)', borderRadius: 10,
                padding: '6px 10px', cursor: 'pointer', color: 'rgba(31,58,95,0.55)',
                display: 'flex', alignItems: 'center', gap: 5 }}>
              <Share2 size={13} strokeWidth={2} />
            </button>
          )}
          <button
            onClick={() => { setEditDisplayName(profile?.display_name ?? ''); setEditUsername(profile?.username ?? ''); setError(null); setShowSettings(true) }}
            title="Paramètres"
            style={{ background: 'rgba(31,58,95,0.06)', border: '1px solid rgba(31,58,95,0.10)', borderRadius: 10,
              padding: '6px 10px', cursor: 'pointer', color: 'rgba(31,58,95,0.55)',
              display: 'flex', alignItems: 'center', gap: 5 }}>
            <Settings size={13} strokeWidth={2} />
          </button>
          <button onClick={handleLogout} title="Se déconnecter"
            style={{ background: 'rgba(31,58,95,0.06)', border: '1px solid rgba(31,58,95,0.10)', borderRadius: 10,
              padding: '6px 10px', cursor: 'pointer', color: 'rgba(31,58,95,0.55)',
              display: 'flex', alignItems: 'center', gap: 5,
              fontFamily: 'var(--font-outfit)', fontWeight: 700, fontSize: 12 }}>
            <LogOut size={13} strokeWidth={2} />
            <span>Déco</span>
          </button>
        </div>
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
          {/* Avatar — photo ou initiale + bouton upload */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
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
            {/* Bouton upload photo */}
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              aria-label="Changer la photo de profil"
              style={{ position: 'absolute', bottom: -2, right: -4, width: 22, height: 22,
                borderRadius: '50%', background: '#EDC145', border: '2px solid #1a3358',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.20)' }}
            >
              {avatarUploading
                ? <span style={{ fontSize: 9, color: '#1F3A5F', fontWeight: 900 }}>…</span>
                : <Camera size={11} strokeWidth={2.5} style={{ color: '#1F3A5F' }} />
              }
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f) }}
            />
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
        {/* Bouton partager son profil */}
        {profile?.username && (
          <button
            onClick={() => {
              const url = `https://hopsoleil.fr/u/${profile.username}`
              if (navigator?.share) { navigator.share({ title: (profile.display_name ?? 'Mon profil') + ' sur HopSoleil', url }).catch(() => {}) }
              else { navigator.clipboard.writeText(url).catch(() => {}) }
            }}
            style={{ marginTop: 14, position: 'relative', zIndex: 1, width: '100%', height: 36,
              borderRadius: 10, border: '1px solid rgba(237,193,69,0.30)',
              background: 'rgba(237,193,69,0.12)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 12.5,
              color: 'rgba(255,255,255,0.80)' }}
          >
            <Share2 size={13} strokeWidth={2.2} />
            Partager mon profil
          </button>
        )}
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
            <form onSubmit={handleAddFriend} style={{ display: 'flex', gap: 8, marginBottom: friendSuggestions.length > 0 ? 0 : 16, position: 'relative' }}>
              <input style={{ ...INPUT, flex: 1 }} type="text" placeholder="pseudo"
                value={friendEmail} onChange={e => { setFriendEmail(e.target.value); setError(null) }}
                autoComplete="off" />
              <button type="submit" disabled={loading}
                style={{ height: 46, padding: '0 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: '#EDC145', color: '#1F3A5F', fontWeight: 900, fontFamily: 'var(--font-outfit)', flexShrink: 0 }}>
                +
              </button>
            </form>
            {/* Autocomplete dropdown */}
            {friendSuggestions.length > 0 && (
              <div style={{ background: '#fff', border: '1.5px solid rgba(31,58,95,0.12)',
                borderRadius: '0 0 12px 12px', marginBottom: 16,
                boxShadow: '0 4px 16px rgba(31,58,95,0.10)', overflow: 'hidden' }}>
                {friendSuggestions.map((s, i) => (
                  <button key={s.id}
                    type="button"
                    onClick={() => {
                      skipNextSearchRef.current = true
                      setFriendEmail(s.display_name ?? s.username ?? '')
                      setSelectedFriendId(s.id)
                      setFriendSuggestions([])
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                      padding: '10px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: 'transparent', fontFamily: 'var(--font-outfit)',
                      borderTop: i > 0 ? '1px solid rgba(31,58,95,0.07)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(31,58,95,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: '50%',
                      background: 'rgba(237,193,69,0.18)', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 900, color: '#1F3A5F' }}>
                      {s.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1F3A5F' }}>
                        {s.display_name ?? s.username}
                      </p>
                      {s.username && (
                        <p style={{ margin: 0, fontSize: 11, color: 'rgba(31,58,95,0.50)', fontWeight: 600 }}>
                          @{s.username}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
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
                        {req.requester?.display_name ?? '—'}
                      </p>
                      {req.requester?.username && (
                        <p style={{ margin: '1px 0 0', fontSize: 11, color: 'rgba(31,58,95,0.50)', fontWeight: 700 }}>
                          @{req.requester.username}
                        </p>
                      )}
                    </div>
                    <button onClick={() => handleAcceptFriend(req.id)}
                      style={{ ...BTN_SECONDARY, width: 'auto', padding: '0 12px', height: 32, fontSize: 12 }}>
                      Accepter
                    </button>
                    <button onClick={() => handleRejectFriend(req.id)}
                      style={{ width: 'auto', padding: '0 10px', height: 32, fontSize: 12, borderRadius: 12,
                        border: '1.5px solid rgba(224,82,82,0.30)', background: 'rgba(224,82,82,0.08)',
                        color: '#c04f4f', fontFamily: 'var(--font-outfit)', fontWeight: 800, cursor: 'pointer' }}>
                      Refuser
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
                const p = f.requester_id === user.id ? f.addressee : f.requester
                const otherId = f.requester_id === user.id ? f.addressee_id : f.requester_id
                const isExpanded = friendProfileId === otherId
                return (
                  <div key={f.id}>
                    <div
                      onClick={() => loadFriendProfile(otherId)}
                      style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                        borderBottomLeftRadius: isExpanded ? 0 : undefined, borderBottomRightRadius: isExpanded ? 0 : undefined,
                        marginBottom: isExpanded ? 0 : 12 }}>
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
                      <span style={{ fontSize: 14, color: 'rgba(31,58,95,0.35)', transition: 'transform 200ms',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'block' }}>▾</span>
                    </div>
                    {isExpanded && (
                      <div style={{ ...CARD, marginBottom: 12,
                        borderTopLeftRadius: 0, borderTopRightRadius: 0,
                        borderTop: '1px solid rgba(31,58,95,0.06)', paddingTop: 10 }}>
                        {friendProfileLoading ? (
                          <p style={{ margin: 0, fontSize: 12, textAlign: 'center', color: 'rgba(31,58,95,0.40)', fontWeight: 600 }}>
                            Chargement…
                          </p>
                        ) : friendReviews.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 12, color: 'rgba(31,58,95,0.40)', fontWeight: 600, textAlign: 'center' }}>
                            Aucun avis public pour l&apos;instant
                          </p>
                        ) : (
                          <>
                            <p style={{ margin: '0 0 8px', fontSize: 10, fontWeight: 900, letterSpacing: '0.10em',
                              textTransform: 'uppercase', color: 'rgba(31,58,95,0.45)' }}>Derniers avis</p>
                            {friendReviews.map(r => (
                              <div key={r.id} style={{ marginBottom: 8, paddingBottom: 8,
                                borderBottom: '1px solid rgba(31,58,95,0.06)' }}>
                                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#1F3A5F' }}>
                                  {placeEmoji(r.place?.type ?? '')} {r.place?.name ?? '—'}
                                </p>
                                {r.comment && (
                                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(31,58,95,0.70)',
                                    fontWeight: 600, lineHeight: 1.4 }}>
                                    {r.comment}
                                  </p>
                                )}
                              </div>
                            ))}
                          </>
                        )}
                        {/* Bouton supprimer l'ami */}
                        <button
                          onClick={() => handleRemoveFriend(f.id)}
                          style={{ marginTop: 8, width: '100%', height: 32, borderRadius: 10,
                            border: '1.5px solid rgba(224,82,82,0.28)',
                            background: 'rgba(224,82,82,0.07)',
                            color: '#c04f4f', fontFamily: 'var(--font-outfit)',
                            fontWeight: 800, fontSize: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        >
                          Supprimer cet ami
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            }

            {/* Demandes envoyées en attente */}
            {sentRequests.length > 0 && (
              <>
                <p style={{ ...EYEBROW, marginTop: 16 }}>Demandes envoyées</p>
                {sentRequests.map(req => (
                  <div key={req.id} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%',
                      background: 'rgba(237,193,69,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, fontWeight: 900, fontSize: 14, color: '#1F3A5F' }}>
                      {req.addressee?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1F3A5F' }}>
                        {req.addressee?.display_name ?? '—'}
                      </p>
                      {req.addressee?.username && (
                        <p style={{ margin: '1px 0 0', fontSize: 11, color: 'rgba(31,58,95,0.50)', fontWeight: 700 }}>
                          @{req.addressee.username}
                        </p>
                      )}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: 'rgba(31,58,95,0.40)',
                      background: 'rgba(31,58,95,0.06)', border: '1px solid rgba(31,58,95,0.10)',
                      borderRadius: 8, padding: '4px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      En attente
                    </span>
                  </div>
                ))}
              </>
            )}

          </>
        )}
      </div>



    </div>
  )
}

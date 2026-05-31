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
  requester?: { display_name: string | null; username: string | null; avatar_url?: string | null }
  addressee?: { display_name: string | null; username: string | null; avatar_url?: string | null }
}

interface FriendReview {
  id: string
  comment: string | null
  created_at: string
  place_id?: string | null
  place?: { name: string; type: string } | null
}

interface FriendFavorite {
  id: string
  place_id: string
  created_at: string
  place?: { name: string; type: string } | null
}

interface UserReview {
  id: string
  comment: string | null
  photos?: string[]
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
  /** Callback pour naviguer vers la fiche d'un lieu depuis le profil */
  onSelectPlace?: (placeId: string) => void
}

export default function ProfilePanel({ onClose, onAuthChange, onSelectPlace }: Props) {
  const [user, setUser]               = useState<User | null>(null)
  const [profile, setProfile]         = useState<Profile | null>(null)
  const [favorites, setFavorites]     = useState<Favorite[]>([])
  const [friends, setFriends]         = useState<FriendRequest[]>([])
  const [userReviews, setUserReviews] = useState<UserReview[]>([])
  const [authTab, setAuthTab]         = useState<AuthTab>('login')
  const [profileTab, setProfileTab]   = useState<ProfileTab>('favoris')

  const [email, setEmail]      = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [message, setMessage]   = useState<string | null>(null)
  const [name, setName]         = useState('')  // prénom = pseudo (champ unique)
  const [friendEmail, setFriendEmail] = useState('')
  const [friendSuggestions, setFriendSuggestions] = useState<{ id: string; username: string | null; display_name: string | null; avatar_url?: string | null }[]>([])
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null)
  const skipNextSearchRef = useRef(false)

  // ── Username setup (Google users) ──────────────────────────────────
  const [needsUsername, setNeedsUsername] = useState(false)
  const [newName, setNewName]             = useState('')  // prénom = pseudo

  // ── Paramètres profil ──────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)
  const [editName, setEditName]         = useState('')  // prénom = pseudo

  // ── Avatar upload ──────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef  = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [showAvatarChoice, setShowAvatarChoice] = useState(false)

  // ── Crop ────────────────────────────────────────────────────────────
  const [cropSrc, setCropSrc]         = useState<string | null>(null)
  const [cropScale, setCropScale]     = useState(1)
  const [cropOffset, setCropOffset]   = useState({ x: 0, y: 0 })
  const cropNaturalRef = useRef({ w: 1, h: 1 })
  const cropDragRef    = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const CROP_PREVIEW   = 260  // px — taille du conteneur de prévisualisation
  const CROP_OUT       = 256  // px — taille de sortie

  // ── Aperçu profil ami (à la demande) ───────────────────────────────
  const [friendProfileId, setFriendProfileId]     = useState<string | null>(null)
  const [friendReviews, setFriendReviews]         = useState<FriendReview[]>([])
  const [friendFavorites, setFriendFavorites]     = useState<FriendFavorite[]>([])
  const [friendProfileTab, setFriendProfileTab]   = useState<'likes' | 'reviews'>('likes')
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
      .select('id, comment, photos, created_at, place_id, place:places(name, address, type)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) setUserReviews(data as unknown as UserReview[])
  }, [])

  const handleDeleteReview = useCallback(async (reviewId: string) => {
    await supabase.from('reviews').delete().eq('id', reviewId)
    setUserReviews(prev => prev.filter(r => r.id !== reviewId))
  }, [])

  const fetchFriends = useCallback(async (userId: string) => {
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
      .select('id, display_name, username, avatar_url')
      .in('id', otherIds)
    const pm: Record<string, { display_name: string | null; username: string | null; avatar_url?: string | null }> =
      Object.fromEntries((profileRows ?? []).map(p => [p.id, p]))

    // Dédupliquer les paires mutuelles : garder la plus pertinente
    const pairMap = new Map<string, typeof rows[0]>()
    for (const r of rows) {
      const key = [r.requester_id, r.addressee_id].sort().join('|')
      const ex = pairMap.get(key)
      if (!ex) { pairMap.set(key, r); continue }
      // Préférer : accepted > l'entrée où userId est addressee (peut accepter)
      if (r.status === 'accepted') pairMap.set(key, r)
      else if (ex.status !== 'accepted' && r.addressee_id === userId) pairMap.set(key, r)
    }

    setFriends([...pairMap.values()].map(r => ({
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
        .select('id, username, display_name, avatar_url')
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
    const path = `${user.id}/avatar.jpg`
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { setError(upErr.message); setAvatarUploading(false); return }
    // Ajouter un timestamp pour forcer le rechargement du cache
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const urlWithTs = `${publicUrl}?t=${Date.now()}`
    await supabase.from('profiles').update({ avatar_url: urlWithTs }).eq('id', user.id)
    setProfile(p => p ? { ...p, avatar_url: urlWithTs } : p)
    setAvatarUploading(false)
  }, [user])

  // ── Crop confirm ───────────────────────────────────────────────────────────

  function handleFileForCrop(file: File) {
    setShowAvatarChoice(false)
    const objectUrl = URL.createObjectURL(file)
    const raw = new window.Image()
    raw.onload = () => {
      URL.revokeObjectURL(objectUrl)
      // Downsample to max 720px — 256px avatar output needs no more
      const DISP_MAX = 720
      const scale = Math.min(DISP_MAX / raw.naturalWidth, DISP_MAX / raw.naturalHeight, 1)
      const dw = Math.round(raw.naturalWidth  * scale)
      const dh = Math.round(raw.naturalHeight * scale)
      const cv = document.createElement('canvas')
      cv.width = dw ; cv.height = dh
      cv.getContext('2d')!.drawImage(raw, 0, 0, dw, dh)
      cropNaturalRef.current = { w: dw, h: dh }
      const coverScale = Math.max(CROP_PREVIEW / dw, CROP_PREVIEW / dh)
      setCropScale(coverScale)
      setCropOffset({ x: 0, y: 0 })
      setCropSrc(cv.toDataURL('image/jpeg', 0.92))
    }
    raw.src = objectUrl
  }

  function handleCropConfirm() {
    if (!cropSrc) return
    const img = new window.Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width  = CROP_OUT
      canvas.height = CROP_OUT
      const ctx = canvas.getContext('2d')!

      // Circular clip
      ctx.beginPath()
      ctx.arc(CROP_OUT / 2, CROP_OUT / 2, CROP_OUT / 2, 0, Math.PI * 2)
      ctx.clip()

      const s  = cropScale
      const ox = cropOffset.x
      const oy = cropOffset.y
      const { w, h } = cropNaturalRef.current

      // Position of image top-left corner in the CROP_PREVIEW container
      const imgLeft = CROP_PREVIEW / 2 + ox - (w * s) / 2
      const imgTop  = CROP_PREVIEW / 2 + oy - (h * s) / 2
      // Crop circle top-left in the CROP_PREVIEW container (centered)
      const circleLeft = (CROP_PREVIEW - CROP_OUT) / 2
      const circleTop  = (CROP_PREVIEW - CROP_OUT) / 2
      // Source rect in the downsampled image
      const srcX = (circleLeft - imgLeft) / s
      const srcY = (circleTop  - imgTop)  / s
      const srcW = CROP_OUT / s
      const srcH = CROP_OUT / s

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, CROP_OUT, CROP_OUT)

      canvas.toBlob(async (blob) => {
        if (!blob) return
        setCropSrc(null)
        await handleAvatarUpload(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.90)
    }
    img.src = cropSrc
  }

  // ── Naviguer vers un lieu depuis le profil ─────────────────────────────────

  function handleGoToPlace(placeId: string) {
    onSelectPlace?.(placeId)
    onClose()
  }

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
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name } },
    })
    setLoading(false)
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('already') || msg.includes('already_registered')) {
        setError('Un compte existe déjà avec cet email — essaie de te connecter.')
      } else {
        setError(error.message)
      }
      return
    }
    if (!data.session) {
      setMessage('Compte créé ! Vérifie ta boîte mail pour confirmer. 📬')
    }
    // Si session immédiate (sans confirmation email), onAuthStateChange gère la suite
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !editName.trim()) return
    setLoading(true); setError(null)
    const display_name = editName.trim()
    const username = display_name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'user'
    const { error } = await supabase.from('profiles')
      .update({ username, display_name })
      .eq('id', user.id)
    setLoading(false)
    if (error) setError(error.code === '23505' ? 'Ce prénom/pseudo est déjà pris.' : error.message)
    else { setProfile(p => p ? { ...p, username, display_name } : p); setShowSettings(false) }
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !newName.trim()) return
    setLoading(true); setError(null)
    const display_name = newName.trim()
    const username = display_name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'user'
    const { error } = await supabase.from('profiles').update({ username, display_name }).eq('id', user.id)
    setLoading(false)
    if (error) setError(error.code === '23505' ? 'Ce prénom/pseudo est déjà pris.' : error.message)
    else { setProfile(p => p ? { ...p, username, display_name } : p); setNeedsUsername(false) }
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
        .or(`username.ilike.${friendEmail.trim()},display_name.ilike.${friendEmail.trim()}`)
        .single()
      targetId = targetProfile?.id ?? null
    }

    if (!targetId) {
      setError('Aucun utilisateur trouvé avec ce prénom.')
      setLoading(false)
      return
    }

    // Vérifier si l'autre a déjà envoyé une demande (accepter plutôt que dupliquer)
    const reverseReq = friends.find(
      f => f.requester_id === targetId && f.addressee_id === user.id && f.status === 'pending'
    )
    if (reverseReq) {
      await supabase.from('friendships').update({ status: 'accepted' }).eq('id', reverseReq.id)
      setFriendEmail(''); setSelectedFriendId(null); setFriendSuggestions([])
      fetchFriends(user.id)
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
    setFriendFavorites([])

    const [reviewsRes, favoritesRes] = await Promise.all([
      supabase
        .from('reviews')
        .select('id, comment, created_at, place_id, place:places(name, type)')
        .eq('user_id', friendId)
        .not('comment', 'is', null)
        .neq('comment', '')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('favorites')
        .select('id, place_id, created_at, place:places(name, type)')
        .eq('user_id', friendId)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    setFriendReviews((reviewsRes.data as unknown as FriendReview[]) ?? [])
    setFriendFavorites((favoritesRes.data as unknown as FriendFavorite[]) ?? [])
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
            <input style={INPUT} type="text" placeholder="Ton prénom (aussi ton pseudo)"
              value={name} onChange={e => setName(e.target.value)} required />
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'rgba(31,58,95,0.45)' }}>
            Prénom / Pseudo
          </label>
          <input style={INPUT} type="text" placeholder="ex. Alex"
            value={editName} onChange={e => { setEditName(e.target.value); setError(null) }}
            minLength={2} maxLength={40} required />
          <p style={{ margin: 0, fontSize: 11, color: 'rgba(31,58,95,0.40)', fontWeight: 600, lineHeight: 1.4 }}>
            C’est ton nom affiché et ton identifiant unique — comme sur Snapchat.
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
      <form onSubmit={handleSaveName}
        style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input style={INPUT} type="text" placeholder="Ton prénom (ex. Alex)"
          value={newName} onChange={e => { setNewName(e.target.value); setError(null) }}
          minLength={2} maxLength={40} required />
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(31,58,95,0.45)', fontWeight: 600 }}>
          Ton prénom = ton pseudo unique. C’est comme ça que tes amis te retrouveront.
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
            onClick={() => { setEditName(profile?.display_name ?? profile?.username ?? ''); setError(null); setShowSettings(true) }}
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
              onClick={() => setShowAvatarChoice(true)}
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
            {/* Inputs cachés : galerie vs caméra */}
            <input ref={galleryInputRef} type="file" accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileForCrop(f) }} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="user"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileForCrop(f) }} />
          </div>
          <div>
            <p style={{ margin: 0, fontFamily: 'var(--font-bricolage)', fontWeight: 900, fontSize: 18, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              {displayNameResolved}
            </p>
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
                <div key={fav.id} style={{ ...CARD, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                  onClick={() => handleGoToPlace(fav.place_id)}>
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
                  <button onClick={e => { e.stopPropagation(); handleRemoveFavorite(fav.id) }}
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
                <div key={r.id} style={{ ...CARD, cursor: r.place_id ? 'pointer' : 'default' }}
                  onClick={() => { if (r.place_id) handleGoToPlace(r.place_id) }}>
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
                      onClick={e => { e.stopPropagation(); handleDeleteReview(r.id) }}
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
                    {r.comment ?? (r.photos && r.photos.length > 0 ? 'Photo partagée depuis HopSoleil' : 'Aucun commentaire')}
                  </p>
                  {Array.isArray(r.photos) && r.photos.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, overflowX: 'auto', paddingBottom: 2 }}>
                      {(r.photos as string[]).map((url, index) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={index} src={url} alt={`Photo avis ${index + 1}`} style={{ width: 100, height: 72, objectFit: 'cover', borderRadius: 14, flexShrink: 0 }} />
                      ))}
                    </div>
                  )}
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
                      background: s.avatar_url ? 'transparent' : 'rgba(237,193,69,0.18)', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 900, color: '#1F3A5F', overflow: 'hidden' }}>
                      {s.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={s.avatar_url} alt="" style={{ width: 30, height: 30, objectFit: 'cover' }} />
                        : s.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#1F3A5F' }}>
                      {s.display_name ?? s.username}
                    </p>
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
                    <div style={{ width: 36, height: 36, borderRadius: '50%',
                      background: req.requester?.avatar_url ? 'transparent' : 'rgba(237,193,69,0.20)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
                      fontWeight: 900, fontSize: 14, color: '#1F3A5F' }}>
                      {req.requester?.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={req.requester.avatar_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover' }} />
                        : req.requester?.display_name?.charAt(0)?.toUpperCase() ?? '👤'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1F3A5F' }}>
                        {req.requester?.display_name ?? req.requester?.username ?? '—'}
                      </p>
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
                      <div style={{ width: 36, height: 36, borderRadius: '50%',
                        background: p?.avatar_url ? 'transparent' : 'rgba(237,193,69,0.18)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        fontWeight: 900, fontSize: 14, color: '#1F3A5F', overflow: 'hidden' }}>
                        {p?.avatar_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={p.avatar_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover' }} />
                          : p?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1F3A5F' }}>
                          {p?.display_name ?? p?.username ?? '—'}
                        </p>
                      </div>
                      <span style={{ fontSize: 14, color: 'rgba(31,58,95,0.35)', transition: 'transform 200ms',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'block' }}>▾</span>
                    </div>
                    {isExpanded && (
                      <div style={{ ...CARD, marginBottom: 12,
                        borderTopLeftRadius: 0, borderTopRightRadius: 0,
                        borderTop: '1px solid rgba(31,58,95,0.06)', paddingTop: 10 }}>

                        {/* Onglets */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                          {(['likes', 'reviews'] as const).map(tab => (
                            <button key={tab} type="button"
                              onClick={() => setFriendProfileTab(tab)}
                              style={{
                                flex: 1, height: 32, borderRadius: 10, border: 'none', cursor: 'pointer',
                                fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 12,
                                background: friendProfileTab === tab ? '#1F3A5F' : 'rgba(31,58,95,0.07)',
                                color: friendProfileTab === tab ? '#EDC145' : 'rgba(31,58,95,0.60)',
                              }}>
                              {tab === 'likes' ? '♥️ Lieux likés' : '⭐ Avis'}
                            </button>
                          ))}
                        </div>

                        {friendProfileLoading ? (
                          <p style={{ margin: 0, fontSize: 12, textAlign: 'center', color: 'rgba(31,58,95,0.40)', fontWeight: 600 }}>Chargement…</p>
                        ) : friendProfileTab === 'likes' ? (
                          friendFavorites.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(31,58,95,0.40)', fontWeight: 600, textAlign: 'center' }}>Aucun lieu liké pour l’instant</p>
                          ) : (
                            friendFavorites.map(fav => (
                              <div key={fav.id} style={{ marginBottom: 8, paddingBottom: 8,
                                borderBottom: '1px solid rgba(31,58,95,0.06)',
                                cursor: 'pointer' }}
                                onClick={() => handleGoToPlace(fav.place_id)}>
                                <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#1F3A5F' }}>
                                  {placeEmoji(fav.place?.type ?? '')} {fav.place?.name ?? '—'} <span style={{ fontSize: 10, color: 'rgba(31,58,95,0.35)' }}>→</span>
                                </p>
                              </div>
                            ))
                          )
                        ) : (
                          friendReviews.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 12, color: 'rgba(31,58,95,0.40)', fontWeight: 600, textAlign: 'center' }}>Aucun avis public pour l’instant</p>
                          ) : (
                            friendReviews.map(r => (
                              <div key={r.id} style={{ marginBottom: 8, paddingBottom: 8,
                                borderBottom: '1px solid rgba(31,58,95,0.06)',
                                cursor: r.place_id ? 'pointer' : 'default' }}
                                onClick={() => { if (r.place_id) handleGoToPlace(r.place_id) }}>
                                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#1F3A5F' }}>
                                  {placeEmoji(r.place?.type ?? '')} {r.place?.name ?? '—'} {r.place_id && <span style={{ fontSize: 10, color: 'rgba(31,58,95,0.35)' }}>→</span>}
                                </p>
                                {r.comment && (
                                  <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(31,58,95,0.70)',
                                    fontWeight: 600, lineHeight: 1.4 }}>
                                    {r.comment}
                                  </p>
                                )}
                              </div>
                            ))
                          )
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
                      background: req.addressee?.avatar_url ? 'transparent' : 'rgba(237,193,69,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, fontWeight: 900, fontSize: 14, color: '#1F3A5F', overflow: 'hidden' }}>
                      {req.addressee?.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={req.addressee.avatar_url} alt="" style={{ width: 36, height: 36, objectFit: 'cover' }} />
                        : req.addressee?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#1F3A5F' }}>
                        {req.addressee?.display_name ?? req.addressee?.username ?? '—'}
                      </p>
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

      {/* ── CHOICE MODAL : appareil photo ou galerie ────────────────────────── */}
      {showAvatarChoice && (
        <div
          onClick={() => setShowAvatarChoice(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, background: '#FFF8EC',
              borderTopLeftRadius: 22, borderTopRightRadius: 22,
              padding: '18px 20px 32px', fontFamily: 'var(--font-outfit)' }}>
            <p style={{ margin: '0 0 16px', fontWeight: 900, fontSize: 15, color: '#1F3A5F', textAlign: 'center' }}>
              Choisir une photo de profil
            </p>
            <button
              onClick={() => { setShowAvatarChoice(false); setTimeout(() => cameraInputRef.current?.click(), 50) }}
              style={{ width: '100%', height: 50, marginBottom: 10, borderRadius: 14,
                background: '#1F3A5F', color: '#EDC145', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-outfit)', fontWeight: 900, fontSize: 15,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <Camera size={18} strokeWidth={2.2} /> Prendre une photo
            </button>
            <button
              onClick={() => { setShowAvatarChoice(false); setTimeout(() => galleryInputRef.current?.click(), 50) }}
              style={{ width: '100%', height: 50, marginBottom: 10, borderRadius: 14,
                background: 'rgba(31,58,95,0.08)', color: '#1F3A5F',
                border: '1.5px solid rgba(31,58,95,0.14)', cursor: 'pointer',
                fontFamily: 'var(--font-outfit)', fontWeight: 800, fontSize: 15,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              🖼️ Choisir depuis la galerie
            </button>
            <button
              onClick={() => setShowAvatarChoice(false)}
              style={{ width: '100%', height: 42, borderRadius: 14, border: 'none', cursor: 'pointer',
                background: 'transparent', fontFamily: 'var(--font-outfit)', fontWeight: 700,
                fontSize: 14, color: 'rgba(31,58,95,0.50)' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* ── CROP MODAL ──────────────────────────────────────────────────────── */}
      {cropSrc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9100,
          background: 'rgba(11,25,46,0.96)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', fontFamily: 'var(--font-outfit)',
          padding: '0 24px' }}>

          <p style={{ margin: '0 0 20px', color: '#fff', fontWeight: 800, fontSize: 15 }}>
            Recadrer la photo
          </p>

          {/* Zone de prévisualisation circulaire — background-image (pas de transform sur img géant) */}
          <div
            style={{
              width: CROP_PREVIEW, height: CROP_PREVIEW,
              borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              outline: '3px solid rgba(255,255,255,0.55)',
              cursor: 'grab', userSelect: 'none', touchAction: 'none',
              backgroundImage: `url(${cropSrc})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${Math.round(cropNaturalRef.current.w * cropScale)}px ${Math.round(cropNaturalRef.current.h * cropScale)}px`,
              backgroundPosition: [
                `${Math.round(CROP_PREVIEW / 2 + cropOffset.x - (cropNaturalRef.current.w * cropScale) / 2)}px`,
                `${Math.round(CROP_PREVIEW / 2 + cropOffset.y - (cropNaturalRef.current.h * cropScale) / 2)}px`,
              ].join(' '),
            }}
            onPointerDown={e => {
              cropDragRef.current = { sx: e.clientX, sy: e.clientY, ox: cropOffset.x, oy: cropOffset.y }
              ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={e => {
              if (!cropDragRef.current) return
              setCropOffset({
                x: cropDragRef.current.ox + (e.clientX - cropDragRef.current.sx),
                y: cropDragRef.current.oy + (e.clientY - cropDragRef.current.sy),
              })
            }}
            onPointerUp={() => { cropDragRef.current = null }}
            onWheel={e => {
              e.preventDefault()
              const minS = Math.max(CROP_PREVIEW / cropNaturalRef.current.w, CROP_PREVIEW / cropNaturalRef.current.h)
              setCropScale(s => Math.max(minS, Math.min(s * (e.deltaY < 0 ? 1.08 : 0.93), minS * 10)))
            }}
          />

          {/* Slider zoom — accessible sur mobile comme sur desktop */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, width: CROP_PREVIEW }}>
            <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.50)', lineHeight: 1, flexShrink: 0 }}>−</span>
            <input
              type="range"
              min={Math.max(CROP_PREVIEW / cropNaturalRef.current.w, CROP_PREVIEW / cropNaturalRef.current.h)}
              max={Math.max(CROP_PREVIEW / cropNaturalRef.current.w, CROP_PREVIEW / cropNaturalRef.current.h) * 4}
              step={0.001}
              value={cropScale}
              onChange={e => setCropScale(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#EDC145', cursor: 'pointer', height: 4 }}
              aria-label="Zoom"
            />
            <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.50)', lineHeight: 1, flexShrink: 0 }}>+</span>
          </div>

          <p style={{ margin: '12px 0 22px', fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 600 }}>
            Glisse pour cadrer · ajuste le zoom
          </p>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => { setCropSrc(null) }}
              style={{ height: 46, padding: '0 24px', borderRadius: 14,
                background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.20)',
                color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                fontFamily: 'var(--font-outfit)' }}>
              Annuler
            </button>
            <button
              onClick={handleCropConfirm}
              disabled={avatarUploading}
              style={{ height: 46, padding: '0 28px', borderRadius: 14,
                background: '#EDC145', border: 'none', color: '#1F3A5F',
                cursor: 'pointer', fontWeight: 900, fontSize: 15,
                fontFamily: 'var(--font-outfit)',
                boxShadow: '0 6px 20px rgba(237,193,69,0.40)',
                opacity: avatarUploading ? 0.7 : 1 }}>
              {avatarUploading ? 'Enregistrement…' : 'Valider ✓'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

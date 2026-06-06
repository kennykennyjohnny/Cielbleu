'use client'

/**
 * PwaInstallPrompt — invite à installer HopSoleil comme application.
 *
 * Comportements :
 *   • Android/Chrome/Edge : capte `beforeinstallprompt`, affiche une bannière
 *     avec un bouton "Installer". Déclenche le prompt natif au clic.
 *   • iOS (Safari) : `beforeinstallprompt` n'existe pas. On affiche des
 *     instructions "Partager → Sur l'écran d'accueil".
 *   • Masqué définitivement si l'utilisateur l'a déjà installé ou ignoré
 *     (localStorage `pwa_dismissed`).
 *   • Masqué si déjà en mode standalone (l'app est déjà installée).
 */

import { useEffect, useState } from 'react'
import { X, Share, Plus, Download } from 'lucide-react'

type Platform = 'android' | 'ios' | null

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PwaInstallPrompt() {
  const [platform, setPlatform]   = useState<Platform>(null)
  const [visible,  setVisible]    = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Déjà installé en standalone → ne pas afficher
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window.navigator as any).standalone === true) return

    // Déjà ignoré
    if (localStorage.getItem('pwa_dismissed')) return

    const ua = navigator.userAgent
    const isIos = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window)
    const isAndroidChrome = /Android/.test(ua)

    if (isIos) {
      // iOS : montrer après 4 s (le site doit d'abord se charger)
      const t = setTimeout(() => {
        setPlatform('ios')
        setVisible(true)
      }, 4000)
      return () => clearTimeout(t)
    }

    if (isAndroidChrome) {
      const handler = (e: Event) => {
        e.preventDefault()
        setDeferredPrompt(e as BeforeInstallPromptEvent)
        setPlatform('android')
        setVisible(true)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }

    // Desktop Chrome/Edge : écoute aussi
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setPlatform('android') // même flow que Android
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const dismiss = () => {
    setVisible(false)
    localStorage.setItem('pwa_dismissed', '1')
  }

  const install = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') localStorage.setItem('pwa_dismissed', '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Installer HopSoleil"
      style={{
        position: 'fixed',
        bottom: 96,          // au-dessus de la barre de filtres
        left: 12,
        right: 12,
        zIndex: 9999,
        background: '#1F3A5F',
        borderRadius: 18,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        animation: 'slideUpPwa 0.35s cubic-bezier(.22,1,.36,1)',
      }}
    >
      {/* Icône app */}
      <img
        src="/favicon-vdef.png"
        alt="HopSoleil"
        width={44}
        height={44}
        style={{ borderRadius: 10, flexShrink: 0 }}
      />

      {/* Texte */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0,
          fontSize: 13.5,
          fontWeight: 700,
          color: '#ffffff',
          fontFamily: 'var(--font-outfit)',
          lineHeight: 1.3,
        }}>
          Ajouter à l&apos;écran d&apos;accueil
        </p>
        {platform === 'ios' ? (
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.70)', fontFamily: 'var(--font-outfit)', lineHeight: 1.4 }}>
            Tape <Share size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> puis «&nbsp;Sur l&apos;écran d&apos;accueil&nbsp;» <Plus size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
          </p>
        ) : (
          <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.70)', fontFamily: 'var(--font-outfit)', lineHeight: 1.4 }}>
            Accès rapide, sans passer par le navigateur
          </p>
        )}
      </div>

      {/* Bouton install (Android/Desktop) */}
      {platform === 'android' && (
        <button
          onClick={install}
          style={{
            flexShrink: 0,
            background: '#FFBE0B',
            color: '#1F3A5F',
            border: 'none',
            borderRadius: 999,
            padding: '7px 14px',
            fontSize: 12.5,
            fontWeight: 700,
            fontFamily: 'var(--font-outfit)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Download size={13} />
          Installer
        </button>
      )}

      {/* Fermer */}
      <button
        onClick={dismiss}
        aria-label="Fermer"
        style={{
          flexShrink: 0,
          background: 'rgba(255,255,255,0.12)',
          border: 'none',
          borderRadius: '50%',
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.75)',
        }}
      >
        <X size={14} />
      </button>

      <style>{`
        @keyframes slideUpPwa {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

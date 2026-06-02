// ── Ouverture de cartes dans l'APPLI native (pas le site web) ─────────────────
// Problème résolu ici : un lien `https://www.google.com/maps/...?api=1` est un
// « universal link » qui n'ouvre l'appli Google Maps QUE sur une navigation
// plein écran (top-frame). Ouvert via `target="_blank"` / `window.open`, iOS
// l'ouvre dans Safari → l'utilisateur tombe sur le site web au lieu de l'appli.
//
// Stratégie :
//   • iOS    → on tente le scheme `comgooglemaps://` (appli Google Maps). S'il
//              n'est pas installé, on retombe sur le lien web après un court délai.
//   • Android→ navigation top-frame vers l'App Link Google Maps : Android ouvre
//              directement l'appli quand elle est installée.
//   • Desktop→ nouvel onglet vers le site web.

export interface MapTarget {
  lat: number
  lng: number
  name?: string
  placeId?: string | null
}

export type MapMode = 'view' | 'directions' | 'streetview'

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS 13+ se présente comme « MacIntel » mais avec un écran tactile.
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/.test(navigator.userAgent)
}

/** Lien web universel (?api=1) — toujours valide, sert de fallback et au desktop. */
export function webMapsUrl(t: MapTarget, mode: MapMode = 'view'): string {
  const ll = `${t.lat}%2C${t.lng}`
  if (mode === 'directions') {
    const pid = t.placeId ? `&destination_place_id=${t.placeId}` : ''
    return `https://www.google.com/maps/dir/?api=1&destination=${ll}${pid}&travelmode=walking`
  }
  if (mode === 'streetview') {
    return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}`
  }
  if (t.placeId) {
    const q = encodeURIComponent(t.name ? `${t.name}` : `${t.lat},${t.lng}`)
    return `https://www.google.com/maps/search/?api=1&query=${q}&query_place_id=${t.placeId}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${ll}`
}

/** Scheme natif Google Maps (iOS). null si non pertinent. */
function iosAppUrl(t: MapTarget, mode: MapMode): string {
  const center = `${t.lat},${t.lng}`
  if (mode === 'directions') {
    return `comgooglemaps://?daddr=${center}&directionsmode=walking`
  }
  if (mode === 'streetview') {
    return `comgooglemaps://?center=${center}&mapmode=streetview`
  }
  const q = encodeURIComponent(t.name ?? center)
  return `comgooglemaps://?q=${q}&center=${center}&zoom=17`
}

/**
 * Tente d'ouvrir une URL de scheme natif ; si l'appli ne prend pas la main
 * (page toujours visible après le délai), bascule sur le lien web.
 */
function deepLinkWithFallback(appUrl: string, webUrl: string): void {
  let appOpened = false
  const markOpened = () => { appOpened = true }

  // Quand l'appli s'ouvre, l'onglet passe en arrière-plan → on annule le fallback.
  document.addEventListener('visibilitychange', markOpened, { once: true })
  window.addEventListener('pagehide', markOpened, { once: true })
  window.addEventListener('blur', markOpened, { once: true })

  const timer = window.setTimeout(() => {
    document.removeEventListener('visibilitychange', markOpened)
    window.removeEventListener('pagehide', markOpened)
    window.removeEventListener('blur', markOpened)
    if (!appOpened && document.visibilityState === 'visible') {
      window.location.href = webUrl
    }
  }, 1300)

  try {
    window.location.href = appUrl
  } catch {
    window.clearTimeout(timer)
    window.location.href = webUrl
  }
}

/**
 * Ouvre la cible cartographique dans la meilleure cible disponible.
 * À appeler depuis un onClick : `onClick={(e) => { e.preventDefault(); openMaps(t) }}`.
 * Garder un `href={webMapsUrl(t, mode)}` sur le `<a>` pour l'accessibilité,
 * le clic droit et le SEO.
 */
export function openMaps(t: MapTarget, mode: MapMode = 'view'): void {
  const web = webMapsUrl(t, mode)
  if (isIOS()) {
    deepLinkWithFallback(iosAppUrl(t, mode), web)
    return
  }
  if (isAndroid()) {
    // Navigation top-frame : l'App Link Google Maps ouvre l'appli si installée.
    window.location.href = web
    return
  }
  window.open(web, '_blank', 'noopener,noreferrer')
}

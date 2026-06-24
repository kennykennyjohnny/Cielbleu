import type { NextConfig } from 'next'

// ── Content-Security-Policy ──────────────────────────────────────────────────
// CSP PRAGMATIQUE : assez stricte pour bloquer les vecteurs XSS réels (script
// externe injecté, framing/clickjacking, <object>/<embed>, détournement de
// base-uri / form-action) MAIS sans casser l'app Mapbox.
//   • Aucun script externe n'est chargé (Mapbox GL est bundlé via npm, pas de
//     CDN) → script-src 'self' + inline (JSON-LD / runtime Next) + eval + blob
//     (workers Mapbox). On NE whiteliste donc aucune origine de script tierce.
//   • Mapbox/Supabase/Google passent par img/connect → on autorise https/wss
//     largement (non bloquant) tout en interdisant http en clair.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "frame-src 'self'",
  'upgrade-insecure-requests',
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Force HTTPS (Vercel sert déjà en HTTPS).
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Empêche le MIME-sniffing.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Anti-clickjacking (doublé par frame-ancestors du CSP).
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Ne fuit pas l'URL complète vers les sites tiers.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Coupe les API navigateur sensibles, garde la géoloc pour le bouton « me localiser ».
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), browsing-topics=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false, // n'expose pas « X-Powered-By: Next.js »
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'maps.googleapis.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig

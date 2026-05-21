import type { Metadata, Viewport } from 'next'
import { Fraunces, Outfit } from 'next/font/google'
import '../styles/globals.css'

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces-var',
  weight: ['500', '600', '700', '800'],
  style: ['normal', 'italic'],
  display: 'swap',
})

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit-var',
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HopSoleil — Trouve ta terrasse au soleil à Paris',
  description:
    'Le radar des terrasses ensoleillées à Paris. Score soleil temps réel, vue 3D, fenêtre d’ensoleillement.',
  metadataBase: new URL('https://hopsoleil.fr'),
  openGraph: {
    title: 'HopSoleil ☀',
    description: 'Le radar des terrasses ensoleillées à Paris.',
    url: 'https://hopsoleil.fr',
    siteName: 'HopSoleil',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'HopSoleil' }],
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HopSoleil ☀',
    description: 'Le radar des terrasses ensoleillées à Paris.',
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2f9bff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${fraunces.variable} ${outfit.variable}`}>{children}</body>
    </html>
  )
}

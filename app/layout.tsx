import type { Metadata } from 'next'
import { Playfair_Display, Outfit } from 'next/font/google'
import '../styles/globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair-var',
  weight: ['700'],
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
  title: 'CielBleu — Trouve ta terrasse au soleil à Paris',
  description:
    'La carte des terrasses ensoleillées à Paris en temps réel. Score soleil calculé par algo, confirmé par la communauté.',
  metadataBase: new URL('https://cielbleu.fr'),
  openGraph: {
    title: 'CielBleu ☀',
    description: 'Terrasses au soleil à Paris — en temps réel',
    url: 'https://cielbleu.fr',
    siteName: 'CielBleu',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'CielBleu' }],
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CielBleu ☀',
    description: 'Terrasses au soleil à Paris — en temps réel',
    images: ['/og-image.png'],
  },
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  themeColor: '#FFBE0B',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${playfair.variable} ${outfit.variable}`}>{children}</body>
    </html>
  )
}

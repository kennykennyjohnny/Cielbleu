import { loadFont as loadOutfit } from '@remotion/google-fonts/Outfit'
import { loadFont as loadBricolage } from '@remotion/google-fonts/BricolageGrotesque'

// Polices de la marque (chargées par Remotion). On limite aux graisses/subsets
// réellement utilisés → moins de requêtes, rendu plus rapide.
export const { fontFamily: OUTFIT } = loadOutfit('normal', {
  weights: ['600', '700', '800', '900'], subsets: ['latin'],
})
export const { fontFamily: BRICOLAGE } = loadBricolage('normal', {
  weights: ['700', '800'], subsets: ['latin'],
})

// Palette DA CielBleu.
export const COLORS = {
  navy:   '#1F3A5F',
  gold:   '#EDC145',
  goldSoft: '#FFE89A',
  cream:  '#FFF8EC',
  paper:  '#FFFCF3',
  ciel:   '#4EA3FF',
  cielDeep: '#2D83E6',
  corail: '#FF6B5A',
  white:  '#FFFFFF',
  ink:    '#142033',
}

// Marque (faciles à changer pour HopSoleil si besoin).
export const BRAND = 'CielBleu'
export const URL = 'cielbleu.fr'

// Format Instagram (Reels / Stories) — 9:16.
export const VIDEO = { width: 1080, height: 1920, fps: 30, durationInFrames: 300 }

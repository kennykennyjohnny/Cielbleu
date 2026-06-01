import type { CSSProperties } from 'react'
import { Beer, UtensilsCrossed, Coffee, Trees, type LucideIcon } from 'lucide-react'

// ── Icône de catégorie unifiée (cohérente avec la marque) ────────────────────
// Remplace les emoji 🍺 🍽 ☕ 🌳 par des pictogrammes Lucide, au trait, dans le
// même langage visuel que le reste de l'UI (Search, Heart, Clock…).

const ICON_BY_TYPE: Record<string, LucideIcon> = {
  bar: Beer,
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  park: Trees,
}

interface Props {
  type: string
  size?: number
  strokeWidth?: number
  color?: string
  style?: CSSProperties
}

export default function PlaceTypeIcon({ type, size = 16, strokeWidth = 2.1, color, style }: Props) {
  const Icon = ICON_BY_TYPE[type] ?? UtensilsCrossed
  return <Icon size={size} strokeWidth={strokeWidth} color={color} style={style} aria-hidden="true" />
}

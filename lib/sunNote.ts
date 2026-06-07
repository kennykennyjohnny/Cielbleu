/**
 * Note soleil sur 10 — traduction lisible du score interne (0–5) en une note
 * grand public « /10 » qui répond directement à : cette terrasse est-elle au
 * soleil maintenant ?
 */
import type { Place } from '@/types'

export function sunNote10(score?: number | null): number {
  if (score == null) return 0
  return Math.round(Math.max(0, Math.min(5, score)) * 2)
}

/** Couleur de la note (cohérente avec les parasols de la carte). */
export function noteColor(note: number): string {
  if (note >= 8) return '#F49000' // plein soleil — or chaud
  if (note >= 6) return '#FFBE0B' // bien ensoleillé — jaune marque
  if (note >= 4) return '#C9A24B' // mitigé — ambre terne
  return '#8694A6'                 // ombre — gris-bleu
}

/** Libellé court qualitatif. */
export function noteLabel(note: number): string {
  if (note >= 8) return 'Plein soleil'
  if (note >= 6) return 'Ensoleillé'
  if (note >= 4) return 'Mi-ombre'
  return 'À l’ombre'
}

const R = 6_371_000
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLng = ((bLng - aLng) * Math.PI) / 180
  const la1 = (aLat * Math.PI) / 180
  const la2 = (bLat * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

/** Coordonnée la plus pertinente d'un lieu (terrasse si connue, sinon le lieu). */
export function placeCoord(p: Place): [number, number] {
  return [p.terrace_lat ?? p.lat, p.terrace_lng ?? p.lng]
}

/**
 * Terrasses ensoleillées recommandées à proximité d'un point.
 * - has_terrace uniquement
 * - note ≥ minNote
 * - triées : note décroissante, puis distance croissante
 */
export function recommendSunnyTerraces(
  places: Place[],
  opts: { nearLat?: number; nearLng?: number; excludeId?: string; minNote?: number; maxDistanceM?: number; limit?: number } = {},
): Place[] {
  const { nearLat, nearLng, excludeId, minNote = 7, maxDistanceM = Infinity, limit = 8 } = opts
  const scored = places
    .filter(p => p.has_terrace === true && p.id !== excludeId)
    .map(p => {
      const note = sunNote10(p.currentScore)
      const [la, lo] = placeCoord(p)
      const dist = nearLat != null && nearLng != null ? distanceM(nearLat, nearLng, la, lo) : 0
      return { p, note, dist }
    })
    .filter(x => x.note >= minNote && x.dist <= maxDistanceM)
    .sort((a, b) => b.note - a.note || a.dist - b.dist)
  return scored.slice(0, limit).map(x => x.p)
}

// Algorithme d'ensoleillement CielBleu
// Données bâtiments : https://opendata.paris.fr/explore/dataset/volumesbatisparis/
// Format attendu dans data/buildings.json : [{ lat, lng, height }]

import { getSunPosition } from './suncalc'
import type { Building } from '@/types'

const SHADOW_RADIUS_M = 200
const SUN_AZIMUTH_TOLERANCE = Math.PI / 6 // ±30°

// Distance en mètres entre deux points GPS (formule haversine)
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Bearing (azimut) du point 1 vers le point 2, en radians
function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180)
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(dLng)
  return Math.atan2(y, x)
}

function angleDiff(a: number, b: number): number {
  const diff = Math.abs(((a - b + Math.PI) % (2 * Math.PI)) - Math.PI)
  return diff
}

export interface SunScoreResult {
  score: number // 1-5
  isNight: boolean
  shadowFactor: number // 0 = plein soleil, 1 = ombre totale
  sunAltitudeDeg: number
}

export function calculateSunScore(
  lat: number,
  lng: number,
  date: Date,
  buildings: Building[],
  cloudCoverPercent?: number
): SunScoreResult {
  const pos = getSunPosition(date, lat, lng)
  const sunAltitudeDeg = (pos.altitude * 180) / Math.PI

  // Nuit
  if (pos.altitude <= 0) {
    return { score: 0, isNight: true, shadowFactor: 1, sunAltitudeDeg }
  }

  // Couverture nuageuse > 80% → score 1
  if (cloudCoverPercent !== undefined && cloudCoverPercent > 80) {
    return { score: 1, isNight: false, shadowFactor: 0.9, sunAltitudeDeg }
  }

  // Calcul des ombres portées par les bâtiments proches
  let maxShadowFactor = 0

  for (const building of buildings) {
    const dist = distanceMeters(lat, lng, building.lat, building.lng)
    if (dist > SHADOW_RADIUS_M || dist < 1) continue

    const buildingBearing = bearing(lat, lng, building.lat, building.lng)
    // SunCalc azimut : 0 = sud, PI/2 = ouest
    // On normalise pour la comparaison
    const diff = angleDiff(buildingBearing, pos.azimuth)

    if (diff > SUN_AZIMUTH_TOLERANCE) continue

    // Longueur de l'ombre projetée
    const shadowLength = building.height / Math.tan(pos.altitude)

    if (dist < shadowLength) {
      // La terrasse est dans l'ombre — intensité selon la profondeur
      const factor = 1 - dist / shadowLength
      if (factor > maxShadowFactor) maxShadowFactor = factor
    }
  }

  // Sans données bâtiments : score basé sur l'altitude solaire uniquement
  let baseScore: number
  if (sunAltitudeDeg < 5) baseScore = 2
  else if (sunAltitudeDeg < 15) baseScore = 3
  else if (sunAltitudeDeg < 35) baseScore = 4
  else baseScore = 5

  // Réduction par l'ombre des bâtiments
  const shadowReduction = Math.round(maxShadowFactor * 4)
  let score = Math.max(1, Math.min(5, baseScore - shadowReduction))

  // Légère réduction si partiellement nuageux (40-80%)
  if (cloudCoverPercent !== undefined && cloudCoverPercent > 40) {
    score = Math.max(1, score - 1)
  }

  return { score, isNight: false, shadowFactor: maxShadowFactor, sunAltitudeDeg }
}

/**
 * Pondère un score d'ensoleillement (0-5, calculé sans météo) par la couverture
 * nuageuse réelle de l'instant.
 *
 * Les `sun_scores` stockés en base sont un *potentiel ciel clair* : géométrie
 * soleil + ombres des bâtiments, figés par mois. Le ciel ne change pas cette
 * géométrie, mais il change ce qu'on ressent : sous une couche épaisse, "plein
 * soleil" n'existe pas. On applique donc la météo comme une couche temps réel
 * par-dessus le potentiel, côté client — c'est ce qui rend le score vraiment
 * "temps réel" sans recalculer toute la base.
 *
 *   • nuit (score 0)            : inchangé (la météo n'invente pas de soleil)
 *   • cloudCover ≤ 55 % (dégagé/épars/mi-nuageux) : inchangé — le soleil perce
 *   • 55-75 % (nuageux)         : −1
 *   • 75-90 % (très nuageux)    : −2
 *   • > 90 %  (vraiment couvert) : plafonné à 1
 *
 * Seuils volontairement INDULGENTS : un ciel à moitié couvert laisse passer le
 * soleil ; on ne « cache » une terrasse que par couverture franche. (Avant :
 * pénalité dès 45 %, plafond dès 85 % → trop strict, terrasses ensoleillées
 * masquées par quelques nuages.)
 *
 * cloudCover absent (null/undefined) → on ne touche pas au score.
 */
export function cloudAdjustedScore(score: number, cloudCover?: number | null): number {
  if (score <= 0) return score
  if (cloudCover == null) return score
  if (cloudCover > 90) return 1
  if (cloudCover > 75) return Math.max(1, score - 2)
  if (cloudCover > 55) return Math.max(1, score - 1)
  return score
}

// Calcule les scores pour tous les créneaux de 30min d'un mois donné
// Utilisé par le cron job de pré-calcul
export function precomputeMonthlyScores(
  lat: number,
  lng: number,
  month: number, // 1-12
  year: number,
  buildings: Building[],
  cloudCoverPercent?: number
): { time_slot: string; score: number }[] {
  // Jour représentatif du mois (le 15)
  const date = new Date(year, month - 1, 15)
  const results: { time_slot: string; score: number }[] = []

  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      date.setHours(h, m, 0, 0)
      const result = calculateSunScore(lat, lng, new Date(date), buildings, cloudCoverPercent)
      results.push({
        time_slot: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        score: result.isNight ? 0 : result.score,
      })
    }
  }

  return results
}

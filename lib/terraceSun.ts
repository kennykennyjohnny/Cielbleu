/**
 * terraceSunScore — score soleil (0–5) calculé EN DIRECT pour une terrasse
 * à une heure donnée, à partir de :
 *   • la position réelle du soleil (SunCalc) AUX coordonnées de la terrasse
 *   • l'orientation de la terrasse : elle est sur le trottoir, devant la façade.
 *     Quand le soleil est du côté rue (terrasse exposée) → plein soleil ;
 *     quand il passe derrière la façade → la terrasse est à l'ombre du bâtiment.
 *   • la hauteur du soleil (rasant = plus faible, masqué plus facilement)
 *   • la couverture nuageuse en temps réel
 *
 * C'est volontairement géométrique et léger (calculable pour des milliers de
 * terrasses, à chaque changement d'heure) tout en étant ancré dans la réalité :
 * la direction « ouverte » vient du vecteur lieu→terrasse (open data Paris) ou,
 * à défaut, du bearing de façade précalculé.
 */
import type { Place } from '@/types'
import { getSunPosition } from '@/lib/suncalc'

const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

/**
 * Direction (deg compass, 0=N) vers laquelle la terrasse est « ouverte » (la rue).
 * Stratégie fiable :
 *   • AXE de la façade = terrace_bearing (précalculé sur les vrais bâtiments) —
 *     beaucoup plus stable que le vecteur bar→terrasse seul.
 *   • CÔTÉ rue (laquelle des 2 perpendiculaires) = donné par le vecteur
 *     bar→terrasse s'il est franc (≥ 4 m), sinon le côté le plus au sud.
 *   • Pas de bearing → on retombe sur le vecteur, puis sud.
 */
function openDirectionDeg(p: Place): number {
  const tLat = p.terrace_lat ?? p.lat
  const tLng = p.terrace_lng ?? p.lng

  // Vecteur bar→terrasse (côté rue) — seulement s'il est assez franc
  let vecDeg: number | null = null
  const cosLat = Math.cos((p.lat * Math.PI) / 180)
  const dx = (tLng - p.lng) * cosLat
  const dy = tLat - p.lat
  const distM = Math.hypot(dx, dy) * 111_320
  if (distM >= 4) vecDeg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360

  if (p.terrace_bearing != null) {
    const n1 = (p.terrace_bearing + 90) % 360
    const n2 = (p.terrace_bearing + 270) % 360
    if (vecDeg != null) {
      // normale la plus alignée avec le côté rue observé
      return angDiff(n1, vecDeg) <= angDiff(n2, vecDeg) ? n1 : n2
    }
    // sinon : côté le plus au sud (meilleure expo par défaut)
    return angDiff(n1, 180) <= angDiff(n2, 180) ? n1 : n2
  }
  return vecDeg ?? 180
}

export function terraceSunScore(p: Place, date: Date, cloudCover?: number | null): number {
  const tLat = p.terrace_lat ?? p.lat
  const tLng = p.terrace_lng ?? p.lng
  const pos = getSunPosition(date, tLat, tLng)
  const altDeg = (pos.altitude * 180) / Math.PI
  if (altDeg <= 0.5) return 0 // soleil couché

  // Azimut solaire en compass (0=N, 90=E…). SunCalc: 0=sud, +ouest.
  const sunAz = ((pos.azimuth * 180) / Math.PI + 180) % 360
  const openDeg = openDirectionDeg(p)

  // Écart angulaire entre le soleil et la direction « ouverte » (0 = soleil pile
  // en face de la terrasse ; 180 = soleil derrière la façade).
  const diff = Math.abs(((sunAz - openDeg + 540) % 360) - 180)
  const exposure = Math.cos((diff * Math.PI) / 180) // 1 (plein face) … -1 (derrière)

  // Atténuation par hauteur du soleil (rasant = plus faible) — continue, pas de
  // paliers → la note évolue en douceur quand on bouge le curseur.
  const altF = Math.max(0.32, Math.min(1, altDeg / 35))

  // Exposition directionnelle : 1 = soleil pile en face, 0 = derrière la façade.
  const dir = Math.max(0, (exposure + 0.25) / 1.25)
  // Soleil zénithal : haut dans le ciel, il éclaire AUSSI les terrasses de côté
  // (la façade ne fait plus d'ombre longue). Monte de 0 (~18°) à ~0.6 (zénith).
  const overhead = Math.max(0, Math.min(1, (altDeg - 18) / 52)) * 0.6
  const light = Math.max(dir, overhead) // 0…1

  let score: number
  if (light <= 0.04) {
    // soleil franchement derrière le bâtiment et bas → ombre de la façade
    score = 1.2
  } else {
    score = (1.3 + 3.7 * light) * (0.5 + 0.5 * altF) // ~1.4 … 5
  }

  // Couverture nuageuse — atténuation MULTIPLICATIVE : les nuages baissent la
  // lumière mais préservent la hiérarchie d'orientation (un coin bien exposé
  // reste le plus lumineux, même par ciel voilé). Évite d'écraser tout à plat.
  //   ciel clair (≤25%)  → facteur ~1
  //   ciel couvert (100%) → facteur ~0.30
  if (cloudCover != null && cloudCover > 25) {
    const cloudF = Math.max(0.3, 1 - (cloudCover - 25) / 105)
    score = 1 + (score - 1) * cloudF
  }

  return Math.max(0, Math.min(5, score))
}

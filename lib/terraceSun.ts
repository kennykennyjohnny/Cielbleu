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

/** Direction (deg compass, 0=N) vers laquelle la terrasse est « ouverte » (la rue). */
function openDirectionDeg(p: Place): number {
  const tLat = p.terrace_lat ?? p.lat
  const tLng = p.terrace_lng ?? p.lng
  // 1) vecteur lieu(bar) → terrasse : pointe du bâtiment vers la rue (le plus fiable)
  if (Math.abs(tLat - p.lat) > 1e-7 || Math.abs(tLng - p.lng) > 1e-7) {
    const cosLat = Math.cos((p.lat * Math.PI) / 180)
    const dx = (tLng - p.lng) * cosLat
    const dy = tLat - p.lat
    return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360
  }
  // 2) à défaut : perpendiculaire à la façade, côté le plus ensoleillé (sud)
  if (p.terrace_bearing != null) {
    const a = p.terrace_bearing
    const n1 = (a + 90) % 360
    const n2 = (a + 270) % 360
    // on choisit la normale la plus proche du sud (180°) = meilleure expo
    const dTo = (x: number) => Math.abs(((x - 180 + 540) % 360) - 180)
    return dTo(n1) <= dTo(n2) ? n1 : n2
  }
  return 180 // sud par défaut
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

  // Atténuation par hauteur du soleil (rasant = plus faible / vite masqué)
  const altF =
    altDeg >= 35 ? 1 :
    altDeg >= 20 ? 0.9 :
    altDeg >= 10 ? 0.7 :
    altDeg >= 5  ? 0.5 : 0.32

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

  // Couverture nuageuse en direct
  if (cloudCover != null) {
    if (cloudCover > 85) score = Math.min(score, 1)
    else if (cloudCover > 65) score -= 2
    else if (cloudCover > 45) score -= 1
  }

  return Math.max(0, Math.min(5, score))
}

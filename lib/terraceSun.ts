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

/** Champs minimaux nécessaires pour orienter une terrasse vers la rue. */
export interface OpenDirInput {
  lat: number
  lng: number
  terraceLat?: number | null
  terraceLng?: number | null
  terraceBearing?: number | null
}

/**
 * Direction (deg compass, 0=N) vers laquelle la terrasse est « ouverte » (la rue).
 * SOURCE DE VÉRITÉ unique, réutilisée par le score, le parasol sur la carte ET
 * l'orientation de la caméra → les trois s'accordent toujours sur « où est la rue ».
 *
 * Stratégie fiable :
 *   • AXE de la façade = terraceBearing (précalculé sur les vrais bâtiments) —
 *     beaucoup plus stable que le vecteur bar→terrasse seul.
 *   • CÔTÉ rue (laquelle des 2 perpendiculaires) = donné par le vecteur
 *     bar→terrasse, mais SEULEMENT s'il pointe franchement EN TRAVERS de la
 *     façade (≥ 4 m ET ≥ 35° de l'axe). Un pin Google décalé LE LONG de la rue
 *     produit un vecteur ~parallèle à la façade : c'est du bruit, on l'ignore et
 *     on prend le côté le plus au sud (meilleure expo) — ça évite de coller le
 *     parasol / la caméra du mauvais côté (dans le bâtiment).
 *   • Pas de bearing → on retombe sur le vecteur, puis sud.
 */
export function openDirectionFrom(o: OpenDirInput): number {
  const tLat = o.terraceLat ?? o.lat
  const tLng = o.terraceLng ?? o.lng

  // Vecteur bar→terrasse (côté rue) — seulement s'il est assez franc
  let vecDeg: number | null = null
  const cosLat = Math.cos((o.lat * Math.PI) / 180)
  const dx = (tLng - o.lng) * cosLat
  const dy = tLat - o.lat
  const distM = Math.hypot(dx, dy) * 111_320
  if (distM >= 4) vecDeg = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360

  if (o.terraceBearing != null) {
    const n1 = (o.terraceBearing + 90) % 360
    const n2 = (o.terraceBearing + 270) % 360
    if (vecDeg != null) {
      // Le vecteur ne départage que s'il est franchement perpendiculaire à la
      // façade (sinon il longe la rue → ambigu, on n'y fait pas confiance).
      const axisDiff = Math.min(
        angDiff(vecDeg, o.terraceBearing),
        angDiff(vecDeg, (o.terraceBearing + 180) % 360),
      )
      if (axisDiff > 35) {
        return angDiff(n1, vecDeg) <= angDiff(n2, vecDeg) ? n1 : n2
      }
    }
    // sinon : côté le plus au sud (meilleure expo par défaut)
    return angDiff(n1, 180) <= angDiff(n2, 180) ? n1 : n2
  }
  return vecDeg ?? 180
}

/** Variante prenant directement un Place (raccourci interne + carte). */
export function openDirectionDeg(p: Place): number {
  return openDirectionFrom({
    lat: p.lat,
    lng: p.lng,
    terraceLat: p.terrace_lat,
    terraceLng: p.terrace_lng,
    terraceBearing: p.terrace_bearing,
  })
}

export function terraceSunScore(p: Place, date: Date, cloudCover?: number | null): number {
  const tLat = p.terrace_lat ?? p.lat
  const tLng = p.terrace_lng ?? p.lng
  const pos = getSunPosition(date, tLat, tLng)
  const altDeg = (pos.altitude * 180) / Math.PI
  if (altDeg <= 0.5) return 0 // soleil sous l'horizon → nuit, score 0

  // ── Modèle physique simple et intuitif ────────────────────────────────────
  // 1) Force du soleil = irradiance ∝ sin(hauteur). 0 à l'horizon, max au zénith.
  //    → arc journalier naturel : faible à l'aube/au crépuscule, fort à midi.
  const sinAlt = Math.sin(pos.altitude) // 0…1

  // 2) Soleil DIRECT reçu par la terrasse selon son orientation :
  //    exposure = cos(écart azimut soleil ↔ direction « ouverte » de la terrasse).
  //    direct = 1 quand le soleil est pile en face, 0 quand il passe derrière
  //    la façade (la terrasse est alors à l'ombre de son propre bâtiment).
  const sunAz = ((pos.azimuth * 180) / Math.PI + 180) % 360
  const openDeg = openDirectionDeg(p)
  const diff = Math.abs(((sunAz - openDeg + 540) % 360) - 180)
  const exposure = Math.cos((diff * Math.PI) / 180) // 1 … -1
  const direct = Math.max(0, exposure)              // 0 … 1

  // 3) Score = lumière ambiante du ciel (présente même à l'ombre, ↑ avec le soleil
  //    haut) + bonus de soleil DIRECT (↑ avec direct ET avec la hauteur du soleil).
  //    Plein soleil midi ≈ 5 · ombre de façade midi ≈ 2 · aube/crépuscule faible.
  const ambient = 0.8 + 1.2 * sinAlt                     // ~0.9 (aube) … ~2.0 (midi)
  const directBonus = 3.2 * direct * (0.35 + 0.65 * sinAlt) // 0 … ~3.2
  let score = ambient + directBonus                     // ~0.9 … ~5

  // Rampe crépuscule : soleil très bas (0→3°) → extinction douce vers 0.
  if (altDeg < 3) score *= altDeg / 3

  return clampScoreWithClouds(score, cloudCover)
}

/** Applique l'atténuation nuageuse + clamp 0–5. Factorisé pour réutilisation. */
function clampScoreWithClouds(rawScore: number, cloudCover?: number | null): number {
  let score = rawScore

  // Couverture nuageuse — atténuation MULTIPLICATIVE et VOLONTAIREMENT INDULGENTE.
  // Un ciel à moitié nuageux laisse passer largement le soleil sur une terrasse
  // bien orientée ; quelques nuages passagers ne doivent pas « éteindre » une
  // belle terrasse d'après-midi. On ne pénalise donc qu'au-delà de 50 %, en
  // douceur, avec un plancher haut (0,45) pour qu'une terrasse géométriquement au
  // soleil reste « lumineuse » même par temps voilé. L'atténuation préserve la
  // hiérarchie d'orientation (le coin le mieux exposé reste le plus lumineux).
  //   ciel dégagé / épars (≤50%) → facteur 1 (aucune pénalité)
  //   ciel couvert (100%)        → facteur 0,45
  // (Avant : pénalité dès 25 %, plancher 0,30 → terrasses au soleil injustement
  //  éteintes par une couche de nuages partielle.)
  if (cloudCover != null && cloudCover > 50) {
    const cloudF = Math.max(0.45, 1 - 0.55 * (cloudCover - 50) / 50)
    score = 1 + (score - 1) * cloudF
  }

  return Math.max(0, Math.min(5, score))
}

/** Construit une Date à l'heure décimale donnée (aujourd'hui). */
function dateAtHour(hour: number): Date {
  const d = new Date()
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0)
  return d
}

/**
 * Score soleil live (0–5) d'une terrasse à une heure décimale donnée.
 * Raccourci pratique pour les composants : même modèle que terraceSunScore,
 * c'est la SOURCE UNIQUE de la note /10 (bandes de recos ET fiche ouverte) →
 * la note affichée dans une bande == la note affichée quand on clique. C'était
 * la cause des « fausses notes » : la fiche dérivait sa note d'un autre calcul.
 */
export function terraceScoreAtHour(p: Place, hour: number, cloudCover?: number | null): number {
  return terraceSunScore(p, dateAtHour(hour), cloudCover)
}

/**
 * Fenêtre d'ensoleillement de la journée calculée avec le MÊME modèle live que
 * la note (terraceSunScore). Renvoie le plus long créneau continu où le score
 * dépasse `threshold` (défaut 3.5 ≈ note 7, « ensoleillé »). Cohérent avec la
 * note affichée — fini les « Soleil 14h→18h » contredits par une note basse.
 */
export function terraceSunWindow(
  p: Place,
  cloudCover?: number | null,
  threshold = 3.5,
): { fromSlot: string; toSlot: string } | null {
  const slots: { slot: string; lit: boolean }[] = []
  const d = new Date()
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 30]) {
      d.setHours(h, m, 0, 0)
      const s = terraceSunScore(p, new Date(d), cloudCover)
      slots.push({ slot: `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`, lit: s >= threshold })
    }
  }
  let best = { start: -1, end: -1, len: 0 }
  let cur = { start: -1, len: 0 }
  for (let i = 0; i < slots.length; i++) {
    if (slots[i].lit) {
      if (cur.start < 0) cur.start = i
      cur.len++
      if (cur.len > best.len) best = { start: cur.start, end: i, len: cur.len }
    } else {
      cur = { start: -1, len: 0 }
    }
  }
  if (best.len === 0 || best.start < 0) return null
  return { fromSlot: slots[best.start].slot, toSlot: slots[best.end].slot }
}

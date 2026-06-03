// Score soleil PAR SURFACE — TÂCHE 2 (le cœur).
//
// Le score historique est mono-point : on testait l'ombre sur UN seul point
// (le pin Google, souvent l'entrée/centroïde — pas la terrasse). Bancal.
//
// Ici on calcule le % de l'EMPRISE de la terrasse au soleil à l'instant T :
//   1. On construit une emprise (bande le long de la façade, côté rue) à partir
//      des dimensions réelles (open data « terrasses-autorisations ») ou d'une
//      approximation (8 m × 2,5 m) quand on ne les a pas.
//   2. On échantillonne 6–9 points sur cette emprise.
//   3. Pour chaque point, on lance le MÊME test d'ombre que la carte 3D : on
//      projette chaque bâtiment voisin le long du soleil (hull façade + façade
//      projetée) et on teste si le point tombe dans une ombre.
//   4. Score = fraction de points au soleil (0–1).
//
// Pur, sans dépendance DOM / Mapbox → réutilisable côté client (panel) comme
// côté script (pré-calcul DB ultérieur). Réutilise getSunPosition de SunCalc.

import { getSunPosition } from './suncalc'

const M_PER_DEG_LAT = 111_320

/** Anneau d'un bâtiment : liste de [lng, lat]. Hauteur en mètres. */
export interface BuildingPoly {
  ring: [number, number][]
  height: number
}

export interface SurfaceResult {
  /** Fraction de l'emprise au soleil, 0–1. */
  fraction: number
  litPoints: number
  totalPoints: number
  /** true si le soleil est sous l'horizon (nuit) → fraction 0. */
  isNight: boolean
}

// ── Géométrie ────────────────────────────────────────────────────────────────

function metersOffset(lng: number, lat: number, dE: number, dN: number): [number, number] {
  const cosLat = Math.cos((lat * Math.PI) / 180)
  return [lng + dE / (M_PER_DEG_LAT * cosLat), lat + dN / M_PER_DEG_LAT]
}

/** Ray-casting point-in-polygon (coordonnées [lng, lat]). */
function pointInPolygon(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1]
    const xj = ring[j][0], yj = ring[j][1]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Enveloppe convexe (Andrew monotone chain). */
function convexHull(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return [...pts]
  const s = [...pts].sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1]))
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: [number, number][] = []
  for (const p of s) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop()
    lo.push(p)
  }
  const up: [number, number][] = []
  for (const p of [...s].reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop()
    up.push(p)
  }
  lo.pop(); up.pop()
  return [...lo, ...up]
}

// ── Emprise de la terrasse ─────────────────────────────────────────────────────

/**
 * Bearing de la façade qui borde le point (lat,lng) : on prend l'arête du
 * polygone la plus proche, et la normale qui pointe VERS l'extérieur (côté rue).
 * C'est la direction dans laquelle s'étend la terrasse. Retourne des degrés
 * depuis le nord (0–360), ou null si indéterminable.
 */
export function facadeBearing(ring: [number, number][], lng: number, lat: number): number | null {
  if (!ring || ring.length < 3) return null
  const cosLat = Math.cos((lat * Math.PI) / 180)
  let bestDist = Infinity
  let bestBearing: number | null = null
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i]
    const [bx, by] = ring[i + 1]
    const mx = (((ax + bx) / 2 - lng) * M_PER_DEG_LAT * cosLat)
    const my = (((ay + by) / 2 - lat) * M_PER_DEG_LAT)
    const d = Math.sqrt(mx * mx + my * my)
    if (d < 0.5 || d > 120) continue
    const ex = (bx - ax) * M_PER_DEG_LAT * cosLat
    const ey = (by - ay) * M_PER_DEG_LAT
    const el = Math.sqrt(ex * ex + ey * ey)
    if (el < 0.5) continue
    // Normale à l'arête, orientée vers le point (côté rue / extérieur du bâtiment)
    const n1x = ey / el, n1y = -ex / el
    const dot = n1x * -mx + n1y * -my
    const nx = dot > 0 ? n1x : -n1x
    const ny = dot > 0 ? n1y : -n1y
    const cb = ((Math.atan2(-nx, -ny) * 180) / Math.PI + 360) % 360
    if (d < bestDist) { bestDist = d; bestBearing = cb }
  }
  return bestBearing
}

export interface FootprintOpts {
  lng: number
  lat: number
  /** Direction (deg depuis le nord) dans laquelle s'étend la terrasse (vers la rue). */
  facadeBearingDeg: number
  /** Longueur le long de la façade (m). Défaut 8. */
  widthM?: number | null
  /** Profondeur vers la rue (m). Défaut 2,5. */
  depthM?: number | null
  cols?: number
  rows?: number
}

/**
 * Échantillonne l'emprise de la terrasse en une grille de points [lng, lat].
 * cols × rows points (défaut 3×3 = 9). La bande part de la façade et s'étend
 * vers la rue sur `depthM`, sur une largeur `widthM` le long de la façade.
 */
export function buildTerraceFootprint(opts: FootprintOpts): [number, number][] {
  const { lng, lat, facadeBearingDeg } = opts
  const width = Math.min(40, Math.max(2, opts.widthM ?? 8))
  const depth = Math.min(8, Math.max(1.2, opts.depthM ?? 2.5))
  const cols = Math.max(1, opts.cols ?? 3)
  const rows = Math.max(1, opts.rows ?? 3)

  const rad = (facadeBearingDeg * Math.PI) / 180
  const fwdE = Math.sin(rad), fwdN = Math.cos(rad)   // vers la rue (extérieur)
  const tanE = Math.cos(rad), tanN = -Math.sin(rad)  // le long de la façade

  const pts: [number, number][] = []
  for (let i = 0; i < cols; i++) {
    const wx = (cols === 1 ? 0 : i / (cols - 1) - 0.5) * width
    for (let j = 0; j < rows; j++) {
      // de 0,25·profondeur (près de la façade) à 0,9·profondeur (bord rue)
      const t = rows === 1 ? 0.5 : j / (rows - 1)
      const dy = (0.25 + 0.65 * t) * depth
      const dE = tanE * wx + fwdE * dy
      const dN = tanN * wx + fwdN * dy
      pts.push(metersOffset(lng, lat, dE, dN))
    }
  }
  return pts
}

// ── Test d'ombre ────────────────────────────────────────────────────────────

function shadowPolygon(b: BuildingPoly, shadowAzRad: number, shadowLen: number): [number, number][] {
  const lat0 = b.ring[0][1]
  const cosLat = Math.cos((lat0 * Math.PI) / 180)
  const dE = Math.sin(shadowAzRad) * shadowLen
  const dN = Math.cos(shadowAzRad) * shadowLen
  const projected: [number, number][] = b.ring.map(([x, y]) => [
    x + dE / (M_PER_DEG_LAT * cosLat),
    y + dN / M_PER_DEG_LAT,
  ])
  return convexHull([...b.ring, ...projected])
}

/**
 * Fraction de l'emprise au soleil à l'instant `date`.
 * `neighbors` = bâtiments proches avec polygone + hauteur (inclut idéalement le
 * bâtiment de la terrasse lui-même). Réutilise EXACTEMENT la projection d'ombre
 * de la vue 3D (hull façade + façade projetée le long du soleil).
 */
export function surfaceSunFraction(
  points: [number, number][],
  date: Date,
  lat: number,
  lng: number,
  neighbors: BuildingPoly[],
): SurfaceResult {
  const total = points.length
  const sun = getSunPosition(date, lat, lng)
  const altDeg = (sun.altitude * 180) / Math.PI

  if (altDeg <= 0.5) return { fraction: 0, litPoints: 0, totalPoints: total, isNight: true }

  // Azimut « depuis le nord » du soleil, puis direction de l'ombre (opposé).
  const azNorthDeg = ((sun.azimuth * 180) / Math.PI + 180) % 360
  const shadowAzRad = (((azNorthDeg + 180) % 360) * Math.PI) / 180

  const shadows = neighbors
    .filter((b) => b.height > 1 && b.ring.length >= 3)
    .map((b) => shadowPolygon(b, shadowAzRad, Math.min(140, b.height / Math.tan(sun.altitude))))

  let lit = 0
  for (const [x, y] of points) {
    const shadowed = shadows.some((poly) => pointInPolygon(x, y, poly))
    if (!shadowed) lit++
  }

  return { fraction: total ? lit / total : 0, litPoints: lit, totalPoints: total, isNight: false }
}

/** Arrondi en pourcentage entier 0–100. */
export function toPercent(fraction: number): number {
  return Math.round(Math.max(0, Math.min(1, fraction)) * 100)
}

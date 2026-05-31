/**
 * Helpers heure ↔ slot DB.
 *
 * Le slider tourne en pas de 0.25h (15 min) pour une manipulation fine,
 * mais la table `sun_scores` est en pas de 30 min (00 / 30). Donc on snap
 * silencieusement au demi-heure le plus proche pour la requête DB —
 * l'utilisateur garde sa précision visuelle, et les ombres Mapbox sont
 * recalculées à la minute via applySunLightingByHour de toute façon.
 */

/** Snap au slot 30min le plus proche → "HH:00" ou "HH:30" */
export function hourToSlot(h: number): string {
  const half = Math.round(h * 2) / 2          // 17.15 → 17, 17.40 → 17.5
  const hh   = Math.floor(half)
  const mm   = (half % 1) === 0 ? '00' : '30'
  return `${String(hh).padStart(2, '0')}:${mm}`
}

/** Label affiché à la précision 15 min : "17h", "17h15", "17h30", "17h45" */
export function formatHourLabel(h: number): string {
  const hh    = Math.floor(h)
  const mins  = Math.round((h - hh) * 60)
  if (mins === 0) return `${hh}h`
  return `${hh}h${String(mins).padStart(2, '0')}`
}

/** Comme formatHourLabel mais toujours en 2 chiffres pour les pills compactes */
export function formatHourLabelPad(h: number): string {
  const hh    = Math.floor(h)
  const mins  = Math.round((h - hh) * 60)
  return `${String(hh).padStart(2, '0')}h${String(mins).padStart(2, '0')}`
}

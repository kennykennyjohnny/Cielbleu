/**
 * Utilitaires pour déterminer si un lieu est ouvert à une heure donnée.
 *
 * Deux sources de données :
 *   1) `periods` (Place Details Google) — précis, par jour/heure
 *   2) `weekday_text` (Place Details Google) — texte free-form à parser
 *   3) Heuristique par type — quand aucune donnée disponible
 */
import type { PlaceType } from '@/types'

interface OpenPeriod {
  day: number   // 0=Dim, 1=Lun, … 6=Sam
  time: string  // "HHMM" ex. "1200"
}
interface Period {
  open: OpenPeriod
  close?: OpenPeriod
}

/**
 * Détermine si un lieu est ouvert à l'heure `hour` (flottant 0–23.5) un jour `dayOfWeek` (Date.getDay()).
 * Utilise `periods` si disponible, sinon tente `weekday_text`, sinon heuristique par type.
 * Retourne `null` si indéterminable (pas de données ET pas de type).
 */
export function isOpenAt(
  openingHours: Record<string, unknown> | null | undefined,
  dayOfWeek: number,
  hour: number,
  type?: PlaceType,
): boolean {
  if (openingHours) {
    // ── Source 1 : periods ──────────────────────────────────────────────
    const periods = openingHours.periods as Period[] | undefined
    if (Array.isArray(periods) && periods.length > 0) {
      return isOpenAtViaPeriods(periods, dayOfWeek, hour)
    }

    // ── Source 2 : weekday_text ─────────────────────────────────────────
    const weekdayText = openingHours.weekday_text as string[] | undefined
    if (Array.isArray(weekdayText) && weekdayText.length === 7) {
      const result = isOpenAtViaWeekdayText(weekdayText, dayOfWeek, hour)
      if (result !== null) return result
    }
  }

  // ── Source 3 : heuristique par type ────────────────────────────────────
  if (type) return estimateIsOpen(type, dayOfWeek, hour)

  // Pas de données → inclure dans les résultats (bénéfice du doute)
  return true
}

// ── Periods parser ───────────────────────────────────────────────────────────

function timeToFloat(t: string): number {
  // "HHMM" → float heure ex. "2230" → 22.5
  const h = parseInt(t.slice(0, 2))
  const m = parseInt(t.slice(2))
  return h + m / 60
}

function isOpenAtViaPeriods(periods: Period[], day: number, hour: number): boolean {
  for (const p of periods) {
    if (p.open.day !== day) continue
    const openH  = timeToFloat(p.open.time)
    const closeH = p.close ? timeToFloat(p.close.time) : 24

    // Ouverture traversant minuit (ex. open 22h → close 02h le lendemain)
    if (closeH < openH) {
      if (hour >= openH || hour < closeH) return true
    } else {
      if (hour >= openH && hour < closeH) return true
    }
  }

  // Vérifie si une période du jour PRÉCÉDENT traverse minuit et inclut `hour`
  const prevDay = (day + 6) % 7
  for (const p of periods) {
    if (p.open.day !== prevDay || !p.close) continue
    const openH  = timeToFloat(p.open.time)
    const closeH = timeToFloat(p.close.time)
    if (closeH < openH && hour < closeH) return true
  }

  return false
}

// ── Weekday text parser ───────────────────────────────────────────────────────
// Format FR : "Lundi : 09:00 – 22:00" ou "Fermé" ou "Ouvert en permanence"
// Format EN : "Monday: 9:00 AM – 10:00 PM"
const DAY_MAP_FR: Record<string, number> = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
}

function parseTimeStr(s: string): number | null {
  // "09:00" → 9, "22:30" → 22.5, "9:00 AM" → 9, "10:00 PM" → 22
  s = s.trim()
  const matchFr = s.match(/^(\d{1,2}):(\d{2})$/)
  if (matchFr) return parseInt(matchFr[1]) + parseInt(matchFr[2]) / 60
  const matchEn = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (matchEn) {
    let h = parseInt(matchEn[1])
    const m = parseInt(matchEn[2])
    const ampm = matchEn[3].toUpperCase()
    if (ampm === 'PM' && h !== 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    return h + m / 60
  }
  return null
}

function isOpenAtViaWeekdayText(weekdayText: string[], day: number, hour: number): boolean | null {
  // weekdayText[0] = Lundi, [1] = Mardi, …, [6] = Dimanche (format Google FR)
  // Mais Google renvoie en commençant par Dimanche = index 0 si EN, ou Lundi = index 0 si FR?
  // En pratique Google renvoie: index 0 = Lundi pour FR, 0 = Sunday pour EN.
  // On cherche d'abord la ligne qui correspond au jour.
  const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const targetDayName = dayNames[day]

  const line = weekdayText.find(t => t.toLowerCase().startsWith(targetDayName))
  if (!line) {
    // Try English
    const enNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const enLine = weekdayText.find(t => t.toLowerCase().startsWith(enNames[day]))
    if (!enLine) return null
    return parseHoursLine(enLine, hour)
  }
  return parseHoursLine(line, hour)
}

function parseHoursLine(line: string, hour: number): boolean | null {
  const lower = line.toLowerCase()
  if (lower.includes('fermé') || lower.includes('closed')) return false
  if (lower.includes('24') || lower.includes('permanence') || lower.includes('always')) return true

  // Extrait tous les intervalles "HH:MM – HH:MM" ou "HH:MM AM/PM – HH:MM AM/PM"
  const intervalRe = /(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*[–\-–]\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)/gi
  let match
  while ((match = intervalRe.exec(line)) !== null) {
    const openH  = parseTimeStr(match[1])
    const closeH = parseTimeStr(match[2])
    if (openH === null || closeH === null) continue
    if (closeH < openH) { // crossing midnight
      if (hour >= openH || hour < closeH) return true
    } else {
      if (hour >= openH && hour < closeH) return true
    }
  }
  return false
}

// ── Heuristique par type ──────────────────────────────────────────────────────
// Horaires "typiques" parisiens — utilisés quand aucune donnée réelle disponible.

export function estimateIsOpen(type: PlaceType, dayOfWeek: number, hour: number): boolean {
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

  switch (type) {
    case 'park':
      // Parcs toujours accessibles (beaucoup sont ouverts 24/7)
      return true

    case 'cafe':
      // Cafés : 7h-20h en semaine, 8h-21h le weekend
      if (isWeekend) return hour >= 8 && hour < 21
      return hour >= 7 && hour < 20

    case 'bar': {
      // Bars : ouverts le soir/nuit, souvent fermés le matin
      // Vendredi/samedi : ferment tard (3h du matin)
      const isFriSat = dayOfWeek === 5 || dayOfWeek === 6
      if (isFriSat) return hour >= 15 || hour < 3
      return hour >= 16 || hour < 1
    }

    case 'restaurant':
      // Restos : déjeuner 12h-14h30 + dîner 19h-23h
      return (hour >= 12 && hour < 14.5) || (hour >= 19 && hour < 23)

    default:
      return true
  }
}

/**
 * Retourne un label court d'horaires depuis weekday_text pour aujourd'hui.
 * Ex: "12:00 – 22:00" ou "Fermé"
 */
export function todayHoursLabel(
  openingHours: Record<string, unknown> | null | undefined,
  dayOfWeek: number,
): string | null {
  if (!openingHours) return null
  const weekdayText = openingHours.weekday_text as string[] | undefined
  if (!Array.isArray(weekdayText) || weekdayText.length !== 7) return null

  const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
  const enNames  = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const line = weekdayText.find(t =>
    t.toLowerCase().startsWith(dayNames[dayOfWeek]) ||
    t.toLowerCase().startsWith(enNames[dayOfWeek])
  )
  if (!line) return null
  // Extrait la partie horaires après ":"
  const colonIdx = line.indexOf(':')
  if (colonIdx < 0) return null
  return line.slice(colonIdx + 1).trim()
}

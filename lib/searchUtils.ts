// ── Utilitaires de recherche floue ───────────────────────────────────────────
// Recherche tolérante aux accents et aux fautes de frappe pour les lieux.
// "cafe de flore" trouve "Café de Flore", "rosa park" trouve "Rosa Bonheur"…

/** Minuscule + suppression des accents (NFD) + ponctuation → espaces. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')       // accents combinants
    .replace(/['’`]/g, ' ')               // apostrophes → espace
    .replace(/[^a-z0-9\s]/g, ' ')         // autre ponctuation → espace
    .replace(/\s+/g, ' ')
    .trim()
}

/** Découpe en mots normalisés (≥1 caractère). */
export function tokenize(s: string): string[] {
  const n = normalizeText(s)
  return n ? n.split(' ').filter(Boolean) : []
}

/** Distance de Levenshtein (insertions/suppressions/substitutions). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    prev = cur
  }
  return prev[b.length]
}

/** Tolérance de fautes selon la longueur du mot cherché. */
function maxEdits(len: number): number {
  if (len <= 3) return 0
  if (len <= 5) return 1
  return 2
}

/**
 * Un token cherché matche un mot candidat si :
 *  – le mot commence par le token (préfixe), ou
 *  – le mot contient le token (sous-chaîne), ou
 *  – la distance d'édition est dans la tolérance.
 */
function tokenMatchesWord(token: string, word: string): boolean {
  if (word.startsWith(token) || token.startsWith(word)) return true
  if (word.includes(token)) return true
  const tol = maxEdits(token.length)
  if (tol === 0) return false
  // Compare le token au mot et à ses préfixes de longueur proche (frappe partielle)
  if (levenshtein(token, word) <= tol) return true
  if (word.length > token.length) {
    return levenshtein(token, word.slice(0, token.length)) <= tol
  }
  return false
}

/**
 * Score de pertinence texte d'un lieu pour une requête (0 = aucun match).
 * Plus le score est élevé, plus le résultat est proche.
 */
export function textMatchScore(query: string, name: string, address = ''): number {
  const q = normalizeText(query)
  if (!q) return 0
  const nName = normalizeText(name)
  const nAddr = normalizeText(address)

  // Match exact / sous-chaîne sur le nom = meilleur signal
  if (nName === q) return 1000
  if (nName.startsWith(q)) return 600
  if (nName.includes(q)) return 400
  if (nAddr.includes(q)) return 220

  // Sinon : tous les tokens de la requête doivent matcher un mot (nom > adresse)
  const qTokens   = q.split(' ').filter(Boolean)
  const nameWords = nName.split(' ').filter(Boolean)
  const addrWords = nAddr.split(' ').filter(Boolean)

  let score = 0
  for (const t of qTokens) {
    if (nameWords.some(w => tokenMatchesWord(t, w))) { score += 100; continue }
    if (addrWords.some(w => tokenMatchesWord(t, w))) { score += 45; continue }
    return 0 // un token sans aucun match → pas pertinent
  }
  return score
}

/** Booléen pratique : le lieu correspond-il à la requête texte ? */
export function fuzzyMatches(query: string, name: string, address = ''): boolean {
  return textMatchScore(query, name, address) > 0
}

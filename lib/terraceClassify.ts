// Tri des lieux par plausibilité de terrasse — TÂCHE 1.
//
// Philosophie : « garder large ». Mieux vaut un faux positif (un lieu sans
// terrasse qui s'affiche) qu'une vraie terrasse manquante. On exclut donc
// UNIQUEMENT ce qui est clairement NON (chaîne / commerce non-conso, ou
// absence explicite de terrasse). Tout le reste est gardé :
//   • TERRACE — signal fort (mot « terrasse » dans le nom, has_terrace=true,
//     parc = espace extérieur par nature). Affiché normalement.
//   • MAYBE   — bar / café / resto sans signal. Affiché avec « à confirmer ».
//   • NONE    — exclu de la carte et du sitemap.
//
// Important : on ne supprime jamais la donnée. La classification est dérivée à
// la volée des champs qu'on a déjà (name / type / has_terrace). Le signal
// « open data terrasses Paris » est ajouté en direct sur le panel (place-context),
// car il nécessite un appel par lieu — trop coûteux pour 22 000 lignes en masse.

export type TerraceStatus = 'terrace' | 'maybe' | 'none'

// Chaînes & commerces qui ne sont pas des lieux de consommation en terrasse.
// (Aligné avec l'ancien EXCLUDE_RE de app/page.tsx & app/sitemap.ts.)
const NON_RE =
  /franprix|monoprix|carrefour|naturalia|biocoop|lidl|aldi|picard|tabac-presse|pharmacie|pressing|coiffure|coiffeur|kebab|mcdonald|burger.?king|\bkfc\b|\bsubway\b|domino|sushi|\bquick\b/i

// Mots du nom qui signalent fortement une terrasse / un extérieur.
const TERRACE_RE =
  /terrasse|guinguette|rooftop|roof[- ]?top|p[ée]niche|plage|jardin|patio|kiosque|buvette/i

export interface ClassifiablePlace {
  name: string
  type?: string | null
  has_terrace?: boolean | null
}

export function classifyTerrace(p: ClassifiablePlace): TerraceStatus {
  // 1. Exclusions explicites
  if (p.has_terrace === false) return 'none'
  if (NON_RE.test(p.name)) return 'none'

  // 2. Signaux forts → TERRACE
  if (p.type === 'park') return 'terrace' // un parc est un extérieur par nature
  if (p.has_terrace === true) return 'terrace'
  if (TERRACE_RE.test(p.name)) return 'terrace'

  // 3. Bar / café / resto sans signal → à confirmer
  return 'maybe'
}

/** true = le lieu doit être masqué (carte + sitemap). */
export function isHiddenPlace(p: ClassifiablePlace): boolean {
  return classifyTerrace(p) === 'none'
}

/** true = afficher le badge « terrasse à confirmer ». */
export function isUnconfirmedTerrace(p: ClassifiablePlace): boolean {
  return classifyTerrace(p) === 'maybe'
}

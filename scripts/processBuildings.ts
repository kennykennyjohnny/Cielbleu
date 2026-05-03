// Convertit le GeoJSON APUR "Volumes bâtis Paris" en data/buildings.json
// utilisable par lib/sunScore.ts.
//
// Usage :
//   1. Télécharger le GeoJSON sur https://opendata.paris.fr/explore/dataset/volumesbatisparis/
//   2. Le placer dans data/source/ (n'importe quel nom .geojson)
//   3. npx tsx scripts/processBuildings.ts
//
// Sortie : data/buildings.json — array de { lat, lng, height } (centroïdes).

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SOURCE_DIR = resolve('data/source')
const OUTPUT = resolve('data/buildings.json')

function findSource(): string | null {
  if (!existsSync(SOURCE_DIR)) return null
  const candidates = readdirSync(SOURCE_DIR).filter((f) =>
    /\.geo?json$/i.test(f)
  )
  if (candidates.length === 0) return null
  // Préférer un fichier qui contient "bati" ou "volume" si plusieurs
  const preferred = candidates.find((f) => /bati|volume/i.test(f))
  return join(SOURCE_DIR, preferred ?? candidates[0])
}

// Hauteur minimale retenue (m). En dessous : abri de jardin, kiosques, etc.
const MIN_HEIGHT = 4

// Hauteur moyenne d'un étage parisien haussmannien
const FLOOR_HEIGHT_M = 3
// Surplus pour la toiture / combles
const ROOF_BONUS_M = 2

// Champs candidats pour la hauteur directe (selon millésime APUR)
const DIRECT_HEIGHT_KEYS = ['hauteur', 'haut_max', 'h_max', 'altitude_max', 'hauteur_m']

type GeoJSONGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

interface Feature {
  type: 'Feature'
  geometry: GeoJSONGeometry | null
  properties: Record<string, unknown>
}

interface FeatureCollection {
  type: 'FeatureCollection'
  features: Feature[]
}

function centroid2D(coords: number[][]): [number, number] {
  let sx = 0
  let sy = 0
  let n = 0
  for (const [x, y] of coords) {
    sx += x
    sy += y
    n++
  }
  return [sx / n, sy / n]
}

function featureCentroid(geom: GeoJSONGeometry): [number, number] | null {
  if (geom.type === 'Polygon') {
    const ring = geom.coordinates[0]
    if (!ring || ring.length === 0) return null
    return centroid2D(ring)
  }
  if (geom.type === 'MultiPolygon') {
    let largest: number[][] | null = null
    let largestN = 0
    for (const poly of geom.coordinates) {
      const ring = poly[0]
      if (ring && ring.length > largestN) {
        largest = ring
        largestN = ring.length
      }
    }
    return largest ? centroid2D(largest) : null
  }
  return null
}

function extractHeight(props: Record<string, unknown>): number | null {
  // 1. Hauteur directe si elle existe dans le millésime
  for (const key of DIRECT_HEIGHT_KEYS) {
    const v = props[key]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
    if (typeof v === 'string') {
      const n = parseFloat(v.replace(',', '.'))
      if (Number.isFinite(n) && n > 0) return n
    }
  }

  // 2. nb_pl (nombre de plateaux = étages, RDC inclus) × 3 m + toit
  const nbPl = props['nb_pl']
  if (typeof nbPl === 'number' && Number.isFinite(nbPl) && nbPl > 0) {
    return nbPl * FLOOR_HEIGHT_M + ROOF_BONUS_M
  }

  // 3. Parse "R+N" depuis l_plan_h
  const planH = props['l_plan_h']
  if (typeof planH === 'string') {
    const m = planH.match(/R\s*\+\s*(\d+)/i)
    if (m) {
      const n = parseInt(m[1], 10)
      return (n + 1) * FLOOR_HEIGHT_M + ROOF_BONUS_M
    }
    if (/^\s*R\s*$/i.test(planH)) return FLOOR_HEIGHT_M + ROOF_BONUS_M
  }

  return null
}

function main() {
  const source = findSource()
  if (!source) {
    console.error(`❌ Aucun .geojson trouvé dans ${SOURCE_DIR}`)
    console.error(`   Télécharge le GeoJSON APUR :`)
    console.error(`   https://opendata.paris.fr/explore/dataset/volumesbatisparis/`)
    process.exit(1)
  }

  console.log(`📂 Lecture ${source}…`)
  const raw = readFileSync(source, 'utf-8')
  const fc = JSON.parse(raw) as FeatureCollection

  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    console.error('❌ Le fichier n\'est pas un FeatureCollection GeoJSON valide.')
    process.exit(1)
  }

  console.log(`📊 ${fc.features.length} features à traiter…`)

  const buildings: { lat: number; lng: number; height: number }[] = []
  let skippedNoHeight = 0
  let skippedTooLow = 0
  let skippedNoGeom = 0

  for (const f of fc.features) {
    if (!f.geometry) {
      skippedNoGeom++
      continue
    }
    const c = featureCentroid(f.geometry)
    if (!c) {
      skippedNoGeom++
      continue
    }
    const h = extractHeight(f.properties ?? {})
    if (h == null) {
      skippedNoHeight++
      continue
    }
    if (h < MIN_HEIGHT) {
      skippedTooLow++
      continue
    }
    buildings.push({
      lng: Math.round(c[0] * 1e6) / 1e6,
      lat: Math.round(c[1] * 1e6) / 1e6,
      height: Math.round(h * 10) / 10,
    })
  }

  writeFileSync(OUTPUT, JSON.stringify(buildings))

  console.log(`✅ ${buildings.length} bâtiments écrits dans ${OUTPUT}`)
  console.log(`   — sans hauteur : ${skippedNoHeight}`)
  console.log(`   — trop bas (<${MIN_HEIGHT} m) : ${skippedTooLow}`)
  console.log(`   — sans géométrie : ${skippedNoGeom}`)
  const sizeMB = (JSON.stringify(buildings).length / 1024 / 1024).toFixed(1)
  console.log(`   — taille : ${sizeMB} MB`)
}

main()

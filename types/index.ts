export type PlaceType = 'bar' | 'restaurant' | 'cafe' | 'park'
export type FilterType = 'sun' | 'open' | 'bar' | 'restaurant' | 'cafe' | 'park' | 'fontaine' | 'sanisette'

export interface AmeniteInfo {
  type: 'fontaine' | 'sanisette'
  props: Record<string, unknown>
  lat: number
  lng: number
}

export interface WeatherForecastEntry {
  dt: number
  hour: number
  temp: number
  cloudCover: number
  icon: string
  description: string
}

export interface Place {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  type: PlaceType
  google_place_id?: string
  has_terrace: boolean | null
  terrace_probability: number
  google_rating?: number
  price_level?: number
  photos: string[]
  instagram_url?: string
  google_maps_url?: string
  opening_hours?: Record<string, unknown>
  arrondissement?: number
  created_at: string
  // Champs calculés côté client
  currentScore?: number
  distance?: number
  // { month → { "HH:MM" → score } } — chargé en lot dans HomePage
  scoresByMonth?: Record<number, Record<string, number>>
}

export interface SunScore {
  id: string
  place_id: string
  month: number
  time_slot: string // "14:00", "14:30"
  score: number // 1-5
  raw_data?: Record<string, unknown>
}

export interface Building {
  lat: number
  lng: number
  height: number // mètres
}

export interface Review {
  id: string
  place_id: string
  device_id: string
  rating: number
  comment?: string
  photos: string[]
  created_at: string
}

export interface SunConfirmation {
  id: string
  place_id: string
  device_id: string
  is_sunny: boolean
  created_at: string
}

export interface PlaceContext {
  building: {
    geo_shape: GeoJSON.Polygon | GeoJSON.MultiPolygon | null
    nb_pl: number | null
    l_plan_h: string | null
    h_et_max: number | null
    objectid: number | null
    n_ar: number | null
  } | null
  terrace: {
    nom_enseigne: string | null
    longueur: number | null
    largeur: number | null
    typologie: string | null
    geo_point_2d: { lat: number; lon: number } | null
  } | null
  fontaines: Array<{ geo_point_2d: { lat: number; lon: number }; dispo: string }>
  sanisettes: Array<{ geo_point_2d: { lat: number; lon: number }; statut: string; acces_pmr: string }>
}

export interface Presence {
  id: string
  place_id: string
  device_id: string
  created_at: string
}

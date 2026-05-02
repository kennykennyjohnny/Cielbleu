export type PlaceType = 'bar' | 'restaurant' | 'cafe' | 'park'
export type FilterType = 'sun' | 'bar' | 'restaurant' | 'cafe' | 'park'

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

export interface Presence {
  id: string
  place_id: string
  device_id: string
  created_at: string
}

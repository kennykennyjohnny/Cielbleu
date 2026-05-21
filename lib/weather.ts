// Paris center
const PARIS_LAT = 48.8566
const PARIS_LNG = 2.3522

export interface WeatherData {
  cloudCover: number    // 0-100%
  description: string
  icon: string
  temp: number          // Celsius
  feelsLike: number
}

export interface WeatherForecastEntry {
  dt: number        // unix timestamp (UTC)
  hour: number      // heure locale Paris (0-23)
  temp: number
  cloudCover: number
  icon: string
  description: string
}

export async function getParisWeather(): Promise<WeatherData> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY
  if (!apiKey) throw new Error('OPENWEATHERMAP_API_KEY manquante')

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${PARIS_LAT}&lon=${PARIS_LNG}&appid=${apiKey}&units=metric&lang=fr`
  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) throw new Error(`OpenWeatherMap erreur: ${res.status}`)
  const data = await res.json()

  return {
    cloudCover: data.clouds?.all ?? 0,
    description: data.weather?.[0]?.description ?? '',
    icon: data.weather?.[0]?.icon ?? '',
    temp: Math.round(data.main?.temp ?? 0),
    feelsLike: Math.round(data.main?.feels_like ?? 0),
  }
}

/** Renvoie les 48h de prévision (toutes les 3h). */
export async function getParisWeatherForecast(): Promise<WeatherForecastEntry[]> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY
  if (!apiKey) throw new Error('OPENWEATHERMAP_API_KEY manquante')

  // cnt=16 → 16 × 3h = 48h de prévision
  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${PARIS_LAT}&lon=${PARIS_LNG}&appid=${apiKey}&units=metric&lang=fr&cnt=16`
  const res = await fetch(url, { next: { revalidate: 1800 } })
  if (!res.ok) throw new Error(`OpenWeatherMap forecast erreur: ${res.status}`)
  const data = await res.json()

  // Offset timezone Paris : UTC+1 ou UTC+2 (été)
  const tzOffset = data.city?.timezone ?? 7200 // secondes

  return (data.list ?? []).map((entry: Record<string, unknown>) => {
    const dt = entry.dt as number
    const localHour = Math.floor(((dt + tzOffset) % 86400) / 3600)
    const main = entry.main as Record<string, number>
    const weather = (entry.weather as Record<string, unknown>[])[0] ?? {}
    const clouds  = entry.clouds as Record<string, number>
    return {
      dt,
      hour:        localHour,
      temp:        Math.round(main.temp ?? 0),
      cloudCover:  clouds.all ?? 0,
      icon:        String(weather.icon ?? '01d'),
      description: String(weather.description ?? ''),
    }
  })
}

/** Convertit le code icône OWM en emoji sans dépendance externe. */
export function owmIconToEmoji(icon: string): string {
  const code = icon.slice(0, 2)
  const isNight = icon.endsWith('n')
  const map: Record<string, string> = {
    '01': isNight ? '🌙' : '☀️',
    '02': isNight ? '🌤️' : '🌤️',
    '03': '⛅',
    '04': '☁️',
    '09': '🌧️',
    '10': '🌦️',
    '11': '⛈️',
    '13': '❄️',
    '50': '🌫️',
  }
  return map[code] ?? '🌡️'
}

export function getWeatherIconUrl(icon: string): string {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`
}

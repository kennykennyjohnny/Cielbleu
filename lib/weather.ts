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

export async function getParisWeather(): Promise<WeatherData> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY
  if (!apiKey) throw new Error('OPENWEATHERMAP_API_KEY manquante')

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${PARIS_LAT}&lon=${PARIS_LNG}&appid=${apiKey}&units=metric&lang=fr`

  const res = await fetch(url, { next: { revalidate: 1800 } }) // cache 30 min

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

export function getWeatherIconUrl(icon: string): string {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`
}

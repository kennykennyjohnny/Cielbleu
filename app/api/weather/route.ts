import { NextResponse } from 'next/server'
import { getParisWeather, getParisWeatherForecast } from '@/lib/weather'

export const dynamic = 'force-dynamic'

/**
 * GET /api/weather
 * Renvoie météo actuelle + prévisions 48h (toutes les 3h) pour Paris.
 * Cache 30 min côté CDN Vercel.
 */
export async function GET() {
  try {
    const [current, forecast] = await Promise.all([
      getParisWeather(),
      getParisWeatherForecast(),
    ])
    return NextResponse.json({ current, forecast }, {
      headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=900' },
    })
  } catch (err) {
    // Pas d'API key ou erreur réseau — on renvoie null proprement
    const msg = err instanceof Error ? err.message : 'Weather unavailable'
    return NextResponse.json({ current: null, forecast: [], error: msg }, { status: 503 })
  }
}

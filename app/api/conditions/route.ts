import { getParisConditions } from '@/lib/pollen'

// Cache côté serveur 1h (revalidate Vercel)
export const revalidate = 3600

export async function GET() {
  try {
    const data = await getParisConditions()
    return Response.json(data)
  } catch {
    return Response.json({
      pollenLevel: 0,
      pollenLabel: 'Faible',
      feelsLike: null,
      isHeatwave: false,
    })
  }
}

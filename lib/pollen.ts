// Pollen + conditions météo Paris via OpenMeteo (gratuit, sans clé)

export interface ParisConditions {
  pollenLevel: 0 | 1 | 2 | 3   // 0=faible, 1=modéré, 2=élevé, 3=très élevé
  pollenLabel: string
  feelsLike: number | null
  isHeatwave: boolean           // ressenti >= 30°C
}

export async function getParisConditions(): Promise<ParisConditions> {
  const [airRes, weatherRes] = await Promise.all([
    fetch(
      'https://air-quality-api.open-meteo.com/v1/air-quality' +
      '?latitude=48.85&longitude=2.35' +
      '&hourly=grass_pollen,birch_pollen,alder_pollen' +
      '&timezone=Europe%2FParis&forecast_days=1',
      { next: { revalidate: 3600 } },
    ),
    fetch(
      'https://api.open-meteo.com/v1/forecast' +
      '?latitude=48.85&longitude=2.35' +
      '&current=apparent_temperature',
      { next: { revalidate: 1800 } },
    ),
  ])

  const [airData, weatherData] = await Promise.all([
    airRes.json().catch(() => null),
    weatherRes.json().catch(() => null),
  ])

  // Heure UTC actuelle → index dans le tableau horaire OpenMeteo
  const nowUtc = new Date()
  const hourIdx = nowUtc.getUTCHours()

  const grass = airData?.hourly?.grass_pollen?.[hourIdx] ?? 0
  const birch = airData?.hourly?.birch_pollen?.[hourIdx] ?? 0
  const alder = airData?.hourly?.alder_pollen?.[hourIdx] ?? 0
  const maxPollen = Math.max(grass, birch, alder)

  const feelsLike: number | null = weatherData?.current?.apparent_temperature ?? null

  let pollenLevel: 0 | 1 | 2 | 3 = 0
  let pollenLabel = 'Faible'
  if (maxPollen >= 50) { pollenLevel = 3; pollenLabel = 'Très élevé' }
  else if (maxPollen >= 20) { pollenLevel = 2; pollenLabel = 'Élevé' }
  else if (maxPollen >= 8)  { pollenLevel = 1; pollenLabel = 'Modéré' }

  return {
    pollenLevel,
    pollenLabel,
    feelsLike,
    isHeatwave: feelsLike !== null && feelsLike >= 30,
  }
}

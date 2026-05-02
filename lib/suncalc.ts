import SunCalc from 'suncalc'

export interface SunPosition {
  altitude: number // radians au-dessus de l'horizon
  azimuth: number  // radians depuis le sud, sens horaire
}

export interface SunTimes {
  sunrise: Date
  sunset: Date
  solarNoon: Date
  goldenHour: Date
  goldenHourEnd: Date
  night: Date
}

export function getSunPosition(date: Date, lat: number, lng: number): SunPosition {
  return SunCalc.getPosition(date, lat, lng)
}

export function getSunTimes(date: Date, lat: number, lng: number): SunTimes {
  const t = SunCalc.getTimes(date, lat, lng)
  return {
    sunrise: t.sunrise,
    sunset: t.sunset,
    solarNoon: t.solarNoon,
    goldenHour: t.goldenHour,
    goldenHourEnd: t.goldenHourEnd,
    night: t.night,
  }
}

// Retourne un tableau des scores par créneau de 30min pour toute la journée
export function getDayScoreSlots(date: Date, lat: number, lng: number) {
  const slots = []
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)

  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      d.setHours(h, m, 0, 0)
      const pos = getSunPosition(d, lat, lng)
      slots.push({
        time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        altitude: pos.altitude,
        azimuth: pos.azimuth,
        isDay: pos.altitude > 0,
      })
    }
  }
  return slots
}

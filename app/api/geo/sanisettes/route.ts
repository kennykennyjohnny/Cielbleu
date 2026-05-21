import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export function GET() {
  const data = readFileSync(join(process.cwd(), 'data/source/sanisettesparis.geojson'), 'utf8')
  return new NextResponse(data, {
    headers: {
      'Content-Type': 'application/geo+json',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

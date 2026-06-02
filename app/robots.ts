import type { MetadataRoute } from 'next'

// Robots : on laisse tout indexer sauf les routes techniques (API, auth),
// et on pointe les crawlers vers le sitemap (toutes les terrasses + l'accueil).
export default function robots(): MetadataRoute.Robots {
  const site = 'https://hopsoleil.fr'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/'],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  }
}

import type { MetadataRoute } from 'next'
import { getSeoSitemap, SITE_URL } from '../lib/seo'

// Se arma al pedirse, no al compilar: si Vercel compilara antes de que el backend tenga estos
// datos, la página quedaría guardada vacía. Los datos sí se guardan una hora (ver lib/seo.ts).
export const dynamic = 'force-dynamic'

/**
 * El mapa del sitio que lee Google: el inicio, el directorio de empleos, una página por skill
 * que tenga vacantes abiertas y cada vacante publicada.
 *
 * Solo lista páginas que existen y tienen contenido: nada de rutas vacías.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { skills, vacancies } = await getSeoSitemap()
  const now = new Date()

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/empleos`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...skills.map(skill => ({
      url: `${SITE_URL}/empleos/${encodeURIComponent(skill.name)}`,
      lastModified: new Date(skill.lastModified),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...vacancies.map(vacancy => ({
      url: `${SITE_URL}/vacantes/${vacancy.slug}`,
      lastModified: new Date(vacancy.lastModified),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}

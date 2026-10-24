import type { MetadataRoute } from 'next'
import { SITE_URL } from '../lib/seo'

/**
 * Qué puede rastrear un buscador: todo lo público, y fuera las pantallas de cuenta y de
 * registro, que no tienen nada que indexar y gastarían su presupuesto de rastreo.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/auth/', '/login', '/signup', '/onboarding', '/settings', '/notifications', '/saved', '/admin'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}

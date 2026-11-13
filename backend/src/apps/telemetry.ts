import express, { Express } from 'express'
import path from 'path'
import swaggerUi from 'swagger-ui-express'
import swaggerJsdoc from 'swagger-jsdoc'
import substackRoutes from '../../routes/substack'
import usersRoutes from '../../routes/users'
import crudRoutes from '../../routes/crud'
import aiRoutes from '../../routes/ai'
import linkedinRoutes from '../../routes/linkedin'
import blogRoutes from '../../routes/blog'
import sitemapRoutes from '../../routes/sitemap'
import scraperRoutes from '../../routes/scraper'
import { linkedinCallback } from '../../controllers/linkedin.controller'
import { studioAuth, STUDIO_ROOT_PATHS, isLinkedInPublic, isBlogPublic } from '../../middleware/studio-auth.middleware'
import { analyticsAccess } from '../../middleware/analytics-access.middleware'
import adminAnalyticsRoutes from '../routes/admin/analytics.routes'
import webAnalyticsCollectRoutes from '../routes/analytics/collect.routes'
import resendWebhookRoutes from '../routes/webhooks/resend.routes'

/**
 * La parte de TELEMETRÍA: la analítica (recolección y panel), el webhook de Resend y lo heredado del estudio de contenido (crud, IA, Substack,
 * blog, LinkedIn del panel, scraper, sitemap). Nada de esto lo llama la app de personas directamente, salvo el intermediario de analítica.
 */

/** Va ANTES de express.json: la firma del webhook de Resend se calcula sobre el cuerpo tal como llegó (src/routes/webhooks/resend.routes.ts). */
export function mountTelemetryPreBody(app: Express) {
  app.use('/api/webhooks/resend', express.raw({ type: 'application/json', limit: '1mb' }), resendWebhookRoutes)
}

/** Va DESPUÉS de express.json. */
export function mountTelemetry(app: Express) {
  const PORT = process.env.PORT || 3001
  // Mismo lugar donde image.service guarda las imágenes locales (carpeta uploads del backend, el directorio donde corre el proceso).
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')))

  // Swagger config
  const swaggerOptions = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: '10X Studio API',
        version: '1.0.0',
        description: 'API de 10X Studio - Migrada de Next.js API Routes',
      },
      servers: [
        { url: '/', description: 'Servidor Actual' },
        { url: `http://localhost:${PORT}`, description: 'Localhost' },
      ],
    },
    apis: ['./routes/*.ts', './routes/*.js'],
  }
  const swaggerDocs = swaggerJsdoc(swaggerOptions)
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs))

  // Routes del Studio y del panel: solo superadmin (ver middleware/studio-auth.middleware.ts).
  // crud e IA se montan en `/api` junto con otras rutas, así que solo se protegen las suyas.
  app.use('/api', studioAuth({ onlyFor: (req) => STUDIO_ROOT_PATHS.test(req.path) }), crudRoutes)
  app.use('/api', studioAuth({ onlyFor: (req) => STUDIO_ROOT_PATHS.test(req.path) }), aiRoutes)
  app.use('/api/substack', studioAuth(), substackRoutes)
  app.use('/api/users', studioAuth(), usersRoutes)
  app.use('/api/blog', studioAuth({ isPublic: isBlogPublic }), blogRoutes)
  // LinkedIn: el inicio y el regreso del OAuth se abren sin sesión; el resto es del panel
  app.get('/api/linkedin/callback', linkedinCallback)
  app.use('/api/linkedin', studioAuth({ isPublic: isLinkedInPublic }), linkedinRoutes)
  // Panel de analítica de AvoTalent
  app.use('/api/admin/analytics', analyticsAccess(studioAuth()), adminAnalyticsRoutes)

  // Analítica web propia (reglas de GA4): la llama el intermediario de la comunidad, no el navegador
  app.use('/api/analytics', webAnalyticsCollectRoutes)

  // Scraper routes (internal use, no auth required for now)
  app.use('/api/scraper', scraperRoutes)

  // Sitemap (public, no auth)
  app.use(sitemapRoutes)
}

import express from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import swaggerJsdoc from 'swagger-jsdoc'
import dotenv from 'dotenv'
import substackRoutes from './routes/substack'
import usersRoutes from './routes/users'
import crudRoutes from './routes/crud'
import aiRoutes from './routes/ai'
import linkedinRoutes from './routes/linkedin'
import blogRoutes from './routes/blog'
import sitemapRoutes from './routes/sitemap'
import { linkedinCallback } from './controllers/linkedin.controller'
import { initCron } from './services/cron.service'
import { appEnv, scheduledJobsEnabled } from './config/app-env'
import { studioAuth, STUDIO_ROOT_PATHS, isLinkedInPublic, isBlogPublic } from './middleware/studio-auth.middleware'
import adminAnalyticsRoutes from './src/routes/admin/analytics.routes'
import { analyticsAccess } from './middleware/analytics-access.middleware'
import { communityAuthMiddleware } from './middleware/community-auth.middleware'

// Community Hub routes
import communityAuthRoutes from './src/routes/community/auth.routes'
import communityPostsRoutes from './src/routes/community/posts.routes'
import communityCommentsRoutes from './src/routes/community/comments.routes'
import communityUsersRoutes from './src/routes/community/users.routes'
import communitySavedRoutes from './src/routes/community/saved.routes'
import faviconRoutes from './src/routes/community/favicon.routes'
import communityStatsRoutes from './src/routes/community/stats.routes'
import { publicCache } from './middleware/public-cache.middleware'
import communityDiscoverRoutes from './src/routes/community/discover.routes'
import communitySeoRoutes from './src/routes/community/seo.routes'
import communityAttributionRoutes from './src/routes/community/attribution.routes'
import webAnalyticsCollectRoutes from './src/routes/analytics/collect.routes'
import resendWebhookRoutes from './src/routes/webhooks/resend.routes'
import communityFeedRoutes from './src/routes/community/feed.routes'
import communityHistoryRoutes from './src/routes/community/history.routes'
import communitySkillExamsRoutes from './src/routes/community/skill-exams.routes'
import communitySkillsRoutes from './src/routes/community/skills.routes'
import communitySkillProposalsRoutes from './src/routes/community/skill-proposals.routes'
import communityCompaniesRoutes from './src/routes/community/companies.routes'
import communityNotificationsRoutes from './src/routes/community/notifications.routes'
import communityPushRoutes from './src/routes/community/push.routes'
import communityFeedbackRoutes from './src/routes/community/feedback.routes'
import communityCardsRoutes from './src/routes/community/cards.routes'
import communityApplicationsRoutes from './src/routes/community/applications.routes'
// import communityCompanyClaimsRoutes from './src/routes/community/company-claims.routes'

// Admin routes
import adminExamQuestionsRoutes from './src/routes/admin/exam-questions.routes'

// Scraper routes
import scraperRoutes from './routes/scraper'

import path from 'path'
import { captureServerError } from './services/web-analytics/telemetry'
import { recordDeployFromEnv } from './services/analytics/changes'
import { apiTiming, startTimingFlush } from './services/performance/api-timing'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3002',
      'https://acovado-forum-i26ft1bbw-transformateck.vercel.app',
      'https://acovado-forum-er1yfnx7c-transformateck.vercel.app',
      'https://avocado-forum.vercel.app',
    ]
    if (!origin || allowed.includes(origin) || origin.endsWith('.vercel.app')) {
      callback(null, true)
    } else {
      callback(null, true)
    }
  },
  credentials: true,
}))
// Mide cuánto tarda cada ruta de /api (resumen por hora; ver services/performance/api-timing.ts)
app.use(apiTiming())
// El webhook de Resend va ANTES de express.json: su firma se calcula sobre el cuerpo tal como llegó (src/routes/webhooks/resend.routes.ts).
app.use('/api/webhooks/resend', express.raw({ type: 'application/json', limit: '1mb' }), resendWebhookRoutes)
app.use(express.json({ limit: '15mb' }))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

// Swagger config
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '10X Studio API',
      version: '1.0.0',
      description: 'API de 10X Studio - Migrada de Next.js API Routes'
    },
    servers: [
      { url: '/', description: 'Servidor Actual' },
      { url: `http://localhost:${PORT}`, description: 'Localhost' }
    ]
  },
  apis: ['./routes/*.ts', './routes/*.js']
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

// Community Hub routes (public auth endpoints, protected community endpoints)
app.use('/api/community/auth', communityAuthRoutes)
// Lo que se contesta igual para todos se guarda unos minutos (ver middleware/public-cache.middleware.ts): los artículos del equipo y, solo
// para quien no tiene sesión, la lista de vacantes. Lo que depende de la cuenta nunca se guarda.
app.use('/api/community/posts', publicCache(120_000, { only: (path) => path === '/editorial' }))
app.use('/api/community/posts', publicCache(60_000, { only: (path) => path === '/', guestOnly: true }))
app.use('/api/community/posts', communityPostsRoutes)
app.use('/api/community/posts', communityCommentsRoutes)
app.use('/api/community/users', communityUsersRoutes)
app.use('/api/community/saved', communityAuthMiddleware, communitySavedRoutes)
app.use('/api/community/favicon', faviconRoutes)
// Las estadísticas de la barra lateral (generales, por etiqueta, por puesto) son las mismas para todos: 2 minutos en memoria.
app.use('/api/community/stats', publicCache(120_000, { only: () => true }), communityStatsRoutes)
app.use('/api/community/discover', communityDiscoverRoutes)
app.use('/api/community/seo', communitySeoRoutes)
app.use('/api/community/applications', communityApplicationsRoutes)
app.use('/api/community/attribution', communityAttributionRoutes)
app.use('/api/community/feed', communityFeedRoutes)
app.use('/api/community/history', communityHistoryRoutes)
app.use('/api/community/skill-exams', communitySkillExamsRoutes)
app.use('/api/community/skills', communitySkillsRoutes)
app.use('/api/community/skill-proposals', communitySkillProposalsRoutes)
app.use('/api/community/companies', communityCompaniesRoutes)
app.use('/api/community/notifications', communityNotificationsRoutes)
app.use('/api/community/push', communityPushRoutes)
app.use('/api/community/feedback', communityFeedbackRoutes)
app.use('/api/community/cards', communityCardsRoutes)
// Alta de empresas en pausa: por ahora AvoTalent solo ofrece algo a las personas. Para reactivarla, vuelve a montar
// communityCompanyClaimsRoutes aquí y a mostrar el flujo en el registro y el onboarding de apps/community.
// app.use('/api/community/company-claims', communityCompanyClaimsRoutes)
app.use('/api/admin/exam-questions', adminExamQuestionsRoutes)

// Scraper routes (internal use, no auth required for now)
app.use('/api/scraper', scraperRoutes)

// Sitemap (public, no auth)
app.use(sitemapRoutes)

// Root route
app.get('/', (req, res) => {
  res.send('10X Studio API is running')
})

// Telemetría: todo error que se escape de una ruta queda registrado (con su ruta y su cuenta si la hay) y sigue su camino normal
// (esto solo anota: la respuesta al cliente la sigue dando el manejo de errores de Express).
app.use((err: unknown, req: express.Request, _res: express.Response, next: express.NextFunction) => {
  captureServerError(err, { path: req.path, userId: (req as express.Request & { userId?: string }).userId ?? null })
  next(err)
})

// Tareas programadas (scraper, correos, LinkedIn, fotos semanales...): solo en beta y producción, cada una con su base y sus llaves.
// Un entorno de desarrollo (tu máquina o el proyecto de Desarrollo) nunca las arranca, aunque tenga llaves puestas (config/app-env.ts).
if (scheduledJobsEnabled()) initCron()
else console.log(`[Entorno] ${appEnv()}: tareas programadas apagadas`)
startTimingFlush()

// Anota el despliegue en la bitácora de cambios (solo en Railway, una vez por commit; nunca estorba al arranque)
void recordDeployFromEnv().then((result) => { if (result.saved) console.log('[Cambios] despliegue anotado') })

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`)
})

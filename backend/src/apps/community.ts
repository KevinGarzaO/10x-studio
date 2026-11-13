import { Express } from 'express'
import { communityAuthMiddleware } from '@avotalent/core/http/middleware/community-auth.middleware'
import { publicCache } from '@avotalent/core/http/middleware/public-cache.middleware'
import communityAuthRoutes from '../routes/community/auth.routes'
import communityPostsRoutes from '../routes/community/posts.routes'
import communityCommentsRoutes from '../routes/community/comments.routes'
import communityUsersRoutes from '../routes/community/users.routes'
import communitySavedRoutes from '../routes/community/saved.routes'
import faviconRoutes from '../routes/community/favicon.routes'
import communityStatsRoutes from '../routes/community/stats.routes'
import communityDiscoverRoutes from '../routes/community/discover.routes'
import communitySeoRoutes from '../routes/community/seo.routes'
import communityAttributionRoutes from '../routes/community/attribution.routes'
import communityFeedRoutes from '../routes/community/feed.routes'
import communityHistoryRoutes from '../routes/community/history.routes'
import communitySkillExamsRoutes from '../routes/community/skill-exams.routes'
import communitySkillsRoutes from '../routes/community/skills.routes'
import communitySkillProposalsRoutes from '../routes/community/skill-proposals.routes'
import communityCompaniesRoutes from '../routes/community/companies.routes'
import communityNotificationsRoutes from '../routes/community/notifications.routes'
import communityPushRoutes from '../routes/community/push.routes'
import communityFeedbackRoutes from '../routes/community/feedback.routes'
import communityFlagsRoutes from '../routes/community/flags.routes'
import communityCardsRoutes from '../routes/community/cards.routes'
import communityApplicationsRoutes from '../routes/community/applications.routes'
import adminExamQuestionsRoutes from '../routes/admin/exam-questions.routes'
import filesRoutes from '../routes/files.routes'
// import communityCompanyClaimsRoutes from '../routes/community/company-claims.routes'

/**
 * La API PÚBLICA de la app de personas: todo lo que cuelga de /api/community, las imágenes (/api/files) y el administrador de preguntas de examen.
 * Se monta DESPUÉS de express.json. Es la pieza con más tráfico; no incluye analítica ni el panel (ver telemetry.ts).
 */
export function mountCommunity(app: Express) {
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
  app.use('/api/community/flags', communityFlagsRoutes)
  // Imágenes públicas desde el almacenamiento privado (solo con STORAGE_DRIVER=azure; con Supabase contesta 404).
  app.use('/api/files', filesRoutes)
  app.use('/api/community/cards', communityCardsRoutes)
  // Alta de empresas en pausa: por ahora AvoTalent solo ofrece algo a las personas. Para reactivarla, vuelve a montar
  // communityCompanyClaimsRoutes aquí y a mostrar el flujo en el registro y el onboarding de apps/community.
  // app.use('/api/community/company-claims', communityCompanyClaimsRoutes)
  app.use('/api/admin/exam-questions', adminExamQuestionsRoutes)
}

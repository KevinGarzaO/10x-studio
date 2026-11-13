import dotenv from 'dotenv'
import { createBaseApp, finishApp, startServer, useJsonBody } from '@avotalent/core/http/base'
import { mountTelemetry, mountTelemetryPreBody } from './src/apps/telemetry'

dotenv.config()

/**
 * SOLO la telemetría: recolección de analítica (/api/analytics), panel (/api/admin/analytics), webhook de Resend y lo heredado del estudio (crud,
 * IA, Substack, blog, LinkedIn del panel, scraper, sitemap). Sin rutas de la comunidad y sin tareas programadas.
 * Se despliega aparte en Railway: `cd backend && node dist/api-telemetry.js`. Mismas rutas y mismos módulos que index.ts.
 */
const app = createBaseApp()
mountTelemetryPreBody(app)
useJsonBody(app)
mountTelemetry(app)
finishApp(app, 'AvoTalent telemetry API is running')

startServer(app, { scheduledJobs: false, recordDeploy: true, name: 'api-telemetry' })

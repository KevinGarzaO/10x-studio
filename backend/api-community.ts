import dotenv from 'dotenv'
import { createBaseApp, finishApp, startServer, useJsonBody } from '@avotalent/core/http/base'
import { mountCommunity } from './src/apps/community'

dotenv.config()

/**
 * SOLO la API pública de la app de personas (/api/community/*, /api/files, preguntas de examen). Sin analítica, sin panel, sin tareas programadas.
 * Se despliega aparte en Railway: `cd backend && node dist/api-community.js`. Mismas rutas y mismos módulos que index.ts.
 */
const app = createBaseApp()
useJsonBody(app)
mountCommunity(app)
finishApp(app, 'AvoTalent community API is running')

startServer(app, { scheduledJobs: false, recordDeploy: false, name: 'api-community' })

import dotenv from 'dotenv'
import { createBaseApp, finishApp, startServer, useJsonBody } from './src/apps/base'
import { mountCommunity } from './src/apps/community'
import { mountTelemetry, mountTelemetryPreBody } from './src/apps/telemetry'

dotenv.config()

/**
 * La API COMPLETA en un solo proceso: la de la app de personas (src/apps/community.ts) y la de telemetría (src/apps/telemetry.ts) juntas. Es lo que
 * corre hoy en producción. Cuando cada una se despliegue por separado se usan api-community.ts y api-telemetry.ts (mismas rutas, mismos módulos).
 * Este proceso también participa en la elección de quién corre las tareas programadas (RUN_CRONS_IN_API=off lo saca).
 */
const app = createBaseApp()
mountTelemetryPreBody(app)
useJsonBody(app)
// Primero lo del estudio y el panel (algunas rutas cuelgan de /api), luego la comunidad: el mismo orden de siempre.
mountTelemetry(app)
mountCommunity(app)
finishApp(app, '10X Studio API is running')

startServer(app, { scheduledJobs: true, recordDeploy: true, name: 'API completa' })

import express, { Express } from 'express'
import cors from 'cors'
import { captureServerError } from '@avotalent/core/services/web-analytics/telemetry'
import { recordDeployFromEnv } from '@avotalent/core/services/analytics/changes'
import { apiTiming, startTimingFlush } from '@avotalent/core/services/performance/api-timing'
import { startScheduledJobs } from '@avotalent/core/services/workers/scheduled-jobs'
import { apiKeyGate } from '../../middleware/api-key.middleware'

/**
 * Piezas comunes de las tres formas de arrancar la API (todas montan los mismos grupos de rutas, ver community.ts y telemetry.ts):
 *   - index.ts          : TODO junto (como siempre; es lo que corre hoy en producción).
 *   - api-community.ts  : solo la API pública de la app de personas.
 *   - api-telemetry.ts  : solo la analítica, el panel y lo heredado del estudio.
 */
export function createBaseApp(): Express {
  const app = express()
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
  // Regla de diseño: toda API exige la llave de la aplicación (x-api-key); ver middleware/api-key.middleware.ts. Va después de CORS para que las respuestas
  // de rechazo también lleven sus cabeceras. Sin API_KEYS no hace nada; con API_KEY_MODE=report solo cuenta y registra (así se ensaya en producción).
  app.use(apiKeyGate())
  // Mide cuánto tarda cada ruta de /api (resumen por hora; ver services/performance/api-timing.ts)
  app.use(apiTiming())
  return app
}

export function useJsonBody(app: Express) {
  app.use(express.json({ limit: '15mb' }))
}

/** La ruta raíz y el registro de errores: va al FINAL, después de todas las rutas. */
export function finishApp(app: Express, rootMessage: string) {
  app.get('/', (_req, res) => {
    res.send(rootMessage)
  })

  // Telemetría: todo error que se escape de una ruta queda registrado (con su ruta y su cuenta si la hay) y sigue su camino normal
  // (esto solo anota: la respuesta al cliente la sigue dando el manejo de errores de Express).
  app.use((err: unknown, req: express.Request, _res: express.Response, next: express.NextFunction) => {
    captureServerError(err, { path: req.path, userId: (req as express.Request & { userId?: string }).userId ?? null })
    next(err)
  })
}

export interface StartOptions {
  /** ¿Este proceso participa en la elección de quién corre las tareas programadas? (solo el monolito; los servicios separados no) */
  scheduledJobs: boolean
  /** ¿Anota el despliegue en la bitácora de cambios? (una sola pieza debe hacerlo) */
  recordDeploy: boolean
  /** Para los mensajes del arranque. */
  name: string
}

export function startServer(app: Express, options: StartOptions) {
  const PORT = process.env.PORT || 3001

  // Tareas programadas: solo en producción y solo en el proceso que gana el arrendamiento de la base (services/workers): nunca dos copias a la
  // vez. RUN_CRONS_IN_API=off la deja sin crons cuando el servicio de workers (backend/workers.ts) ya está funcionando.
  const jobsLeader = options.scheduledJobs ? startScheduledJobs({ role: 'api' }) : null
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => { void (jobsLeader?.stop() ?? Promise.resolve()).finally(() => process.exit(0)) })
  }
  startTimingFlush()

  // Anota el despliegue en la bitácora de cambios (solo en Railway, una vez por commit; nunca estorba al arranque)
  if (options.recordDeploy) void recordDeployFromEnv().then((result) => { if (result.saved) console.log('[Cambios] despliegue anotado') })

  return app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[${options.name}] escuchando en el puerto ${PORT}`)
  })
}

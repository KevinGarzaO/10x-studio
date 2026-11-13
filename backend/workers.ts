import http from 'http'
import { appEnv } from './config/app-env'
import { startScheduledJobs, workersEnabled } from './services/workers/scheduled-jobs'

/**
 * Servicio de WORKERS: un proceso que solo corre las tareas programadas (scraper, correos, LinkedIn, fotos semanales, matches...) y nada de
 * rutas. Se despliega aparte de la API (en Railway: `cd backend && node dist/workers.js`), así la API puede tener varias copias o reiniciarse sin
 * disparar nada dos veces: de las copias que existan, solo una gana el arrendamiento `crons` en la base y corre las tareas.
 *
 * Solo corre en producción y con WORKERS_ENABLED=on. Antes de encenderlo: aplicar a mano packages/db/migrations/202611131400_worker_leases.sql y
 * poner RUN_CRONS_IN_API=off en la API (si no, API y workers se disputan el arrendamiento: no se duplica nada, pero no se sabe quién corre).
 *
 * Un servidor mínimo contesta «/» (para el chequeo de salud de Railway) y dice quién es líder.
 */
const PORT = Number(process.env.PORT) || 8080

const leader = startScheduledJobs({ role: 'worker' })

http
  .createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/' || req.url === '/health') {
      res.end(JSON.stringify({ ok: true, role: 'worker', env: appEnv(), enabled: workersEnabled(), leader: leader?.isLeader() ?? false }))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'Not found' }))
  })
  .listen(PORT, '0.0.0.0', () => console.log(`[Workers] escuchando en ${PORT} (env=${appEnv()}, activo=${workersEnabled()})`))

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => { void (leader?.stop() ?? Promise.resolve()).finally(() => process.exit(0)) })
}

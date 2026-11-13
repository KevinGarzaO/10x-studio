/**
 * En qué entorno corre este proceso: `development` (local o el proyecto de Desarrollo), `staging` (pre-producción interna: la copia anonimizada
 * de producción donde se ensaya antes de subir) o `production`. Es lo que decide si se ejecutan las tareas programadas y las publicaciones:
 * un entorno que no es producción NUNCA debe mandar correos reales, publicar en el LinkedIn del fundador ni lanzar el scraper por accidente
 * (docs/infra/01-entornos.md).
 *
 * La beta con personas reales NO es un entorno: es un grupo de personas dentro de producción (interruptores por grupo, docs/infra/02-interruptores.md).
 *
 * Cómo se decide (en este orden):
 *  1. `APP_ENV`, si está definida con un valor conocido (`beta` se lee como `staging`: el proyecto de Railway que se llamó así es la pre-producción).
 *  2. El nombre del entorno de Railway (`RAILWAY_ENVIRONMENT_NAME`), así que producción NO necesita ninguna variable nueva.
 *  3. Cualquier otra cosa (tu máquina, una prueba, un valor raro) = `development`: todo lo externo apagado. Equivocarse hacia este lado es seguro.
 */
export type AppEnv = 'development' | 'staging' | 'production'

const asEnv = (value: string | undefined): AppEnv | null => {
  const clean = (value ?? '').trim().toLowerCase()
  if (clean === 'beta') return 'staging'
  return clean === 'development' || clean === 'staging' || clean === 'production' ? clean : null
}

export function appEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return asEnv(env.APP_ENV) ?? asEnv(env.RAILWAY_ENVIRONMENT_NAME) ?? 'development'
}

/** ¿Corren las tareas programadas (scraper, correos, fotos semanales, ocultado del feed, matches…)? Solo producción: en pre-producción hay copias de personas reales y no deben recibir correos. */
export const scheduledJobsEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => appEnv(env) === 'production'

/** ¿Se puede publicar en el LinkedIn del fundador? Solo producción. */
export const linkedinPublishingAllowed = (env: NodeJS.ProcessEnv = process.env): boolean => appEnv(env) === 'production'

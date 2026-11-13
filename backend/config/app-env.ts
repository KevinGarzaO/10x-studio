/**
 * En qué entorno corre este proceso: `development` (local o el proyecto de Desarrollo), `beta` (producto beta con personas reales invitadas)
 * o `production`. Es lo que decide si se ejecutan las tareas programadas y las publicaciones: un entorno de prueba NUNCA debe mandar correos
 * reales, publicar en el LinkedIn del fundador ni lanzar el scraper por accidente (docs/infra/01-entornos.md).
 *
 * Cómo se decide (en este orden):
 *  1. `APP_ENV`, si está definida con uno de los tres valores.
 *  2. El nombre del entorno de Railway (`RAILWAY_ENVIRONMENT_NAME`): cada proyecto de Railway tiene su entorno llamado igual (`development`,
 *     `beta`, `production`), así que producción NO necesita ninguna variable nueva para seguir funcionando al desplegar esto.
 *  3. Cualquier otra cosa (tu máquina, una prueba, un valor raro) = `development`: todo lo externo apagado. Equivocarse hacia este lado es seguro.
 */
export type AppEnv = 'development' | 'beta' | 'production'

const KNOWN: readonly AppEnv[] = ['development', 'beta', 'production']
const asEnv = (value: string | undefined): AppEnv | null => {
  const clean = (value ?? '').trim().toLowerCase()
  return (KNOWN as readonly string[]).includes(clean) ? (clean as AppEnv) : null
}

export function appEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return asEnv(env.APP_ENV) ?? asEnv(env.RAILWAY_ENVIRONMENT_NAME) ?? 'development'
}

/** ¿Corren las tareas programadas (scraper, correos, fotos semanales, ocultado del feed, matches…)? Beta y producción sí (cada una con su base y sus llaves); desarrollo nunca. */
export const scheduledJobsEnabled = (env: NodeJS.ProcessEnv = process.env): boolean => appEnv(env) !== 'development'

/** ¿Se puede publicar en el LinkedIn del fundador? Solo producción: beta y desarrollo no deben tocar esa cuenta ni con las llaves puestas. */
export const linkedinPublishingAllowed = (env: NodeJS.ProcessEnv = process.env): boolean => appEnv(env) === 'production'

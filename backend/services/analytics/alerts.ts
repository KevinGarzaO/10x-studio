/**
 * Las alarmas del panel: cosas que, si pasan, hay que enterarse hoy y no dentro de una semana.
 *
 * La razón de existir es concreta: el 23 de octubre el inicio de sesión con LinkedIn dio error 404
 * por el cambio de dominio. Ese día entraron 59 visitantes (el máximo hasta entonces) y no se
 * registró nadie, y nada avisó. Cada regla es algo que ya pasó o que se rompe en silencio.
 *
 * Son funciones puras: `buildAlerts` recibe los números ya calculados, así se prueba cada regla sin
 * base de datos. Quien junta los números es services/analytics/alerts-data.ts.
 */

export interface Alert {
  id: string
  level: 'bad' | 'warn'
  title: string
  detail: string
}

export interface AlertInput {
  /** Hora de Monterrey (0 a 23) en este momento. */
  hourNow: number
  today: { visitors: number; signups: number }
  yesterday: { visitors: number; signups: number }
  linkedin: {
    connected: boolean
    daysLeft: number | null
    publishing: boolean
    siteUrlConfigured: boolean
    failedLast24h: number
    publishedToday: number
    expectedToday: number
  }
}

/** Visitantes a partir de los cuales "nadie se registró" deja de ser casualidad. */
export const TRAFFIC_WITHOUT_SIGNUPS = 25
/** Días antes de que venza el permiso de LinkedIn en que se empieza a avisar. */
export const TOKEN_WARNING_DAYS = 14
/** Desde qué hora (Monterrey) se avisa de un día sin registros: antes, es normal. */
export const SIGNUP_CHECK_FROM_HOUR = 12

export function buildAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = []
  const { today, yesterday, linkedin } = input

  if (yesterday.visitors >= TRAFFIC_WITHOUT_SIGNUPS && yesterday.signups === 0) {
    alerts.push({
      id: 'signups-stalled-yesterday',
      level: 'bad',
      title: 'Ayer nadie se registró',
      detail: `Entraron ${yesterday.visitors} visitantes y 0 se registraron. Prueba el registro y el inicio de sesión (con correo y con LinkedIn): puede estar roto.`,
    })
  } else if (today.visitors >= TRAFFIC_WITHOUT_SIGNUPS && today.signups === 0 && input.hourNow >= SIGNUP_CHECK_FROM_HOUR) {
    alerts.push({
      id: 'signups-stalled-today',
      level: 'warn',
      title: 'Hoy hay visitas pero ningún registro',
      detail: `Van ${today.visitors} visitantes y 0 registros. Si sigue así en unas horas, prueba el registro y el inicio de sesión.`,
    })
  }

  if (!linkedin.connected) {
    alerts.push({ id: 'linkedin-disconnected', level: 'bad', title: 'LinkedIn no está conectado', detail: 'No se puede publicar. Conéctalo desde la sección LinkedIn.' })
  } else {
    if (linkedin.daysLeft !== null && linkedin.daysLeft < 0) {
      alerts.push({ id: 'linkedin-expired', level: 'bad', title: 'El permiso de LinkedIn venció', detail: 'Reconecta LinkedIn: mientras tanto no se publica nada.' })
    } else if (linkedin.daysLeft !== null && linkedin.daysLeft <= TOKEN_WARNING_DAYS) {
      alerts.push({ id: 'linkedin-expiring', level: 'warn', title: `El permiso de LinkedIn vence en ${linkedin.daysLeft} días`, detail: 'Reconéctalo antes de que venza para no interrumpir las publicaciones.' })
    }

    if (!linkedin.publishing) {
      alerts.push({ id: 'publisher-off', level: 'warn', title: 'La publicación automática está apagada', detail: 'Para encenderla agrega LINKEDIN_VACANCY_POSTS=on en el servidor.' })
    } else {
      if (!linkedin.siteUrlConfigured) {
        alerts.push({ id: 'site-url-missing', level: 'bad', title: 'Falta la dirección pública del sitio', detail: 'Configura COMMUNITY_APP_URL en el servidor: sin ella no se publica.' })
      }
      if (linkedin.failedLast24h > 0) {
        alerts.push({ id: 'posts-failed', level: 'bad', title: `${linkedin.failedLast24h} publicación(es) fallaron en las últimas 24 horas`, detail: 'Mira la sección LinkedIn y los registros del servidor.' })
      }
      if (linkedin.expectedToday > linkedin.publishedToday) {
        alerts.push({
          id: 'posts-missed',
          level: 'warn',
          title: 'Faltan publicaciones de hoy',
          detail: `Debían haber salido ${linkedin.expectedToday} y salieron ${linkedin.publishedToday}.`,
        })
      }
    }
  }

  // Lo grave primero.
  return alerts.sort((a, b) => Number(b.level === 'bad') - Number(a.level === 'bad'))
}

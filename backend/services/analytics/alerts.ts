/**
 * Las alarmas del panel: cosas que, si pasan, hay que enterarse hoy y no dentro de una semana.
 *
 * La razón de existir es concreta: el 23 de octubre el inicio de sesión con LinkedIn dio error 404
 * por el cambio de dominio, y nada avisó. Cada regla es algo que ya pasó o que se rompe en silencio.
 *
 * Ojo con el tráfico "directo": ese mismo día entraron 59 visitantes, pero 55 de las 66 entradas eran
 * directas (tus propias pruebas y robots), no gente a la que se le rompió el registro. Por eso la regla
 * de "visitas sin registros" solo cuenta visitantes con un ORIGEN identificado (un enlace de LinkedIn,
 * por ejemplo): son los que de verdad vienen a registrarse.
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
  /** Las últimas 48 horas: visitantes con un origen identificado (no directos) y registros reales. */
  recent: { attributedVisitors: number; signups: number }
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

/**
 * Visitantes con origen, en 48 horas, a partir de los cuales "nadie se registró" deja de ser casualidad.
 * Con la conversión real (8%), 40 visitantes dan unos 3 registros, y la probabilidad de 0 por pura suerte es
 * de 3%. Con 25 en un solo día, sería de 12%: avisaría de más.
 */
export const TRAFFIC_WITHOUT_SIGNUPS = 40
/** Días antes de que venza el permiso de LinkedIn en que se empieza a avisar. */
export const TOKEN_WARNING_DAYS = 14

export function buildAlerts(input: AlertInput): Alert[] {
  const alerts: Alert[] = []
  const { recent, linkedin } = input

  if (recent.attributedVisitors >= TRAFFIC_WITHOUT_SIGNUPS && recent.signups === 0) {
    alerts.push({
      id: 'signups-stalled',
      level: 'bad',
      title: 'Llega gente pero nadie se registra',
      detail: `En las últimas 48 horas entraron ${recent.attributedVisitors} visitantes con origen identificado y 0 se registraron. Prueba el registro y el inicio de sesión (con correo y con LinkedIn): puede estar roto.`,
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

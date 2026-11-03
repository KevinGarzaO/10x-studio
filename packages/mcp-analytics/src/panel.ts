/**
 * Lectura del panel de Telemetry: el agente consulta LAS MISMAS rutas del backend que dibujan el panel
 * (`/api/admin/analytics/*`), con una llave de servicio de solo lectura. Así un número no puede salir distinto en el
 * panel y en el agente: lo calcula el mismo código. El backend, además, le quita a lo que contesta las listas de personas.
 */
export interface PanelClient {
  get(path: string, query: Record<string, string | number>): Promise<unknown>
}

/** Las métricas que el agente puede pedir y la ruta del panel que cada una lee. */
export const PANEL_METRICS = {
  overview: { path: '/overview', about: 'Resumen: personas activas nuevas y recurrentes, registros, conversión, perfiles completos, comparación con el periodo anterior, cola de vacantes.' },
  acquisition: { path: '/acquisition', about: 'Adquisición: de dónde llegan (canal, campaña), personas activas, registros y conversión por origen.' },
  linkedin: { path: '/linkedin', about: 'LinkedIn: publicaciones, visitas, personas activas y registros que trajo cada una.' },
  vacancies: { path: '/vacancies', about: 'Vacantes: vistas, clics en postular y guardados por vacante, y personas que las abren.' },
  matching: { path: '/matching', about: 'Match: qué tan bien le quedan las vacantes a la gente y cuántas le sirven a alguien.' },
  alerts: { path: '/alerts', about: 'Alarmas activas del panel.' },
  changes: { path: '/changes', about: 'Bitácora de cambios con el antes y después (parámetro window = 3, 7 o 14).' },
  performance: { path: '/performance', about: 'Velocidad del servidor por ruta.' },
  retention: { path: '/retention', about: 'Retención de cuentas (user_activity_daily), sin listas de personas.' },
  web_traffic: { path: '/web', about: 'Tráfico web: sesiones, personas, páginas y dispositivos del periodo.' },
  web_segments: { path: '/web/segments', about: 'Desgloses de personas (nuevas/recurrentes, activas/solo visita, registradas/anónimas) por grupo: pasa `list` (all, linkedin, channel, landing, device_category, country, referrer_host...).' },
  web_geo: { path: '/web/geo', about: 'Países y regiones.' },
  web_pages: { path: '/web/pages', about: 'Páginas más vistas.' },
  web_events: { path: '/web/events', about: 'Eventos clave y su conteo.' },
  web_errors: { path: '/web/errors', about: 'Errores agrupados.' },
  web_flows: { path: '/web/flows', about: 'Flujos críticos: intentos, completos, abandonos.' },
  web_apply_funnel: { path: '/web/apply-funnel', about: 'Embudo de postulación por dispositivo (móvil/escritorio) y con/sin cuenta: abrieron la vacante, vieron el botón, lo tocaron, salieron al sitio de la empresa.' },
  accounts_weekly: { path: '/accounts/weekly', about: 'Cuentas nuevas por semana (lunes a domingo, Monterrey) con el cambio contra la semana anterior, el total de cuentas y cuántos perfiles están completos (cantidad y %). Parámetro days no aplica; usa limit = semanas (1 a 26).' },
  push: { path: '/push', about: 'Avisos push: cuántas personas aceptan la invitación, dispositivos activos, enviados, fallidos y tocados por tipo de aviso.' },
  web_rhythm: { path: '/web/rhythm', about: 'Ritmo de la semana (días y horas).' },
  web_retention: { path: '/web/retention', about: 'Retención de las sesiones nuevas (personas activas que vuelven), sin listas de personas.' },
} as const

export type PanelMetric = keyof typeof PANEL_METRICS

export function createPanelClient(baseUrl: string, key: string, fetchImpl: typeof fetch = fetch): PanelClient {
  const root = baseUrl.replace(/\/+$/, '')
  return {
    async get(path, query) {
      const url = new URL(`${root}/api/admin/analytics${path}`)
      for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value))
      const response = await fetchImpl(url, { headers: { 'x-analytics-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(25_000) })
      if (!response.ok) throw new Error(`el panel contestó ${response.status} en ${path}`)
      return response.json()
    },
  }
}

export function panelFromEnv(env: NodeJS.ProcessEnv = process.env): PanelClient | undefined {
  const base = env.BACKEND_URL
  const key = env.ANALYTICS_SERVICE_KEY
  return base && key ? createPanelClient(base, key) : undefined
}

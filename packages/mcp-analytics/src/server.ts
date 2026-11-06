import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { getClarityFrustration, getFunnelDropoffs, getUserSessionRecording, type Queryable } from './queries'
import { getChangeLog, getErrorLogsWithClarityVideo, getFlowPerformanceAnalysis } from './telemetry-queries'
import { PANEL_METRICS, type PanelClient, type PanelMetric } from './panel'
import { getRetentionAndCohorts, getServerSpeed, getSignupSources, getWeeklyRhythm } from './product-queries'

export interface ServerOptions {
  /** El proyecto de Clarity (NEXT_PUBLIC_CLARITY_PROJECT_ID), para armar el enlace al panel. */
  clarityProjectId?: string
  /** Lectura del panel de Telemetry (mismas rutas, mismos números). Sin ella no se registra `get_panel_metric`. */
  panel?: PanelClient
}

/** Un resultado JSON legible para Claude; un error se devuelve como error de la herramienta, no tumba el servidor. */
async function respond(run: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await run(), null, 2) }] }
  } catch (error) {
    return { isError: true, content: [{ type: 'text', text: `No se pudo consultar: ${(error as Error).message}` }] }
  }
}

export function createServer(db: Queryable, options: ServerOptions = {}): McpServer {
  const server = new McpServer({ name: 'avotalent-analytics', version: '0.1.0' })
  // El tipo genérico de registerTool con zod se vuelve infinito para el compilador; se fija la forma que usamos (el esquema
  // zod sigue validando todo lo que llega en tiempo de ejecución).
  const tool = server.registerTool.bind(server) as unknown as (
    name: string,
    config: { title: string; description: string; inputSchema: Record<string, z.ZodTypeAny>; annotations: { readOnlyHint: boolean; openWorldHint: boolean } },
    handler: (args: any) => Promise<CallToolResult>,
  ) => void

  tool(
    'get_funnel_dropoffs',
    {
      title: 'Dónde se cae el embudo',
      description:
        'Embudo del candidato en AvoTalent (llegan > ven una vacante > empiezan a postular > se registran/postulan) con el avance y el abandono entre pasos, ' +
        'las rutas donde terminan las sesiones que NO convirtieron, y la conversión de cada página de entrada. Cuenta personas reales (sin equipo, pruebas ni robots) y es ' +
        'agregado: no identifica a nadie. Úsala primero para localizar DÓNDE cae la conversión; después cruza esa ruta con get_clarity_frustration_data.',
      inputSchema: {
        days: z.number().int().min(1).max(90).default(30).describe('Últimos N días (hora de Monterrey). 30 por defecto.'),
        limit: z.number().int().min(1).max(50).default(15).describe('Cuántas rutas devolver en cada lista.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getFunnelDropoffs(db, args)),
  )

  tool(
    'get_clarity_frustration_data',
    {
      title: 'Frustración visual por página (Clarity)',
      description:
        'Rage clicks (clics repetidos de enojo), dead clicks (clics que no hacen nada), quickbacks (entra y regresa de inmediato) y profundidad de scroll por página, ' +
        'tomados de Microsoft Clarity (se guardan una vez al día). Con `path` exacto (/empleos/dotnet) devuelve también la tendencia día a día; con `path` terminado en * ' +
        '(/vacantes/*) busca por prefijo; sin `path` devuelve las páginas con más frustración del sitio. Incluye los conteos por 100 sesiones para poder comparar páginas.',
      inputSchema: {
        path: z.string().max(300).optional().describe('Ruta que empieza con "/". Termina en * para prefijo. Vacío = las peores páginas.'),
        days: z.number().int().min(1).max(90).default(7).describe('Últimos N días con datos de Clarity.'),
        limit: z.number().int().min(1).max(50).default(15),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getClarityFrustration(db, args)),
  )

  tool(
    'get_user_session_recording',
    {
      title: 'Sesiones y grabación de una persona',
      description:
        'Busca una cuenta por user_id o email y devuelve sus últimas sesiones (entrada, salida, tiempo, si convirtió) y el enlace directo a su video en Clarity (`clarityUrl`, cuando existe) ' +
        'o cómo filtrarlo en Clarity por el "Custom ID" (cuenta) / "Custom session ID". No devuelve el correo ni el nombre. ' +
        'Solo para diagnosticar un caso concreto; trata a la persona con la privacidad que merece.',
      inputSchema: {
        user_id: z.string().uuid().optional().describe('El id de la cuenta (UUID).'),
        email: z.string().email().optional().describe('Alternativa a user_id.'),
        limit: z.number().int().min(1).max(25).default(10).describe('Cuántas sesiones recientes.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getUserSessionRecording(db, { userId: args.user_id, email: args.email, limit: args.limit, clarityProjectId: options.clarityProjectId })),
  )

  tool(
    'get_error_logs_with_clarity_video',
    {
      title: 'Errores recientes con su video de Clarity',
      description:
        'Los errores del sitio (navegador, llamadas a la API y servidor) agrupados y ordenados por frecuencia: mensaje, página, cuántas veces y a cuántas personas afectó, las primeras líneas del stack ' +
        '(del código empaquetado) y el enlace al video de Clarity de la sesión más reciente donde pasó, con el segundo de la sesión en que falló. Opcional `path` para un solo lugar del sitio. ' +
        'Cruza con get_funnel_dropoffs: un error frecuente en una ruta donde cae el embudo es una pista fuerte.',
      inputSchema: {
        days: z.number().int().min(1).max(90).default(7),
        limit: z.number().int().min(1).max(50).default(15),
        path: z.string().max(300).optional().describe('Ruta exacta que empieza con "/" (por ejemplo /vacantes/mi-vacante).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getErrorLogsWithClarityVideo(db, args)),
  )

  tool(
    'get_flow_performance_analysis',
    {
      title: 'Rendimiento de los flujos críticos',
      description:
        'Por flujo (auth_login, auth_register, job_search_filter, job_application, profile_setup = el perfil paso por paso y qué campo bloquea): intentos, personas, tasa de completitud y de abandono, intentos con error técnico, duración y tiempo de carga promedio, ' +
        'intentos con frustración (carga > 2.5 s o rage clicks), paso a paso cuántos llegan y cuántos se pierden hacia el siguiente, y los rage/dead clicks de Clarity en las páginas por donde pasa cada flujo. ' +
        'Equivocarse de contraseña no cuenta como error del flujo. Opcional `flow` para uno solo.',
      inputSchema: {
        days: z.number().int().min(1).max(90).default(30),
        flow: z.string().max(50).optional().describe('Nombre del flujo, por ejemplo job_application.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getFlowPerformanceAnalysis(db, args)),
  )

  tool(
    'get_change_log',
    {
      title: 'Bitácora de cambios y su antes/después',
      description:
        'Los cambios que se han hecho al producto (funciones, arreglos, ajustes de configuración) con su fecha, y por cada uno el promedio por día de personas activas, nuevas activas, sesiones, registros y errores ' +
        'en los días de ANTES y de DESPUÉS (3, 7 o 14 por lado). Cada cambio trae `confidence` y `nearbyChanges`: antes/después no prueba una causa, solo dice qué se movió y qué tan comparable es.',
      inputSchema: {
        windowDays: z.union([z.literal(3), z.literal(7), z.literal(14)]).default(7).describe('Días a cada lado del cambio.'),
        sinceDays: z.number().int().min(1).max(365).default(60).describe('Cuántos días hacia atrás mirar cambios.'),
        limit: z.number().int().min(1).max(100).default(30),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getChangeLog(db, args)),
  )

  tool(
    'get_retention_and_cohorts',
    {
      title: 'Retención, cohortes y personas nuevas contra recurrentes',
      description:
        'Con la definición única de personas del panel: cuántas personas entraron, cuántas son nuevas y cuántas recurrentes, cuántas solo visitaron (ruido), cuántas nuevas se registraron y la conversión (registradas nuevas ÷ nuevas activas); ' +
        'personas activas por día, semana y mes; de las que ya habían entrado antes cuántas volvieron a otro día; y las cohortes semanales de llegada con el % que sigue activo semana a semana. ' +
        'La medición empezó el 30 de octubre de 2026: con pocos días casi nadie ha podido volver. Mira siempre el tamaño de la cohorte.',
      inputSchema: {
        days: z.number().int().min(1).max(90).default(30),
        weeks: z.number().int().min(1).max(12).default(8).describe('Cuántas semanas de cohortes mostrar.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getRetentionAndCohorts(db, args)),
  )

  tool(
    'get_signup_sources',
    {
      title: 'De dónde llegan los registros',
      description:
        'Por canal (origen / medio / campaña), por publicación de LinkedIn y el total de LinkedIn: personas nuevas activas, cuántas se registraron y la conversión. También cuántas cuentas reales se crearon en el periodo. ' +
        'Una persona cuenta una vez en cada canal que visitó; los canales no suman el total. Con pocas personas por canal, 0 % o 100 % casi siempre es azar. ' +
        'OJO: esto son los canales que VISITÓ la gente. Para saber de dónde venía quien terminó REGISTRÁNDOSE (el origen guardado al crear la cuenta) usa get_panel_metric con metric acquisition y lee `registrationOrigins`.',
      inputSchema: {
        days: z.number().int().min(1).max(90).default(30),
        limit: z.number().int().min(1).max(30).default(12).describe('Cuántos canales y publicaciones mostrar.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getSignupSources(db, args)),
  )

  tool(
    'get_weekly_rhythm',
    {
      title: 'Ritmo de la semana',
      description:
        'Cuándo hay gente en AvoTalent: una fila por día (personas activas, nuevas, las que ya tenían cuenta, origen LinkedIn/correo/directo/otro, registros) comparada con la mediana del mismo día de la semana de las últimas 4 semanas ' +
        '(hace falta tener 3: si no, "sin_base"), los días flojos (menos de la mitad de lo normal) y las horas con más personas activas. Las horas son de Monterrey.',
      inputSchema: {
        days: z.number().int().min(7).max(90).default(30),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getWeeklyRhythm(db, args)),
  )

  tool(
    'get_server_speed',
    {
      title: 'Velocidad del servidor',
      description:
        'Cuánto tarda cada ruta de la API: peticiones, errores, promedio, mediana y p95 (estimados con rangos: "hasta N ms"), máximo, tiempo total y qué parte del tiempo del servidor consume. Ordenado por tiempo total. ' +
        'Una ruta es lenta si su p95 pasa de 1 s. Opcional `routeContains` para una ruta concreta (por ejemplo "community/posts" para el feed y la vacante). Solo mide el servidor, no el navegador.',
      inputSchema: {
        days: z.number().int().min(1).max(30).default(1).describe('1 = últimas 24 horas.'),
        routeContains: z.string().max(60).optional().describe('Parte del nombre de la ruta, por ejemplo community/posts.'),
        limit: z.number().int().min(1).max(60).default(15),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => respond(() => getServerSpeed(db, args)),
  )

  const panel = options.panel
  if (panel) {
    const names = Object.keys(PANEL_METRICS) as [PanelMetric, ...PanelMetric[]]
    tool(
      'get_panel_metric',
      {
        title: 'Lo mismo que ve el panel de Telemetry',
        description:
          'Lee la MISMA pantalla del panel de Telemetry (mismo código, mismos números: el agente y el panel no pueden discrepar). Las listas de personas ya vienen sin datos personales. ' +
          'Úsala cuando el dueño o el equipo citen un número del panel, o para comparar contra otra herramienta. Métricas: ' +
          names.map((name) => `${name} (${PANEL_METRICS[name].about})`).join(' · '),
        inputSchema: {
          metric: z.enum(names).describe('Qué pantalla del panel leer.'),
          days: z.number().int().min(1).max(90).optional().describe('Periodo: 1 = últimas 24 h, 7, 30, 90. Según la pantalla.'),
          window: z.number().int().min(3).max(14).optional().describe('Solo `changes`: días antes y después de cada cambio.'),
          list: z.string().max(200).optional().describe('Solo `web_segments`: grupos separados por coma (all, linkedin, channel, landing, device_category, country...).'),
          limit: z.number().int().min(1).max(200).optional(),
        },
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      (args) => respond(async () => {
        const query: Record<string, string | number> = {}
        for (const key of ['days', 'window', 'list', 'limit'] as const) if (args[key] !== undefined) query[key] = args[key]
        return panel.get(PANEL_METRICS[args.metric as PanelMetric].path, query)
      }),
    )
  }

  return server
}

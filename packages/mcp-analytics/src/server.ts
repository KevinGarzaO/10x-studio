import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { getClarityFrustration, getFunnelDropoffs, getUserSessionRecording, type Queryable } from './queries'

export interface ServerOptions {
  /** El proyecto de Clarity (NEXT_PUBLIC_CLARITY_PROJECT_ID), para armar el enlace al panel. */
  clarityProjectId?: string
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
        'Busca una cuenta por user_id o email y devuelve sus últimas sesiones (entrada, salida, tiempo, si convirtió) y cómo abrir su grabación en Clarity ' +
        '(Clarity no da enlaces por API: se filtra por el "Custom ID" = id de la cuenta o el "Custom session ID" = sessionId). No devuelve el correo ni el nombre. ' +
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

  return server
}

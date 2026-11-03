# 009 — Telemetría: errores (con el video de Clarity) y flujos críticos

Estado: **construido el 31 oct 2026**. Falta activarlo: correr `backend/sql/telemetry-migration.sql` en Supabase (después de `web-analytics-migration.sql` y `clarity-migration.sql`).

## Notas (lo que cambió frente al texto original)

Lo pedido se construyó; estas son las diferencias, todas por la forma en que ya está armado AvoTalent o por cómo funciona Clarity:

- **Rutas.** Next no toca la base de datos (regla de 007): el navegador manda a `/api/a/error` y `/api/a/flow` (intermediarios de Next que solo reenvían, mismo sitio que la página para que no los frenen los bloqueadores) y el backend (Railway) guarda, en `POST /api/analytics/error` y `/flow`. No hay `/api/telemetry/*`. Se reutiliza el envío en fila de la analítica (`sendTelemetry`), para que el primer envío de un navegador nuevo reciba la cookie.
- **Sin llave foránea a `analytics_sessions`.** Un error puede llegar antes de que la sesión se guarde, y una llave foránea haría perder justo el error de la primera carga. Las funciones SQL comprueban que la sesión exista y sea de ese mismo navegador; si no, el error se guarda sin sesión.
- **La cuenta sale de la sesión, no del navegador** (un navegador no puede hacerse pasar por otra persona). Lo mismo con la huella del error (`fingerprint`): la calcula el servidor.
- **`clarity_session_url` no se copia en cada error.** Se une al leer con `analytics_clarity_links` (008), así siempre es el enlace más reciente (el enlace llega unos segundos después de abrir la sesión, a veces después del error). Se agregó `seconds_into_session` para saber en qué segundo del video falló.
- **Se agregaron columnas**: en errores, `frames` (stack ya separado en archivo/función/línea), `fingerprint`, `client_id`, `context`, `seconds_into_session`; en flujos, `flow_id` (sin él no se puede saber cuántos intentos se completaron frente a cuántos se abandonaron), `is_final`, `path`, `rage_clicks`, `client_id`, `error_message`.
- **Frustración la decide el servidor**: carga > 2500 ms o rage clicks. Los rage clicks dentro de un flujo los detecta el navegador (3 clics en 1 s a menos de 30 px). Los **dead clicks** no se detectan dentro del flujo (no hay una forma confiable en el navegador); se cruzan por página con los de Clarity (`get_flow_performance_analysis` trae los rage/dead clicks de Clarity en las páginas de cada flujo).
- **Abandono**: el navegador avisa `dropped_off` al irse (best effort), pero el abandono no depende de eso: un intento sin cierre tras 30 minutos cuenta como abandonado. Equivocarse de contraseña (4xx) no es un error del flujo: el intento sigue abierto. `failFlow` se usa para fallos técnicos (5xx o de conexión).
- **Privacidad**: los mensajes y stacks se limpian de correos, tokens, JWT y parámetros de direcciones antes de guardarse; el contexto descarta claves que parezcan secretos; solo se guarda la ruta (sin parámetros). Límite por navegador (60 errores/hora) y por página (10), y el mismo error del mismo navegador dentro de un minuto no se repite. Se excluyen el equipo, las cuentas de prueba, los robots y `?notrack=1`.
- **Los stacks son del código ya empaquetado** (minificado): sirven para agrupar y ubicar el archivo, no para saltar a la línea del fuente. Para eso haría falta subir los source maps (no se hizo).
- **Errores del servidor**: un middleware de Express anota todo error que se escape de una ruta (fuente `backend`) y sigue su camino normal; el navegador también reporta las respuestas 5xx de `fetchJsonWithSession` (fuente `api`).
- **Next.js 16.3**: `error.tsx` y `global-error.tsx` reciben `retry` (no `reset`); está leído de `node_modules/next/dist/docs`.
- **Panel (Telemetry)**: `Tráfico web > Errores` (agrupados, con personas afectadas, stack, video y "ver la sesión") y `Tráfico web > Flujos críticos` (resumen, tiempos y paso a paso con lo que se pierde después de cada paso). **MCP**: 2 herramientas nuevas, `get_error_logs_with_clarity_video` y `get_flow_performance_analysis`.
- **Flujos conectados**: `auth_login` y `auth_register` (llegar a la página > enviar > éxito; también OAuth, que se cierra en `/auth/callback`), `job_search_filter` (buscar en la barra o cambiar un filtro del feed > resultados > abrir una vacante) y `job_application` (abrir el detalle > clic en postular > salir al sitio de la empresa). **Corregido el 2 de noviembre de 2026:** antes, Greenhouse, Lever y Workable se abrían dentro de un marco (iframe) y el flujo solo se cerraba si el sitio avisaba que envió el formulario, algo que casi nunca pasa; en la base **ninguna** postulación quedó como completa (0 de 11 clics). Además el marco quedaba en blanco en muchos sitios y navegadores. Ahora SIEMPRE se abre el sitio de la empresa en otra pestaña (`noopener,noreferrer`, con un aviso y un enlace de respaldo por si el navegador la bloquea) y el flujo se cierra con `external_apply`: salir a postular es el final de lo que se puede medir. Cada vacante que se abre es un intento, así que la tasa de completos de este flujo es baja por diseño (la mayoría solo mira).

## Para activarlo

1. Supabase (editor SQL, en orden): `web-analytics-migration.sql`, `clarity-migration.sql` y `telemetry-migration.sql`. Las tres se pueden correr más de una vez.
2. Nada más: al desplegar, el sitio ya reporta errores y flujos. No hay variables nuevas.
3. Para el MCP: actualizar el SQL del rol de solo lectura (`packages/mcp-analytics/README.md`).

## Requerimiento original (texto tal como se pidió)

# CONTEXTO DEL PROYECTO
En nuestra plataforma web **AvoTalent** (avotalent.app) ya contamos con un módulo interno de analítica de tráfico en PostgreSQL (basado en el estándar de GA4) y la integración de **Microsoft Clarity** con soporte para un servidor MCP.

Para completar nuestra arquitectura de telemetría de categoría enterprise, necesitamos implementar **dos módulos críticos adicionales**:
1. **Módulo de Registro y Rastreo Completo de Errores (Error Tracking & Logs):** Capturar excepciones de frontend/backend a nivel quirúrgico (stack trace, archivo, línea de código, usuario, pantalla y sesión), vinculando directamente cada error registrado con el enlace exacto a la grabación de video/sesión en Microsoft Clarity.
2. **Módulo de Medición de Flujos de Usuario, Latencia y Frustración:** Medir el rendimiento cuantitativo y cualitativo de los flujos críticos de la app (Login, Registro, Búsqueda de Vacantes, Postulación), registrando tiempos de transición, latencia de APIs, abandono de pasos (*step drop-off*) y eventos de frustración cruzados con Clarity (*rage clicks* y *dead clicks*).

Actúa como un **Lead Software Architect, Site Reliability Engineer (SRE) & Full-Stack Data Engineer**. Diseña e implementa la solución técnica completa.

---

## 1. ESPECIFICACIONES TÉCNICAS Y REGLAS DE NEGOCIO

### MÓDULO A: TRACKING DE ERRORES & EXCEPCIONES (DE PUNTA A PUNTA)
- **Captura Frontend Global:** Implementar un `ErrorBoundary` en React y capturadores globales (`window.onerror` y `window.onunhandledrejection`) para atrapar cualquier fallo de renderizado, error síncrono o promesa no manejada.
- **Detalle Quirúrgico:** Cada error debe registrar:
  - Nombre del error (`error_name`), mensaje (`error_message`) y stack trace parseado (`stack_trace` con archivo, función y línea de código exacta).
  - Contexto de usuario: `user_id` (si está autenticado), `session_id`, `client_id`, ruta exacta (`path`), `browser_info` y timestamp.
  - Vinculación Visual: Guardar o asociar el `clarity_session_url` correspondiente a esa sesión para poder abrir el video de Clarity en el instante del fallo.

### MÓDULO B: MEDICIÓN DE FLUJOS, RENDIMIENTO Y FRUSTRACIÓN
- **Flujos Críticos Definidos:**
  1. `auth_login`: Inicio de sesión (OAuth / Email).
  2. `auth_register`: Creación de cuenta.
  3. `job_search_filter`: Filtro y búsqueda activa de vacantes.
  4. `job_application`: Flujo de postulación a vacante (abrir detalle -> clic postular -> confirmación).
- **Métricas a Registrar por Paso de Flujo:**
  - `duration_ms`: Tiempo acumulado que le tomó al usuario pasar de un paso al siguiente.
  - `load_time_ms`: Tiempo de respuesta de las APIs/DB o renderizado de interfaz en ese paso (usando `performance.now()` o Navigation Timing API).
  - `status`: Estado del paso (`completed`, `dropped_off`, `error`).
  - **Indicadores de Frustración:** Integrar banderas cuando un flujo presente latencia alta ($> 2500\text{ ms}$) o se detecten *rage clicks* en el paso.

---

## 2. ENTREGABLES TÉCNICOS REQUERIDOS

Provee todo el código fuente modular, tipado en TypeScript, con instrucciones de ejecución y listo para producción, organizado estrictamente en los siguientes 4 módulos:

---

### MÓDULO 1: DISEÑO DEL ESQUEMA DE BASE DE DATOS (SQL PostgreSQL)
Escribe el script DDL completo con claves primarias, foráneas e índices estratégicos para las nuevas tablas:

1. **`analytics_error_logs`**:
   - `id` (BIGSERIAL, PK)
   - `session_id` (UUID, FK -> `analytics_sessions.session_id`, INDEX)
   - `user_id` (VARCHAR(64), NULLABLE, INDEX)
   - `path` (TEXT, NOT NULL)
   - `error_name` (VARCHAR(150), NOT NULL)
   - `error_message` (TEXT, NOT NULL)
   - `stack_trace` (TEXT, NULLABLE)
   - `error_source` (VARCHAR(20), DEFAULT 'frontend') -- 'frontend' | 'backend' | 'api'
   - `browser_info` (TEXT)
   - `clarity_session_url` (TEXT, NULLABLE)
   - `created_at` (TIMESTAMPTZ, DEFAULT NOW(), INDEX)

2. **`analytics_flow_metrics`**:
   - `id` (BIGSERIAL, PK)
   - `session_id` (UUID, FK -> `analytics_sessions.session_id`, INDEX)
   - `user_id` (VARCHAR(64), NULLABLE)
   - `flow_name` (VARCHAR(50), NOT NULL, INDEX) -- 'auth_login' | 'job_application' | etc.
   - `step_name` (VARCHAR(50), NOT NULL) -- 'start' | 'fill_form' | 'submit' | 'success'
   - `step_order` (INT, NOT NULL)
   - `duration_ms` (INT, DEFAULT 0)
   - `load_time_ms` (INT, DEFAULT 0)
   - `status` (VARCHAR(20), DEFAULT 'completed') -- 'completed' | 'dropped_off' | 'error'
   - `has_frustration` (BOOLEAN, DEFAULT FALSE)
   - `created_at` (TIMESTAMPTZ, DEFAULT NOW())

---

### MÓDULO 2: CLIENTE Y HOOKS DE MEDICIÓN (React / Next.js)
1. **Componente `GlobalErrorBoundary.tsx` & Script Catch-All:**
   - Componente de orden superior (HOC) o Boundary que atrape errores de React.
   - Script para escuchar `window.addEventListener('error')` y `window.addEventListener('unhandledrejection')`.
   - Función helper `reportError(error: Error, customContext?: Record<string, any>)` que envíe el payload estructurado con el stack trace al backend.

2. **Hook de Medición de Flujos `useFlowTracker.ts`:**
   - Hook que permita iniciar, avanzar y finalizar un flujo de usuario.
   - Firma: `useFlowTracker(flowName: string)`
   - Métodos expuestos:
     - `startFlow()`: Inicia el cronómetro del flujo.
     - `trackStep(stepName: string, stepOrder: number, apiLoadTimeMs?: number)`: Registra el paso intermedio calculando `duration_ms`.
     - `failFlow(stepName: string, error: Error)`: Registra el abandono por error.
     - `completeFlow(stepName: string)`: Finaliza el flujo con éxito.

---

### MÓDULO 3: BACKEND ENDPOINTS & INTEGRADOR CON CLARITY (Node.js / Next.js API Routes)
1. **Endpoint `POST /api/telemetry/errors`**:
   - Handler que reciba el reporte de error, obtenga la `clarity_session_url` de la sesión activa en `analytics_sessions` e inserte el registro en `analytics_error_logs`.
2. **Endpoint `POST /api/telemetry/flows`**:
   - Handler que reciba métricas de pasos de flujo, procese tiempos de carga e inserte en `analytics_flow_metrics`.
3. **Actualización del Servidor MCP (Model Context Protocol):**
   - Extender el servidor MCP existente agregando 2 herramientas adicionales para Claude:
     - **`get_error_logs_with_clarity_video`**: Consulta los errores recientes ordenados por frecuencia, retornando el stack trace y la URL del video de Clarity para cada uno.
     - **`get_flow_performance_analysis`**: Retorna el tiempo promedio de carga, tasa de completitud y drop-off por flujo (`flow_name`).

---

### MÓDULO 4: DASHBOARD QUERIES & VISTA EN ADMIN
Escribe las consultas SQL avanzadas para construir el panel de administración unificado de telemetría:

1. **Tabla de Errores con Acceso Directo a Video:**
   - Consulta que liste los últimos 50 errores agrupados por `error_name` y `path`, mostrando el total de usuarios afectados y la URL directa del video de Clarity (`clarity_session_url`) del error más reciente.
2. **Tablero de Rendimiento de Flujos Críticos:**
   - Consulta SQL que calcule por cada `flow_name`:
     - Total de usuarios que iniciaron el flujo vs. completaron.
     - Tasa de Abandono (Drop-off Rate %).
     - Tiempo promedio total de ejecución del flujo (`avg_duration_ms`).
     - Tiempo promedio de carga de API (`avg_load_time_ms`).
     - Cantidad de fallos por error técnico.

Proporciona todo el código limpio, bien comentado y estructurado por archivos para su integración directa en AvoTalent.

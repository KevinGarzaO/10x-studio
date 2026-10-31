# 008 — Microsoft Clarity + servidor MCP de analítica

Estado: **construido el 31 oct 2026**. Falta activarlo (ver "Para activarlo"). Nada se enciende solo: sin las variables, el sitio y el cron no hacen nada.

## Notas (lo que cambió frente al texto original)

Lo pedido se construyó, con estas diferencias que salen de cómo funciona Clarity de verdad y de cómo está armado AvoTalent:

- **No existe `clarity("get", "sessionUrl")`.** El API del navegador de Clarity solo tiene `consent`, `identify`, `set`, `event` y `upgrade`; no entrega el enlace de una grabación, y la API de exportación tampoco lista grabaciones. Por eso **no hay columna `clarity_session_url` ni endpoint `save-clarity-url`**. El vínculo va al revés: el sitio le da a Clarity *nuestros* ids con `clarity("identify", <id de cuenta>, <id de sesión de analítica>, <ruta>)` y etiquetas (`account`, `user_kind`, `avo_session`, `entry_path`); en el panel de Clarity se filtra por **Custom ID** (cuenta) o **Custom session ID** (una fila exacta de `analytics_sessions`). No se manda correo ni nombre.
- **Next no toca la base** (regla de analítica web, 007): por eso no hay Route Handler que escriba en Postgres. La sincronización con la API de Clarity vive en el backend (`services/analytics/clarity.ts`) y corre en un cron diario.
- **`analytics_clarity_metrics` guarda un día por página** (`PRIMARY KEY (day, path)`), no una sola fila por ruta: la API de Clarity solo da las últimas 24 h (1-3 días, 10 llamadas al día, 1000 filas), así que la historia se arma guardando cada día. Se agregó `sessions` y `page_views` para poder dar conteos por 100 sesiones.
- Variable del token: `CLARITY_API_KEY`. El cron se enciende con `CLARITY_SYNC=on`.
- El servidor MCP es de **solo lectura y agregado** (SQL fijo, transacción `READ ONLY`, rol propio con permisos mínimos), no entrega correos ni nombres, y `get_funnel_dropoffs` devuelve rutas y conteos, no a qué persona le pasó cada cosa. Vive en `packages/mcp-analytics`.
- Los nombres exactos de los campos de la respuesta de la API de exportación no están del todo documentados: el lector es tolerante y hay `npm run clarity-sync -- --raw` para verlos con la primera respuesta real.

## Para activarlo

1. Supabase (editor SQL): `backend/sql/clarity-migration.sql`.
2. Clarity: crear el proyecto, copiar el Project ID y generar el token (Settings > Data Export).
3. Vercel: `NEXT_PUBLIC_CLARITY_PROJECT_ID`. Railway: `CLARITY_API_KEY` y `CLARITY_SYNC=on`.
4. Decidir el **consentimiento**: Clarity graba sesiones de personas. Hoy el sitio no tiene aviso de cookies (decisión de 007); Clarity enmascara por defecto texto, números y correos, pero conviene decidirlo antes de encender.
5. Para el MCP: `packages/mcp-analytics/README.md` (rol de solo lectura, compilar y conectarlo a Claude).

## Requerimiento original (texto tal como se pidió)

# Contexto del Proyecto
En nuestra plataforma web **AvoTalent** (avotalent.app) ya tenemos implementado un módulo interno de analítica en PostgreSQL que mide métricas de tráfico y usuarios activos según el estándar de GA4. 

Ahora queremos integrar **Microsoft Clarity** para obtener inteligencia visual (session recordings, heatmaps, rage clicks y dead clicks). Además, buscamos conectar la API de Clarity con nuestra base de datos y exponer ambos orígenes de datos mediante un **Servidor MCP (Model Context Protocol)** para permitirle a Claude realizar análisis cruzados de negocio (cuantitativo + cualitativo/visual).

Actúa como un **Lead Software Architect & Full-Stack Data Engineer**. Diseña e implementa la integración técnica completa de punta a punta.

## 1. Arquitectura y Especificaciones de la Integración

### A. Frontend Tracking & Identificación Personalizada
- Instalar el script de Microsoft Clarity en Next.js (App Router) de forma asíncrona.
- Vincular el `user_id` de nuestra base de datos con la sesión de Clarity mediante `window.clarity("set", "userId", userId)` cuando el usuario se autentique.
- Enviar metadatos personalizados (ej. `user_role`, `plan`, `entry_path`).
- Capturar el enlace directo de la sesión en vivo usando `window.clarity("get", "sessionUrl", callback)` y enviarlo a nuestro backend para guardarlo en la columna `clarity_session_url` de la tabla `analytics_sessions`.

### B. Extracción de Métricas de Frustración mediante la API de Clarity
- Configurar un servicio en el backend para consumir la **Microsoft Clarity Data Export API**.
- Extraer indicadores visuales clave por URL/Ruta: `rage_clicks`, `dead_clicks`, `quick_backs` y `average_scroll_depth`.
- Guardar o actualizar estos agregados en una tabla propia `analytics_clarity_metrics` para permitir consultas SQL directas.

### C. Servidor MCP (Model Context Protocol) para Claude
- Construir un servidor MCP en TypeScript (`@modelcontextprotocol/sdk`) que conecte a Claude con nuestra base de datos PostgreSQL y con la API REST de Microsoft Clarity.
- Definir herramientas (*tools*) que permitan a Claude responder preguntas como: *"¿Por qué está cayendo la conversión en X ruta?"* analizando drop-offs en la BD y correlacionándolos con rage clicks y videos de Clarity.

## 2. Entregables Técnicos Requeridos

Entrega el código limpio, tipado en TypeScript y listo para producción dividido en los siguientes 4 módulos:

### MÓDULO 1: INTEGRACIÓN FRONTEND (Next.js App Router + React Hook)
1. **Componente de Script (`ClarityScript.tsx`):**
   - Script de Clarity integrado con `next/script` cargando de forma asíncrona y segura.
2. **Hook de Sincronización (`useClarityIntegration.ts`):**
   - Hook que escuche los cambios de sesión (`user_id`).
   - Identifique al usuario en Clarity con `window.clarity("set", ...)`.
   - Obtenga la `sessionUrl` de Clarity y realice un `POST /api/analytics/save-clarity-url` a nuestro backend para asociar la URL del video con nuestro `session_id` interno.

### MÓDULO 2: ACTUALIZACIÓN DE BASE DE DATOS & BACKEND API (PostgreSQL + Next.js Route Handler)
1. **Script DDL (SQL):**
   - Alteración de la tabla `analytics_sessions` para agregar la columna `clarity_session_url TEXT NULL`.
   - Creación de la tabla `analytics_clarity_metrics`:
     - `path TEXT PRIMARY KEY`
     - `rage_clicks_count INT DEFAULT 0`
     - `dead_clicks_count INT DEFAULT 0`
     - `quick_backs_count INT DEFAULT 0`
     - `avg_scroll_depth NUMERIC(5,2)`
     - `updated_at TIMESTAMPTZ DEFAULT NOW()`
2. **Endpoint `POST /api/analytics/save-clarity-url`:**
   - Handler en Node.js/Next.js que valide la petición y actualice `clarity_session_url` en la tabla `analytics_sessions` para la sesión actual.
3. **Servicio Cron / Worker (`syncClarityApi.ts`):**
   - Función que consuma la API de Microsoft Clarity Export usando el `PROJECT_ID` y `API_KEY` para sincronizar los contadores de frustración y scroll por ruta hacia la tabla `analytics_clarity_metrics`.

### MÓDULO 3: SERVIDOR MCP (Model Context Protocol en TypeScript)
Crea la estructura de un servidor MCP funcional usando `@modelcontextprotocol/sdk` con las siguientes **3 Tools principales**:

1. **`get_funnel_dropoffs`**:
   - Consulta PostgreSQL para obtener los usuarios y rutas donde ocurrió el mayor abandono del embudo en un rango de fechas.
2. **`get_clarity_frustration_data`**:
   - Consulta los datos de la API de Clarity o la tabla `analytics_clarity_metrics` para obtener rage clicks, dead clicks y métricas de scroll de una ruta específica.
3. **`get_user_session_recording`**:
   - Busca en PostgreSQL un `user_id` o `email` y retorna la URL directa del video de Clarity (`clarity_session_url`) guardada en su sesión.

### MÓDULO 4: EJEMPLO DE ANÁLISIS CRUZADO & INSTRUCCIONES DE USO
1. **Guía de Configuración:** Variables de entorno requeridas (`NEXT_PUBLIC_CLARITY_PROJECT_ID`, `CLARITY_API_KEY`, `DATABASE_URL`).
2. **Prompt de Ejemplo para Claude:** Muestra de cómo interactuar con el servidor MCP creado para realizar diagnósticos cruzados de comportamiento de usuarios (ejemplo: relacionar la tasa de caída de conversiones en `.NET` con los rage clicks del filtro de vacantes).

Proporciona todo el código modular, bien comentado y listo para copiar e integrar en AvoTalent.

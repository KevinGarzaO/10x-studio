# 007 — Analítica web propia (reglas de GA4)

Estado: **construido el 30-31 oct 2026**. Falta activarlo: correr la migración y poner `ANALYTICS_PROXY_SECRET` (ver "Para activarlo").

## Requerimiento (resumen de lo pedido)

Un módulo propietario de analítica, atribución y medición de tráfico para AvoTalent, en nuestra base de datos (Postgres / Supabase), que replique el modelo de datos, las métricas y la atribución de GA4: control total de los datos, sin pérdidas por bloqueadores, análisis con SQL y el tráfico conectado a los eventos de la plataforma (postulaciones, registros).

- **Sesión activa (`is_engaged`)**: 10 s o más con la pestaña visible (se pausa al cambiar de pestaña, minimizar o bloquear), O 2 o más vistas de página, O al menos un evento clave (`user_registration_success`, `click_external_apply`, `profile_completed`). Sin eso, la sesión queda como tráfico bruto.
- **Identidad**: `client_id` (UUID v4, cookie `_avo_cid`, 2 años) y `user_id`. **User stitching**: al registrarse o iniciar sesión, una transacción atómica asigna el `user_id` a la sesión actual y a TODAS las sesiones y eventos pasados de ese `client_id`.
- **Contexto por sesión**: país, región y ciudad (cabeceras `x-vercel-ip-*` / `cf-ip*`), dispositivo, sistema, navegador, idioma, página de entrada, UTM y sitio de referencia.
- **Tablas**: `analytics_sessions`, `analytics_page_views`, `analytics_events`.
- **Cliente**: cookie, tiempo activo con la API de visibilidad, latidos cada 5-10 s, envío final al cerrar, `trackEvent`, detección de rutas.
- **Servidor**: `POST /api/analytics/collect` (`session_start`, `heartbeat`, `page_view`, `event`) y `executeUserStitching(clientId, userId)`.
- **Consultas del panel**: DAU/WAU/MAU, embudo con abandono, rendimiento por página de entrada (SEO), atribución por canal y cohortes semanales (ya con el stitching).

## Decisiones (30 oct 2026)

- **Next no toca la base de datos.** Las rutas de Next (`apps/community/app/api/a/collect` e `identify`) solo reenvían al backend (Railway), que es quien guarda. Están en el mismo sitio que la página para que los bloqueadores no las vean como un tercero, para poder poner la cookie como `HttpOnly` con 2 años completos y para recibir las cabeceras de ciudad de Vercel.
- **Corre en paralelo** a `landing_visits`, `vacancy_events` y `user_activity_daily` hasta que las cifras cuadren; solo entonces se retira lo viejo.
- **Sin aviso de cookies por ahora**; se verá más adelante.
- **GA4 ya está instalado** (gtag), así que se pueden comparar las dos fuentes. No esperar cifras idénticas: GA4 aplica filtros de robots, umbrales y datos modelados propios.
- **No se guarda la IP**: solo país, región y ciudad.
- Además de lo pedido se guarda: versión del navegador y del sistema, resolución de pantalla, zona horaria, si es visitante nuevo, página de salida y los parámetros de la dirección (sin tokens, códigos ni correos).

## Cómo quedó

| Pieza | Dónde |
|---|---|
| Tablas, funciones de escritura, stitching y consultas | `backend/sql/web-analytics-migration.sql` |
| Reglas de sesión activa | en SQL (`analytics_heartbeat`, `analytics_record_page_view`, `analytics_record_event`): una transacción cada una |
| Validación de lo que manda el navegador | `backend/services/web-analytics/payload.ts` |
| Dispositivo, sistema y navegador | `backend/services/web-analytics/user-agent.ts` (a mano: `ua-parser-js` 2.x es AGPL) |
| Recolección y stitching | `backend/services/web-analytics/collect.ts`, `backend/src/routes/analytics/collect.routes.ts` |
| Intermediario de la comunidad | `apps/community/lib/analytics-proxy.ts`, `app/api/a/*` |
| Cliente | `apps/community/lib/web-analytics.ts`, `components/web-analytics.tsx` |
| Panel | `/panel/trafico`, `GET /api/admin/analytics/web` |

Seguridad: el navegador nunca ve ni manda su `client_id` (va en la cookie `HttpOnly`); el backend solo cree la ciudad, el User-Agent y el `client_id` si traen `ANALYTICS_PROXY_SECRET`; el `user_id` del stitching sale del token verificado; qué es "conversión" lo decide una lista fija del servidor; el tiempo activo nunca puede pasar del tiempo real de la sesión; las funciones SQL solo las ejecuta `service_role`.

## Para activarlo

1. Correr `backend/sql/web-analytics-migration.sql` en el editor SQL de Supabase.
2. Poner la MISMA variable `ANALYTICS_PROXY_SECRET` (un texto largo al azar) en Vercel (comunidad) y en Railway (backend) y volver a desplegar.
3. Entrar a `/panel/trafico`. Los números empiezan en cero y se llenan con las visitas nuevas; lo anterior no se puede reconstruir.

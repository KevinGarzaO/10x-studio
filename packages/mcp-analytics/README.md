# @avocado/mcp-analytics

Servidor MCP (Model Context Protocol) **de solo lectura** para que Claude consulte la analítica de AvoTalent y haga análisis cruzados:
lo cuantitativo (embudo, abandono, conversión) con lo visual (rage clicks, dead clicks y grabaciones de Microsoft Clarity).

No escribe nada. Cada herramienta ejecuta SQL **fijo** (Claude solo manda valores, validados) dentro de una transacción `READ ONLY` con
tiempo límite, y devuelve datos agregados: no entrega correos ni nombres.

## Herramientas

| Herramienta | Qué responde |
|---|---|
| `get_funnel_dropoffs` | El embudo del candidato con avance y abandono entre pasos, las rutas donde terminan las sesiones que **no** convirtieron y cómo convierte cada página de entrada. |
| `get_clarity_frustration_data` | Rage clicks, dead clicks, quickbacks y scroll por página (ruta exacta, prefijo con `*`, o las peores páginas si no se da ruta), con tendencia día a día y conteos por 100 sesiones. |
| `get_user_session_recording` | Por `user_id` o `email`: sus últimas sesiones y el enlace a su grabación en Clarity. |
| `get_error_logs_with_clarity_video` | Los errores recientes (navegador, API, servidor) por frecuencia: mensaje, página, personas afectadas, primeras líneas del stack y el video de Clarity de la sesión más reciente donde pasó, con el segundo en que falló. |
| `get_retention_and_cohorts` | Personas nuevas contra recurrentes, solo visitaron, conversión (registradas nuevas ÷ nuevas activas), activas por día/semana/mes, cuántas volvieron y las cohortes semanales. |
| `get_signup_sources` | De dónde llegan las personas nuevas y los registros: por canal, por publicación de LinkedIn y el total de LinkedIn, con su conversión. |
| `get_weekly_rhythm` | Una fila por día (activas, nuevas, las que ya tenían cuenta, origen, registros) contra el mismo día de otras semanas, los días flojos y las horas con más gente. |
| `get_server_speed` | Por ruta de la API: peticiones, errores, mediana y p95 estimados, tiempo total y qué parte del servidor consume. |
| `get_change_log` | Los cambios hechos al producto con su fecha y, por cada uno, el promedio por día de personas activas, nuevas activas, sesiones, registros y errores en los días de antes y de después (3, 7 o 14), con su comparabilidad. Antes/después no prueba una causa. |
| `get_flow_performance_analysis` | Por flujo crítico (iniciar sesión, crear cuenta, buscar vacantes, postularse): completitud, abandono, tiempos, frustración, paso a paso, y los rage/dead clicks de Clarity en sus páginas. |

## Cómo se conecta Clarity con nuestra base: el video de cada sesión

Clarity **no tiene** una función del navegador para pedir el enlace de una grabación (no existe `clarity("get", "sessionUrl")`) y su API de
exportación no lista grabaciones. Pero su reproductor tiene una dirección con forma conocida, que se arma con tres datos:

```
https://clarity.microsoft.com/player/<proyecto>/<usuario de Clarity>/<sesión de Clarity>
```

El script de Clarity deja el usuario y la sesión en las cookies `_clck` y `_clsk` de nuestro dominio. El navegador (`apps/community/lib/clarity.ts`)
arma esa dirección y la manda por `/api/a/clarity` al backend, que la guarda ligada a **nuestra** sesión de analítica en `analytics_clarity_links`
(solo si es una dirección del reproductor de Clarity y la sesión es de ese navegador). Así:

- En **Tráfico web > Sesiones** cada sesión con grabación trae un enlace **▶ Video** (y un botón en el detalle de la sesión).
- `get_user_session_recording` devuelve `clarityUrl` por sesión.
- Para abrir el video hay que haber iniciado sesión en el proyecto de Clarity.

Además, el sitio le da a Clarity nuestros ids (`clarity("identify", <id de la cuenta>, <id de la sesión de analítica>, <ruta>)`) y etiquetas
(`account`, `user_kind`, `avo_session`, `entry_path`), por si prefieres filtrar en su panel: **Custom ID** = una cuenta, **Custom session ID** = una visita.
No se manda correo ni nombre; Clarity convierte el id en un hash antes de enviarlo.

Límites que conviene saber:
- **La dirección del reproductor no está documentada por Microsoft** (es la que usan sus propias integraciones y varias guías). Si cambia, se ajusta `clarityPlayerUrl` en `lib/clarity.ts` y nada más.
- **No todas las sesiones tienen video**: Clarity muestrea, **conserva las grabaciones unos 30 días** (más si las marcas como favoritas) y no graba a quien bloquea su script o las cookies. En esos casos el panel muestra "—".
- Si pasan más de 30 minutos de inactividad, Clarity y nuestra analítica abren sesión nueva por separado; se queda ligada la última grabación vista.

Las métricas de frustración sí vienen por API: un cron diario (`backend/services/analytics/clarity.ts`) guarda en `analytics_clarity_metrics`
las de las últimas 24 h por página (la API solo da 1 a 3 días, 10 llamadas al día y 1000 filas, por eso se guarda el historial propio).

## Configuración

### 1. Base de datos (una vez, en el editor SQL de Supabase)

Correr `backend/sql/clarity-migration.sql` y después `backend/sql/telemetry-migration.sql` (errores y flujos), además de las migraciones de analítica web que ya existen.

### 2. Clarity

1. Crear el proyecto en <https://clarity.microsoft.com> y copiar su **Project ID**.
2. Settings → Data Export → *Generate new API token* (solo un admin del proyecto puede).

### 3. Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Vercel (`apps/community`) | Opcional: en producción Clarity ya se enciende solo con el proyecto de AvoTalent (`z6emolc22r`). Cámbiala para usar otro; **vacía** apaga Clarity sin tocar el código. También arma el enlace al panel en esta herramienta. |
| `CLARITY_API_KEY` | Railway (backend) | El token de la API de exportación. **Nunca** en un archivo del repositorio. |
| `CLARITY_SYNC=on` | Railway (backend) | Enciende el cron diario (23:55 hora de Monterrey). Apagado por defecto. |
| `DATABASE_URL` | Solo en tu computadora, en la configuración del cliente MCP | Conexión Postgres **de solo lectura** (abajo). |

Prueba manual de la sincronización (gasta 1 de las 10 llamadas diarias; `--raw` imprime lo que respondió Clarity para comprobar los nombres de los campos):

```bash
cd backend && npm run clarity-sync -- --raw
```

### 4. Un rol de solo lectura para el MCP

El servidor ya abre cada consulta como `READ ONLY`, pero lo correcto es que ni siquiera pueda leer de más. En el editor SQL de Supabase
(cambia la contraseña) y usa ese rol en `DATABASE_URL`:

```sql
CREATE ROLE avo_mcp_reader LOGIN PASSWORD 'CAMBIA-ESTA-CLAVE';
GRANT USAGE ON SCHEMA public TO avo_mcp_reader;
GRANT SELECT ON analytics_real_sessions, analytics_sessions, analytics_events, analytics_clarity_metrics, analytics_clarity_links,
  analytics_error_logs, analytics_flow_metrics, analytics_flow_runs, product_changes, api_timing_hourly TO avo_mcp_reader;
GRANT SELECT (id, email, user_kind, created_at, is_test_account, is_scraper_profile) ON users TO avo_mcp_reader;
GRANT EXECUTE ON FUNCTION analytics_funnel(int), analytics_landing_performance(int, int), analytics_period_start(int),
  analytics_error_summary(int, int), analytics_flow_summary(int), analytics_flow_steps(int),
  analytics_window_metrics(timestamptz, timestamptz), analytics_change_impact(int, int, timestamptz),
  analytics_active_users(int), analytics_retention_cohorts(int), analytics_people_activity(int, int),
  analytics_segments(timestamptz, timestamptz, text, int), analytics_rhythm_days(int), analytics_rhythm_heatmap(int),
  api_timing_summary(int) TO avo_mcp_reader;
-- Las tablas tienen RLS activado: sin una política, el rol no vería ninguna fila.
CREATE POLICY mcp_read ON analytics_sessions        FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON analytics_events          FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON analytics_clarity_links   FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON analytics_error_logs      FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON analytics_flow_metrics    FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON analytics_clarity_metrics FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON product_changes           FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON api_timing_hourly         FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON users                     FOR SELECT TO avo_mcp_reader USING (true);
```

Usa la cadena de conexión del *pooler* de Supabase (Project Settings → Database), con ese usuario y su contraseña.

### 5. Compilar y conectarlo a Claude

```bash
pnpm install
pnpm --filter @avocado/mcp-analytics build
```

**Claude Code** (desde la raíz del repositorio):

```bash
claude mcp add avotalent-analytics --env DATABASE_URL="postgresql://avo_mcp_reader:...@...:6543/postgres" --env NEXT_PUBLIC_CLARITY_PROJECT_ID="abc123" -- node packages/mcp-analytics/dist/index.js
```

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "avotalent-analytics": {
      "command": "node",
      "args": ["C:/ruta/al/repo/packages/mcp-analytics/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://avo_mcp_reader:...@...:6543/postgres",
        "NEXT_PUBLIC_CLARITY_PROJECT_ID": "abc123"
      }
    }
  }
}
```

Pruebas: `pnpm --filter @avocado/mcp-analytics test` (cliente MCP real contra Postgres real en memoria, con las migraciones verdaderas).

## Servidor remoto (Railway)

Además del modo local (stdio), el mismo servidor corre como servicio HTTPS en Railway para que el agente no dependa de ninguna computadora. `src/http.ts` arranca `src/http/app.ts`: las **mismas herramientas de solo lectura**, detrás de un inicio de sesión (OAuth 2.1) de **un solo dueño**.

**Por qué OAuth.** Un conector personalizado de Claude solo acepta servidores sin autenticación o con OAuth (no hay una llave fija que pegar). Sin autenticación cualquiera con la dirección leería tus cifras, así que este servidor es su propio servidor de autorización con una sola regla: se entra con la **clave del dueño**.

**Cómo protege.**
- Registro dinámico de clientes, pero **solo con las direcciones de regreso de Claude** (`https://claude.ai/api/mcp/auth_callback` y la de `claude.com`); cualquier otra se rechaza.
- Pantalla de acceso con la clave del dueño (`MCP_OWNER_KEY`); **5 intentos fallidos** desde una dirección la bloquean 15 minutos.
- PKCE obligatorio; el código de autorización dura 5 minutos y sirve **una vez**; el token de acceso dura 1 hora y el de renovación 30 días (rota, cada uno sirve una vez).
- Todo va **firmado con HMAC** (`MCP_TOKEN_SECRET`): no se guarda nada, así que un despliegue no cierra la sesión de nadie.
- **Botón de emergencia:** subir `MCP_TOKEN_EPOCH` (o cambiar `MCP_TOKEN_SECRET`) en Railway invalida de golpe todo lo emitido y obliga a conectar de nuevo.
- Todas las herramientas siguen siendo de solo lectura, con consultas fijas y el rol `avo_mcp_reader`; el servidor no responde nada en otras rutas (404).

**Variables del servicio** (pestaña Variables en Railway; nunca en un archivo):

| Variable | Qué es |
|---|---|
| `DATABASE_URL` | La conexión del rol de solo lectura. **Usa la del «Transaction pooler» de Supabase** (puerto 6543, usuario `avo_mcp_reader.<proyecto>`): la conexión directa solo funciona con IPv6 y Railway no lo tiene. |
| `MCP_PUBLIC_URL` | La dirección pública del servicio, `https://...up.railway.app`, sin barra final. |
| `MCP_TOKEN_SECRET` | Clave que firma todo (mínimo 32 caracteres, al azar). |
| `MCP_OWNER_KEY` | La clave que escribe el dueño al conectar Claude (mínimo 20 caracteres, al azar; guárdala en tu gestor de contraseñas). |
| `MCP_TOKEN_EPOCH` | Opcional (1 por defecto). Súbela para cortar todo acceso. |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Opcional, para armar enlaces a Clarity. |

Genera las dos claves en tu computadora (cada comando da una distinta):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Pasos.**
1. Railway: servicio nuevo desde el repositorio; en Settings > Config as Code pon `/packages/mcp-analytics/railway.toml`.
2. En Variables, las de arriba. Despliega y, en Settings > Networking, genera el dominio público; ponlo en `MCP_PUBLIC_URL` y vuelve a desplegar.
3. Comprueba `https://<tu-dominio>/health` (debe decir `{"ok":true}`).
4. Claude (claude.ai o Desktop) > Settings > Connectors > Add custom connector: `https://<tu-dominio>/mcp`. Se abre la pantalla de acceso: escribe `MCP_OWNER_KEY`.

Probar en local: `pnpm --filter @avocado/mcp-analytics test` incluye `tests/http.test.ts` (el flujo completo: registro, acceso, PKCE, renovación, bloqueo y corte de emergencia).

## Ejemplo de diagnóstico cruzado

> Usa el servidor avotalent-analytics. La conversión de las visitas que entran por las vacantes de .NET bajó esta semana.
> 1. Con `get_funnel_dropoffs` (últimos 14 días) dime en qué paso del embudo y en qué rutas se pierde más gente, y cómo convierte `/empleos/dotnet` frente al resto de páginas de entrada.
> 2. Con `get_clarity_frustration_data` mira `/empleos/dotnet` y `/vacantes/*` de los últimos 14 días: ¿hay rage clicks o dead clicks por cada 100 sesiones por encima del resto del sitio? ¿Empezaron justo cuando cayó la conversión (usa la tendencia diaria)? ¿El scroll es bajo (la gente no llega a las vacantes)?
> 3. Si algún día destaca, dame las sesiones de una cuenta que se haya caído ahí con `get_user_session_recording` y dime qué grabación abrir en Clarity.
> Cierra con una hipótesis (por ejemplo "el filtro de vacantes no responde al clic en móvil") y qué revisaría primero para confirmarla. Distingue lo que viene de los datos de lo que es suposición.

## Límites que conviene tener presentes

- Las métricas de Clarity solo existen **desde el día que se encienda el cron**; Clarity no entrega historial anterior.
- Los nombres de los campos de la API de exportación no están del todo documentados por Microsoft: el lector es tolerante, pero con la primera respuesta real hay que correr `clarity-sync -- --raw` y confirmar que las páginas y los conteos salen bien.
- Clarity graba sesiones de personas: revisa el aviso de privacidad y el consentimiento antes de encenderlo en producción. Clarity enmascara por defecto los campos de texto, números y correos, y **no debe usarse en sitios dirigidos a menores de 18**.

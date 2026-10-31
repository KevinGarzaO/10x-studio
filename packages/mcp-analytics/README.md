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
| `get_user_session_recording` | Por `user_id` o `email`: sus últimas sesiones y cómo abrir su grabación en Clarity. |

## Cómo se conecta Clarity con nuestra base (y por qué no hay `clarity_session_url`)

Clarity **no tiene** una función del navegador para pedir el enlace de una grabación (no existe `clarity("get", "sessionUrl")`),
y su API de exportación no lista grabaciones. Entonces el vínculo va al revés: el sitio le da a Clarity **nuestros** ids
(`apps/community/lib/clarity.ts`):

- `clarity("identify", <id de la cuenta>, <id de la sesión de analítica>, <ruta>)` → en Clarity se filtra por **Custom ID** (todas las grabaciones de una cuenta) o **Custom session ID** (esa visita, que es exactamente una fila de `analytics_sessions`).
- Etiquetas `account` (registered/anonymous), `user_kind`, `avo_session` y `entry_path` para filtrar y segmentar.
- Nunca se manda el correo ni el nombre; Clarity convierte el id en un hash antes de enviarlo.

Las métricas de frustración sí vienen por API: un cron diario (`backend/services/analytics/clarity.ts`) guarda en `analytics_clarity_metrics`
las de las últimas 24 h por página (la API solo da 1 a 3 días, 10 llamadas al día y 1000 filas, por eso se guarda el historial propio).

## Configuración

### 1. Base de datos (una vez, en el editor SQL de Supabase)

Correr `backend/sql/clarity-migration.sql` (además de las migraciones de analítica web que ya existen).

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
GRANT SELECT ON analytics_real_sessions, analytics_sessions, analytics_events, analytics_clarity_metrics TO avo_mcp_reader;
GRANT SELECT (id, email, user_kind, created_at) ON users TO avo_mcp_reader;
GRANT EXECUTE ON FUNCTION analytics_funnel(int), analytics_landing_performance(int, int), analytics_period_start(int) TO avo_mcp_reader;
-- Las tablas tienen RLS activado: sin una política, el rol no vería ninguna fila.
CREATE POLICY mcp_read ON analytics_sessions        FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON analytics_events          FOR SELECT TO avo_mcp_reader USING (true);
CREATE POLICY mcp_read ON analytics_clarity_metrics FOR SELECT TO avo_mcp_reader USING (true);
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

# Interruptores por grupo (feature flags)

Decidido el 13 de noviembre de 2026. Una función nueva se publica **apagada** y se enciende por pasos, sin volver a desplegar. Así se prueba con el equipo, luego con personas beta y luego con porcentajes crecientes de todos, y se puede apagar al instante.

## La escalera

`Apagado → Equipo → Beta → 1 % → 10 % → 25 % → 50 % → Todos`

Cada paso **incluye a los anteriores**: en «Beta» la ven el equipo y las personas beta; en «10 %» además el 10 % del resto.

| Paso | Quién la ve |
|---|---|
| Apagado | Nadie, ni el equipo ni quien se puso a mano. Es el botón de emergencia. |
| Equipo | Superadmin, cuentas de prueba y las marcadas como «equipo». |
| Beta | Lo anterior + la lista beta que marca el fundador. |
| 1 / 10 / 25 / 50 % | Lo anterior + ese porcentaje del resto de cuentas con sesión. |
| Todos | Todo el mundo, también quien no ha iniciado sesión. |

Reglas finas (están en `backend/services/flags/evaluate.ts` y probadas):

- **Sin sesión** solo se ve en «Todos». Un porcentaje necesita una persona.
- **El número de cada persona es fijo** (hash de `nombre_del_interruptor:id`): quien entra al 1 % sigue dentro al subir al 10 %. Nadie entra y sale al azar. Y cada interruptor reparte distinto: estar en el 1 % de uno no te pone en el 1 % de todos.
- **Excepciones por persona**: «allow» la ve aunque su paso no le toque; «deny» no la ve aunque le toque. Con «Apagado» nadie la ve.

## Cómo se usa una función nueva (para quien programa)

1. En el panel (Analítica → **Interruptores**) crea `nombre_en_minusculas` con descripción y **fecha de retiro** (máximo un año). Nace apagado.
2. En el backend, protege la ruta nueva: `router.post('/x', requireFlag('nombre'), handler)` (`middleware/require-flag.middleware.ts`). Sin la función, la ruta contesta 404 como si no existiera. **Esta es la defensa real**; ocultar un botón no es un permiso.
3. En la pantalla: `const ver = useFlag('nombre')` (`apps/community/lib/flags.ts`). Mientras no llegue la respuesta, o si falla, todo está apagado.
4. Los cambios de base de datos van **primero y compatibles** (expandir): columnas o tablas nuevas que el código viejo ignora. Se quita lo viejo (contraer) solo cuando la función ya está en «Todos» y retirada.
5. Al llegar a «Todos» y estar estable, quita `useFlag`/`requireFlag` del código y borra el interruptor desde el panel. Un interruptor vencido sale en rojo en el panel y en el resumen del agente.

## Cómo se sube (recetario)

| Paso | Espera mínima | Se vigila (Telemetry) | Se aborta si |
|---|---|---|---|
| Equipo | 1 día de uso propio | Errores nuevos (Tráfico web → Errores) | cualquier error de la función |
| Beta | 2 a 3 días | Errores, Flujos críticos, feedback | errores 5xx o flujos que abandonan más que antes |
| 1 % | 1 día | Errores y velocidad | un error repetido, ruta lenta (p95 > 1 s) |
| 10 % | 2 días | Lo anterior + embudo de la función | caída en conversión o retención de quienes la ven |
| 25 % / 50 % | 2 días cada uno | Igual | igual |
| Todos | — | Igual una semana | igual; si algo falla, bajar al paso anterior |

Con poca gente (hoy ~80 cuentas) el 1 % son 1 o 2 personas: úsalo como prueba de humo, no como medición. Bajar de paso quita a las últimas que entraron primero, nunca al azar. **Apagado** es siempre la salida de emergencia.

## Qué queda registrado

Cada cambio de paso guarda quién, cuándo, de dónde a dónde y una nota (`feature_flag_log`) y crea una entrada `config` en la bitácora de cambios (`product_changes`), para que el antes/después del panel sepa cuándo se encendió algo. Antes/después nunca prueba una causa.

## Piezas

- SQL: `backend/sql/feature-flags-migration.sql` (4 tablas, RLS cerrada, borrado en cascada con la cuenta). Hay que correrla en cada entorno.
- Regla: `backend/services/flags/evaluate.ts` (pura). Carga y caché: `flags.service.ts` (15 s las funciones, 30 s la persona; ante cualquier fallo, **todo apagado**, nunca lanza).
- Rutas: `GET /api/community/flags` (solo las encendidas, `no-store`); administración en `/api/admin/analytics/flags/*` (fundador). El agente lee solo conteos: métrica `feature_flags`.
- Pantalla: `FlagsLoader` pide las funciones al abrir, al volver a la pestaña y al entrar o salir una sesión (evento `avo:session-changed`).

## Fase 2 (no hecho)

Marcar en cada evento de analítica qué interruptores tenía activos la persona, para medir una función contra quienes no la ven.

## Lo que NO se puede proteger con un interruptor

El cambio de Supabase a Railway Postgres se ensaya completo en pre-producción y se hace en una ventana corta de mantenimiento, con regreso por variables.

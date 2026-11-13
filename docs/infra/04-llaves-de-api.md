# Regla de diseño: toda API exige una llave de aplicación

Decidido el 13 de noviembre de 2026. **Toda API de AvoTalent, en todos los entornos (local, desarrollo, pre-producción y producción), exige la cabecera `x-api-key`.** Aplica a las APIs actuales (`api-community`, `api-telemetry`, la API completa) y a toda API nueva que se cree.

## Qué es y qué NO es

| | Llave de aplicación (`x-api-key`) | Token de sesión (`Authorization: Bearer`) |
|---|---|---|
| Dice | **Qué aplicación** llama (la web, el panel, un servidor) | **Quién es la persona** |
| Quién la emite | Nosotros, una por cliente y por entorno | El inicio de sesión (GoTrue) |
| Dura | Hasta que se rota | ~1 hora, se renueva |
| Sin ella | La API contesta 401 y **no ejecuta nada** | Las rutas con sesión contestan 401 |

Son dos capas que conviven: primero la llave (¿puedes tocar la puerta?), luego el token (¿quién eres?).

## Para qué sirve (y para qué no)

Sirve para: rechazar escáneres y peticiones al azar que no conocen la llave, saber qué cliente manda cada petición, **rotar o apagar la llave de un cliente sin tocar a los demás**, y medir o limitar por cliente.

**No** es un secreto cuando viaja en una página web. La llave del navegador (`NEXT_PUBLIC_API_KEY`) la puede leer quien abra la página, así que es un *identificador* de la aplicación. En ese camino la protección real son la sesión, los límites de uso, CORS y (en entornos privados) la protección de Vercel. Las llaves de **servidor a servidor** (intermediario de analítica, conector del agente) sí son secretos y nunca llegan al navegador.

## Llaves: una por cliente y por entorno

Nunca la misma llave en dos entornos. Cada una de 24 caracteres o más, con nombre.

| Cliente | Nombre | Dónde se guarda | Visible en el navegador |
|---|---|---|---|
| App de personas (navegador) | `web` | Vercel: `NEXT_PUBLIC_API_KEY` | Sí: identificador |
| Panel de telemetría (navegador) | `panel` | Vercel: `NEXT_PUBLIC_API_KEY` | Sí: identificador |
| Servidor de Next (páginas, metadatos, intermediario de analítica) | `servidor` | Vercel: `API_KEY_SERVER` | **No: secreto** |
| Conector del agente de producto | `agente` | Railway del conector: `BACKEND_API_KEY` | No: secreto |

En el backend (Railway), las mismas llaves juntas: `API_KEYS=web:<llave>,panel:<llave>,servidor:<llave>,agente:<llave>` y `API_KEY_MODE`.

## Modos (`API_KEY_MODE`)

- `off`: no revisa nada. Es lo que hay si no existe `API_KEYS`.
- `report`: deja pasar todo pero **cuenta y registra** las peticiones sin llave o con llave inválida (una línea por minuto, `[LlaveAPI]`). Sirve para ensayar en producción sin romper a nadie.
- `enforce`: sin llave válida, 401. Es lo que hay si existe `API_KEYS` y no se dice otra cosa.

## Exentos (no pueden mandar cabeceras o traen su propia firma)

`OPTIONS` (consulta previa del navegador), `/` (chequeo de salud), `/api/files/*` y `/api/community/favicon/*` (se cargan con `<img>`), el inicio de OAuth (redirección del navegador), el regreso de LinkedIn, `/api/webhooks/*` (llevan su firma), el clic de un aviso push (lo manda el service worker), `/sitemap.xml`, `/api-docs` y `/uploads/*`. La lista es exacta y está probada en `backend/tests/unit/api-key.test.ts`; añadir una excepción nueva es una decisión de diseño que se anota aquí.

## Cómo se pone en producción (sin romper a nadie)

1. Fusionar el PR con el código (por omisión no cambia nada: sin `API_KEYS` el filtro está apagado).
2. Generar las 4 llaves de producción (propias, distintas de las de otros entornos) y ponerlas: en Railway (`API_KEYS` con `API_KEY_MODE=report`) y en Vercel (`NEXT_PUBLIC_API_KEY`, `API_KEY_SERVER`) y en el conector (`BACKEND_API_KEY`).
3. Desplegar las pantallas con su llave y **mirar el registro** `[LlaveAPI]` unos días: debe mostrar solo llaves válidas por cliente y casi nada «sin llave» (lo que quede son escáneres).
4. Pasar a `API_KEY_MODE=enforce`. Vuelta atrás inmediata: poner `report` u `off`.
5. Las apps móviles o clientes nuevos reciben su propia llave con nombre antes de existir.

## Rotación

Cada llave se rota al menos cada 6 meses y de inmediato si se sospecha que se filtró. Se agrega la llave nueva con otro nombre (`web2:...`) junto a la vieja, se despliegan los clientes con la nueva y se quita la vieja. El registro `[LlaveAPI]` muestra si algo sigue usando la vieja.

## Pendiente

- Limitar por cliente (`apiClient`) y por persona: hoy la llave identifica al cliente, pero el límite de uso es el siguiente paso.
- Mostrar el conteo por cliente en el panel de telemetría (hoy solo va al registro).

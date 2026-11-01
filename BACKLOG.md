# Backlog de AvoTalent

Estado al **31 de octubre de 2026**. Se trabaja **de a poco**: una cosa a la vez, en el orden de la tabla de la sección 2. Al terminar una, se marca aquí y se sube.

- Detalle del plan original: [requirements/005-retention-and-engagement-roadmap.md](requirements/005-retention-and-engagement-roadmap.md) (usa las letras viejas; la columna "Antes" de abajo dice cuál es cuál).
- Plan del CRM y el webhook de Resend: [requirements/006-resend-webhook-and-crm.md](requirements/006-resend-webhook-and-crm.md)
- Reglas ya decididas que no se rehacen: sección 3 y `CLAUDE.md`.
- **Funciones nuevas (monetización, planes de pago, comisiones) solo empiezan cuando termine este backlog.** Meta: enero de 2027.

## Sprints

| Sprint | Qué entra | Dónde está |
|---|---|---|
| **Noviembre 2026** | **0** primero (medir los días flojos), y después todo lo pendiente que había hasta el 31 de octubre: las letras **A a W** | Sección 2 |
| **Diciembre 2026** | Letras propias del sprint, otra vez desde la **A**: **A** inicio de sesión con Google · **B** Pixel de Meta y su API · **C** compartir vacantes y discusiones con OG bien hecho · **D** pantallas legales, de privacidad y de cookies · **E** jefe de producto con Claude: un agente robusto que revisa, avisa, propone, diseña y actúa solo con tu aprobación (se hace al final, con 2 meses de datos) · **F** días muertos: medirlos y traer a nuestra propia gente de vuelta | Sección 2B |

> **Las letras empiezan de nuevo en cada sprint.** Cuando haga falta distinguirlas se dice "A de noviembre" o "A de diciembre".

Lo que no alcance en noviembre se **recorre a diciembre** (empezando por lo de prioridad P4), con su letra nueva, y diciembre se vuelve a ordenar al arrancar. Diciembre sigue creciendo: se agrega aquí cuando lo pases.

---

## 1. Ya hecho

### Retención por correo y avisos (antes C)
- [x] Recordatorio de perfil incompleto (a las 72 h, una vez por persona).
- [x] Invitaciones a tu lista de contactos (máximo 2 correos por persona).
- [x] Correos de bienvenida (personas nuevas y fundadores).
- [x] Avisos de "Para ti" (coincidencia de 80 % o más) y resumen semanal (martes/miércoles).
- [x] Campana con avisos en la app, página de notificaciones y preferencias en Ajustes.
- [x] Cuota de correos de Resend: 100 por 24 horas móviles (tope propio de 90, con reservas).

### Diseño, etapas 1 a 4 (antes H, parte de diseño)
- [x] Etapa 1: tarjetas del feed (borde suave, una sola barra verde para "Para ti", una línea de por qué, números compactos).
- [x] Etapa 2: cabecera del feed con saludo y cifras reales, filtros (Todo, Para ti, Vacantes, Discusiones, Remoto, Mi nivel) y barra de avance del perfil.
- [x] Etapa 3: login y registro (sin el dato inventado de "2,400+ developers"), barra superior más baja, onboarding más limpio. El perfil público ya estaba alineado.
- [x] Etapa 4: esqueletos de carga (feed, detalle de vacante y publicación, perfil, guardados, avisos), estados vacíos con una acción, arreglos de modo oscuro y móvil.
- [x] Columnas laterales: cada sección es su propia tarjeta (izquierda: menú, puestos y temas en tendencia; derecha: cada widget).

### Velocidad
- [x] "Para ti" se calcula de fondo y se guarda (`vacancy_matches`); abrir el inicio solo lo lee. Se recalcula al guardar el perfil y cada 30 minutos. (Migración ya corrida.)
- [x] El feed se pinta una sola vez, con vacantes y "Para ti" juntas (espera hasta 3 s a "Para ti").
- [x] Páginas más chicas en el feed (10 vacantes y 4 artículos por tanda).
- [x] Onboarding: se muestra al instante con el usuario guardado, con botón Reintentar si no hay conexión; el aviso de perfil ya no espera el catálogo de skills.
- [x] Admin: respuestas guardadas 60 s (el botón de recargar las recalcula), lecturas grandes de 4 páginas a la vez, y las pantallas muestran lo último que vieron mientras actualizan.

### Reglas de vacantes
- [x] Cupo diario = cola ÷ días que faltan para el próximo lote (ciclo de 15 días; mínimo 5, máximo 120). Ya no son 20 fijas por día. La publicación corre todos los días a las 9:00.
- [x] Las vacantes pueden tener hasta **45 días** de antigüedad (antes 30).
- [x] Solo se publican vacantes que **le sirven a alguien**: encajan y comparten al menos un skill con una persona real. Las demás esperan en la cola y se revisan cada día. El panel Match usa la misma regla.

### Admin
- [x] Usuarios: buscador, páginas de 25, filtro y columna "Registro con" (Correo, GitHub, LinkedIn) y totales de todas las cuentas reales.
- [x] Retención: tabla ordenada por días activos, "¿Volvió?", cajitas de los últimos 14 días, tarjeta "Volvieron", día de registro en hora de Monterrey, y total de cuentas reales frente a las que han entrado desde que se mide.
- [x] **Retención nueva** dentro de Tráfico web (`/panel/trafico/retencion`): personas activas, quién volvió, DAU/WAU/MAU, tabla de quién usa AvoTalent y cohortes semanales, sobre las sesiones nuevas. La de Analítica se dejó intacta. Necesita `web-analytics-retention-migration.sql`.
- [x] **Telemetría de errores y flujos críticos** (`requirements/009-telemetry-errors-and-flows.md`): errores del navegador, de las llamadas a la API y del servidor, agrupados, con la gente afectada y el video de Clarity; y los flujos iniciar sesión, crear cuenta, buscar vacantes y postularse, con tiempos, abandono paso a paso y frustración (carga lenta o rage clicks). Pantallas Tráfico web > Errores y Flujos críticos, y 2 herramientas más en el MCP. Necesita `telemetry-migration.sql`.
- [x] **Microsoft Clarity + servidor MCP de analítica** (`requirements/008-clarity-and-mcp.md`): el sitio le pasa a Clarity la cuenta y la sesión, un cron diario guarda rage/dead clicks, quickbacks y scroll por página, y `packages/mcp-analytics` deja que Claude cruce embudo y frustración. Apagado hasta activarlo (migración `clarity-migration.sql`, `NEXT_PUBLIC_CLARITY_PROJECT_ID`, `CLARITY_API_KEY`, `CLARITY_SYNC=on`) y decidir el aviso de consentimiento.
- [x] **Analítica web propia con las reglas de GA4**, corriendo en paralelo a la anterior: sesiones, tiempo activo con la pestaña visible, eventos, unión de visitas anónimas con la cuenta, y el módulo **Tráfico web** del admin (en vivo, sesión por sesión con su detalle, mapa, audiencia, páginas, canales, embudo, cohortes). Detalle en `requirements/007-web-analytics-ga4.md`.
- [x] El menú del admin son módulos que se pliegan: **Analítica** y **Tráfico web**.
- [x] El Resumen del admin cuenta solo **visitantes activos**, separados en nuevos y recurrentes, y mide la conversión sobre los nuevos.
- [x] Celular: el feed va primero, sin el menú encima, y el menú hamburguesa se abre bien y se cierra al navegar.
- [x] Todas las tablas del admin son como la de Usuarios: buscador, páginas de 10 y, donde aplica, filtro (`DataTable`). Cubre Adquisición (2), LinkedIn (4), Match (5), Retención (quién usa AvoTalent) y Vacantes (ahora las 100 más abiertas). La tabla de cohortes de Retención no, porque es un mapa de calor y no una lista.
- [x] Usuarios: cambiar de filtro o de página ya no recarga toda la pantalla; solo se atenúa la tabla mientras llega.
- [x] Editor de publicaciones: dar clic en una letra de la barra de Markdown ya no manda el texto hasta abajo (se conserva la selección y el scroll).

---

## 2. Pendiente: sprint de noviembre (todo, con letra, prioridad y orden)

**Prioridad:** **P1** urgente (seguridad, fugas, que lo que ya existe funcione) · **P2** alta (valor claro, se hace pronto) · **P3** media · **P4** después. **Tamaño** estimado con Claude Code: **S** unas horas o menos · **M** medio día a un día · **L** varios días.

| Orden | Letra | Pendiente | Prioridad | Tamaño | Antes |
|---|---|---|---|---|---|
| 0 | **0** | Ritmo de la semana: medir los días y las horas flojas (se hace primero) | P2 | M | nuevo (pedido 31 oct) |
| 1 | **A** | Cerrar la API (que no entregue vacantes sin sesión) | P1 | M | A |
| 2 | **B** | Llave de Resend con acceso completo y rotar el token pegado en el chat | P1 | S | cabo suelto |
| 3 | **C** | Revisar las variables de entorno de Railway | P1 | S | cabo suelto |
| 4 | **D** | Velocidad real: medir con tu base y revisar las secciones lentas del admin | P1 | M | cabo suelto |
| 5 | **E** | Las 156 vacantes que no le sirven a nadie y el conteo de la cola | P2 | S | cabo suelto |
| 6 | **V** | Feedback en cada sección y página de la app | P2 | M | nuevo (pedido 30 oct) |
| 7 | **W** | Que la sesión no se pierda (y entrar directo desde el correo) | P2 | M | nuevo (pedido 31 oct) |
| 8 | **F** | Confianza en las vacantes (reportar, cola de revisión, enlaces vivos) | P2 | M | B |
| 9 | **G** | Webhook de Resend | P2 | M | plan nuevo |
| 10 | **H** | Comunidad: seguir, likes, respuestas y menciones | P2 | L | D |
| 11 | **I** | SEO y GEO (posición 0 en Google y citas de las IA) | P2 | M | H (parte SEO/GEO) |
| 12 | **J** | CRM en el admin y termómetro "Valiosas" | P3 | L | plan nuevo |
| 13 | **K** | Validación de skills: más preguntas de examen | P3 | M | E |
| 14 | **L** | Mis postulaciones | P3 | M | F |
| 15 | **M** | Filtro de señal humana en la analítica (en espera) | P3 | M | en espera |
| 16 | **N** | Arreglar la prueba de retención que depende de la hora | P3 | S | cabo suelto |
| 17 | **O** | Moderación y reportes | P4 | M | G |
| 18 | **P** | Sembrar la comunidad con algunas discusiones | P4 | S | G |
| 19 | **Q** | Perfil como CV y barra de qué tan completo está | P4 | M | G |
| 20 | **R** | Privacidad de cuenta (contraseña, borrar, exportar) | P4 | M | G |
| 21 | **S** | Medir las vistas de los artículos del equipo | P4 | S | cabo suelto |
| 22 | **T** | Subir a git el documento de plan de monetización | P4 | S | cabo suelto |
| 23 | **U** | Tener presente: la actividad se mide desde el 24 de octubre | Informativo | — | cabo suelto |

> El CRM (**J**) queda en P3 por tamaño y porque primero conviene el webhook (**G**), pero si quieres adelantarlo es una decisión tuya.

### 0. Ritmo de la semana: medir los días y las horas flojas — P2 · M · se hace PRIMERO
Pedido el 31 de octubre. Un sábado entraron 8 visitantes y ninguno vino de LinkedIn; nadie lo vio venir porque hoy no hay una pantalla que muestre **cuándo** hay gente y cuándo no. Se hace antes que todo lo demás de noviembre por una razón práctica: **la línea base de cada día de la semana necesita semanas de datos**, y cada día que pasa sin esta pantalla es un día que no se puede comparar después. Es la parte de medición de F de diciembre (días muertos); las activaciones para traer a nuestra gente siguen siendo de diciembre.
- [x] Pantalla en Telemetry, dentro de Tráfico web: **"Ritmo de la semana"**. Personas **activas** por día de la semana y por hora (hora de Monterrey) en un mapa de calor, con las personas nuevas y los registros de cada día. Con la misma definición de personas del resto del panel (activa, nueva, registrada).
- [x] **Por origen**, en la misma pantalla: cuánto de cada día viene de LinkedIn, correo, directo y de personas que **ya tenían cuenta**. Así se ve si un día flojo es porque afuera se calló o porque los nuestros no vuelven.
- [x] **Cada día contra el mismo día de otras semanas** (un sábado con otros sábados, no con un martes): la mediana de las últimas semanas y cuánto se quedó por debajo. Mientras haya menos de 3 semanas de ese día dice "aún no hay base" en lugar de inventar una comparación.
- [x] Marca visible de **día flojo** (por debajo de la mitad de su normal) en la tabla de días, para verlo sin tener que calcularlo. La alarma que avisa a media tarde queda en F de diciembre, junto con las alertas de errores.
- [x] **Qué se publicó cada día** en la misma línea (publicaciones de LinkedIn, correos enviados), para poder ver si el día flojo coincide con que no se mandó nada. Incluye la regla nueva de 4 publicaciones al día, todos los días.
- [x] Los números salen de las sesiones nuevas de analítica (no de la medición vieja) y respetan el equipo, las cuentas de prueba y los robots. Con pruebas contra una base real (PGlite), como el resto de la analítica.
- [x] Se actualiza sola cada 10 s como el resto de las pantallas de Telemetry.
- **Hecho el 1 de noviembre de 2026** (junto con la bitácora de cambios; ver `requirements/010-change-log-and-weekly-rhythm.md`). Falta que corras `web-analytics-rhythm-migration.sql` en Supabase. Las comparaciones con el mismo día de otras semanas dirán «aún no hay base» hasta que haya 3 semanas de cada día (hacia la tercera semana de noviembre).

### A. Cerrar la API — P1 · M
**Alcance acordado el 1 de noviembre de 2026 (cambia el texto de arriba):** NO se cierra el feed, NO se cambia ninguna ruta y NO se toca lo público para SEO (`/seo/*`, que sí existe y trae la versión sin contacto). Solo se cierra **el detalle de una vacante** para que ningún robot lo lea sin sesión.
- [x] `GET /api/community/posts/:id` (por id o slug) contesta **401** a quien no tiene una sesión válida cuando es una vacante. Discusiones y artículos siguen públicos. Probado (`backend/tests/unit/vacancy-detail-auth.test.ts`).
- [x] La tarjeta que ven LinkedIn y WhatsApp (`generateMetadata` del layout de la vacante) ahora lee la versión pública `/seo/vacancy/:slug`, no el detalle.
- [x] La página de la vacante sin sesión se arma con esa versión pública (título, empresa, skills) detrás del aviso de registro; con sesión se vuelve a pedir el detalle completo. "Postularse" y el cuadro de registro siguen apareciendo.
- [x] **Las listas también**: el listado del feed (`GET /posts?type=job`) y las vacantes del perfil de una empresa (`/companies/:slug`) o de una persona (`/users/:username`) devolvían la fila completa (`select('*')`) también sin sesión. Ahora, sin sesión, cada vacante sale reducida a lo que pinta una tarjeta (lista blanca en `backend/services/community/guest-view.ts`: sin descripción, enlace de postulación, contactos ni texto original; el contenido se queda solo con las líneas de empresa, rol, ubicación, presupuesto y modalidad). El feed sigue abierto y se ve igual. Probado en `backend/tests/unit/guest-view.test.ts`.

### B. Llave de Resend y token — P1 · S
- [ ] Crear en Resend una llave con **acceso completo** (sin ella no se pueden leer aperturas ni rebotes; el webhook de **G** quitaría esa necesidad).
- [ ] **Rotar el token** de Resend que se pegó en el chat y ponerlo en Railway.

### C. Variables de Railway — P1 · S
- [ ] Revisar que estén bien puestas: `RESEND_API_KEY`, `INVITE_EMAILS`, `WELCOME_EMAILS`, `WELCOME_FOUNDERS_EMAILS`, `MATCH_ALERTS`, `MATCH_DIGEST`, `PROFILE_REMINDER_EMAILS`, `LINKEDIN_VACANCY_POSTS`, `COMMUNITY_APP_URL`.

### D. Velocidad real — P1 · M
Ya se aceleró la capa común del admin y "Para ti"; falta comprobarlo con datos de verdad.
- [ ] Medir los tiempos de carga con tu base y tu conexión, en las dos apps.
- [ ] Revisar una por una las demás secciones lentas del admin (hasta ahora solo se aceleró la capa común).
- [ ] Corregir lo que siga lento.

### E. Vacantes que no le sirven a nadie y conteo de la cola — P2 · S
- [ ] Decidir si se retiran del feed las **156 vacantes** publicadas que no le sirven a nadie (elegiste aplicar la regla solo a las nuevas). Se propone no retirar las que tengan comentarios o guardados.
- [ ] Hacer que "En cola" y el cupo diario del panel cuenten solo las vacantes que sí sirven (hoy cuentan la cola completa y se leen más altos que lo real).

### F. Confianza en las vacantes — P2 · M
- [ ] Botón "Reportar vacante" para los miembros.
- [ ] Cola de revisión para ti en el admin.
- [ ] Revisar que los enlaces de postulación sigan vivos.

### G. Webhook de Resend — P2 · M
Detalle en [requirements/006-resend-webhook-and-crm.md](requirements/006-resend-webhook-and-crm.md).
- [ ] **Decisión tuya:** las aperturas de correo son solo dato orientativo (poco confiables: Apple Mail y otros cargan el pixel solos); las etapas se basan en clics y registros.
- [ ] Ruta firmada `POST /api/webhooks/resend` (se monta antes de `express.json`; solo acepta lo firmado).
- [ ] Tabla `email_events` sin duplicados.
- [ ] Estado de cada envío actualizado con cada evento; un rebote o una queja suprime a la persona de futuros envíos.
- [ ] Reemplaza la consulta periódica que exige la llave de acceso completo (**B**).

### H. Comunidad: seguir, likes, respuestas — P2 · L
Necesita una tabla compartida de "follows" que también alimente los avisos.
- [ ] Seguir personas.
- [ ] Seguir empresas (avisar de vacantes nuevas).
- [ ] Seguir un skill.
- [ ] Seguir un puesto.
- [ ] Guardar discusiones y artículos (hoy solo se guardan vacantes).
- [ ] Likes en discusiones, artículos y comentarios (los votos de los artículos del equipo hoy son solo locales: no tienen fila donde guardarse).
- [ ] Respuestas y menciones entre usuarios.
- [ ] Botón "Seguir" en las tarjetas flotantes (hoy existen, pero sin botón porque seguir no existe).

### I. SEO y GEO — P2 · M
Meta: posición 0 en Google (fragmentos destacados, preguntas frecuentes). El diseño ya está hecho.
- [ ] Archivo `llms.txt`.
- [ ] Páginas con respuestas cortas y citables.
- [ ] Más datos estructurados (discusiones, perfiles, empresas).
- [ ] Permitir los rastreadores de IA.
- [ ] Medir cuántas veces nos citan.
- [ ] Mejorar el SEO de discusiones, perfiles y empresas.

### J. CRM en el admin y termómetro "Valiosas" — P3 · L
Plan completo en [requirements/006-resend-webhook-and-crm.md](requirements/006-resend-webhook-and-crm.md). Va después del webhook (**G**).
- [ ] **Decisión tuya:** los datos del CRM los ven solo los superadmins y nunca salen por la API pública.
- [ ] **Decisión tuya:** primera versión de solo lectura, más notas y etiquetas; sin enviar correos desde el CRM.
- [ ] Datos por persona (medio día): vista `person_timeline` con registro, origen, visitas, vacantes vistas y guardadas, actividad, exámenes, avisos y correos.
- [ ] Admin en dos módulos (un día): el menú actual pasa a ser el módulo **Analítica** y se crea el módulo **CRM** con las pantallas Personas y Ficha de persona.
- [ ] Termómetro "Valiosas" (medio día): puntuación de 0 a 100 por persona, con etapa (fría, tibia, caliente), el porqué de cada punto y la tendencia frente a 30 días antes. Los pesos se calibran con datos reales.
- [ ] Resto de pantallas del CRM: Correos, Invitaciones, Segmentos (listas guardadas y exportables) y Empresas.

### K. Validación de skills — P3 · M
- [ ] Banco de preguntas más grande: hoy el examen tiene pocas preguntas. Plan: preguntas redactadas con IA para los 15 skills más pedidos y aprobadas por ti en el admin.

### L. Mis postulaciones — P3 · M
- [ ] Marcar "ya me postulé".
- [ ] Estado sencillo de cada postulación.
- [ ] Recordatorios.

### M. Filtro de señal humana en la analítica — P3 · M · en espera
El 29 de octubre, de 10:15 a 12:50 (Monterrey), hubo 167 vistas de 167 visitantes nuevos, en 150 vacantes distintas, sin origen y sin ninguna acción (0 postulaciones, guardados ni registros). Casi seguro fue un navegador automático: distorsiona visitantes, conversión y la popularidad del feed. Lo pusiste en espera.
- [ ] Confirmar la causa con los registros de Vercel (User-Agent) y Google Search Console del 29 de octubre.
- [ ] Contar una vista o visita solo si la página estuvo visible unos segundos **y** hubo un movimiento, scroll, tecla o toque.
- [ ] Opcional: SQL para marcar esa ráfaga.

### N. Prueba de retención que depende de la hora — P3 · S
- [ ] `analytics-routes.test.ts` (retención) falla según la hora por la zona horaria (UTC frente a Monterrey). No es un error del producto; hay que arreglar la prueba.

### O. Moderación y reportes — P4 · M
- [ ] Reportar publicaciones y comentarios, y una cola para revisarlos.

### P. Sembrar la comunidad — P4 · S
- [ ] Publicar algunas discusiones para que la comunidad no se vea vacía.

### Q. Perfil como CV — P4 · M
- [ ] Botón "usar mi perfil como CV".
- [ ] Barra de qué tan completo está el perfil.

### R. Privacidad de cuenta — P4 · M
- [ ] Cambiar contraseña.
- [ ] Borrar la cuenta.
- [ ] Exportar los datos.

### S. Vistas de los artículos — P4 · S
- [ ] Medir las vistas de los artículos del equipo (hoy no se miden).

### T. Documento de monetización — P4 · S
- [ ] Subir a git `docs/AvoTalent-Plan-de-Producto-y-Monetizacion` (Word y PDF), que sigue sin commit.

### U. Tener presente — Informativo
- La actividad de las personas se mide **desde el 24 de octubre**. Las cuentas más antiguas que no han vuelto a entrar no aparecen como activas, y ese dato no se puede reconstruir hacia atrás. No hay nada que hacer, solo tenerlo en cuenta al leer Retención.

### V. Feedback en cada sección y página — P2 · M
Pedido el 30 de octubre: que en cada sección y página de la app las personas puedan escribir su feedback. Hoy no hay forma de que nos digan qué falla o qué les gustaría; con una comunidad chica cada comentario vale mucho.
- [ ] Botón fijo "Feedback" en todas las páginas de la comunidad (y en el admin), siempre al alcance y sin tapar el contenido en móvil.
- [ ] Ventana corta: tipo (idea, problema, elogio), mensaje, y opcionalmente la captura o el correo para responder.
- [ ] Contexto automático: la página donde estaba, la sección, la persona (si tiene sesión), el dispositivo y el navegador. Así nadie tiene que explicar "dónde estaba".
- [ ] Secciones clave con su propia entrada ("¿Te sirvió esto?" o "Mejorar esto") que mande la etiqueta de esa sección: el feed, "Para ti", el detalle de la vacante, el perfil, el onboarding, Ajustes y las pantallas del admin.
- [ ] Tabla `feedback` con RLS activo, y límite por persona (por ejemplo 5 al día) para que no se llene de basura.
- [ ] Lo que escriben las personas es texto no confiable: se muestra siempre como texto, nunca como HTML.
- [ ] Pantalla en el admin para leerlo: filtro por página y tipo, estado (nuevo, leído, atendido), y un aviso con el número de nuevos.
- [ ] Más adelante, que aparezca en la ficha de la persona del CRM (**J**).
- [ ] **Decisión tuya:** ¿también pueden dejar feedback los visitantes sin cuenta (con un correo opcional), o solo quien tiene sesión? Propuesta: solo con sesión al inicio, porque los visitantes solo ven el feed y así se evita el spam.
- [ ] **Decisión tuya:** cómo quieres enterarte de los nuevos. Propuesta: contador en el admin y un resumen diario por correo solo si hay alguno (poco volumen, cabe en la cuota de Resend).

### W. Que la sesión no se pierda (y entrar directo desde el correo) — P2 · M
Pedido el 31 de octubre, al ver un video: alguien con cuenta entró por un aviso "Para ti" y el sitio le pidió iniciar sesión otra vez. Un aviso por correo llega justo a quien tiene la sesión vieja (la mayoría de los destinatarios entró por última vez hace 5 a 20 días), así que esto cuesta justo en lo que más queremos que funcione.
**Hecho el 31 de octubre (arreglos pequeños, ya en el código):**
- [x] La renovación de la sesión era frágil: cualquier fallo (sin red, servidor lento, error 5xx) **borraba la sesión**, y varias pantallas renovaban a la vez con el mismo token de un solo uso, de modo que la que llegaba segunda fallaba y borraba lo que la primera acababa de guardar. Ahora hay **una sola renovación a la vez**, se renueva **antes** de pedir con un token vencido, y la sesión solo se borra si el servidor la **rechaza de verdad** (el servidor ahora responde 503, no 401, cuando Supabase no contestó bien). Si otra pestaña ya renovó, se usa esa sesión.
- [x] La analítica dejaba como **anónima** a toda persona que regresaba con la sesión vencida (0 de 11 sesiones ligadas a una cuenta, aunque había gente dentro): ahora renueva antes de ligar la visita con la cuenta.
- [x] Se mide: `session_renewed`, `session_lost` (con el motivo: `refresh_rejected`, `refresh_unavailable` o `token_missing`) y `auth_wall_shown` (el aviso de registro de la vacante, con `had_session_before`: si este navegador ya había tenido sesión). Se ven en Tráfico web > Embudo y eventos.
**Pendiente:**
- [ ] **Revisar los datos** de esos tres eventos tras unas semanas: ¿cuántas personas con cuenta ven el aviso de registro? ¿por qué motivo? Con eso se decide cuál de las dos siguientes vale la pena primero.
- [ ] **Sesión en una cookie del servidor de larga duración** (en lugar de solo `localStorage`). Safari y los navegadores de iPhone recortan el almacenamiento del sitio si no se entra en unos 7 días; una cookie puesta por el servidor no sufre ese recorte. Es el cambio de fondo (login, renovación y cierre pasan por el servidor de la comunidad) y se hace con cuidado.
- [ ] **Entrar directo desde el correo:** que el enlace de los avisos "Para ti" lleve un acceso de **un solo uso, con vencimiento corto y ligado a esa vacante**, para no pedir nada. **Decisión tuya (seguridad):** si el correo se reenvía, otra persona entraría a esa cuenta; se limita con el vencimiento, el uso único y pidiendo confirmación para lo delicado (cambiar contraseña, borrar cuenta).
- [ ] Recordar con qué proveedor entró cada persona (LinkedIn, GitHub o correo) y ofrecérselo primero en el aviso.

---

---

## 2B. Sprint de diciembre (letras A a F)

**Prioridad:** igual que arriba (P1 urgente · P2 alta · P3 media · P4 después). **Tamaño:** S unas horas · M medio día a un día · L varios días.

| Orden | Letra | Pendiente | Prioridad | Tamaño |
|---|---|---|---|---|
| 1 | **A** | Inicio de sesión con Google | P2 | M |
| 2 | **B** | Pixel de Meta y su API de conversiones | P3 | M |
| 3 | **C** | Compartir vacantes y discusiones con OG bien hecho | P2 | M |
| 4 | **D** | Pantallas legales, de privacidad y de cookies | P2 | L |
| 5 | **E** | Jefe de producto con Claude (agente con aprobación en cada acción y alertas de errores) | P2 | L · arranca con 2 meses de datos |
| 6 | **F** | Días muertos: medirlos y traer a nuestra propia gente de vuelta | P2 | L |

> Las prioridades son una propuesta mía: A y C ayudan a que llegue y se comparta más gente (P2); B solo rinde cuando se anuncie en Meta, y además depende del tema de cookies (P3). D es P2 por orden de diciembre, pero **conviene adelantarla**: desde que Clarity se enciende, el sitio graba sesiones sin aviso de cookies (ver la nota de D). E va **al final a propósito**: necesita unos 2 meses de datos de la medición nueva (desde el 31 de octubre) para que sus conclusiones valgan; cuando llegue ese momento es lo que más valor da, por eso P2. Cámbialas si quieres.

### A (diciembre). Inicio de sesión con Google — P2 · M
Hoy se entra con correo, GitHub o LinkedIn. Falta Google, que es la cuenta que casi todos tienen.
- [ ] Crear el cliente OAuth en Google Cloud (pantalla de consentimiento, dominios autorizados y la dirección de regreso de Supabase) y activar Google como proveedor en Supabase.
- [ ] Backend: agregar `google` a los proveedores permitidos (`OAUTH_PROVIDERS` y `AUTHORIZE_KEYS` en `auth.routes.ts`) y guardarlo como `users.provider = 'google'`.
- [ ] Botón "Continuar con Google" en login, registro y en la ventana de acceso (`AuthModal`), con su ícono.
- [ ] La foto de Google se copia a nuestro almacenamiento como las de GitHub y LinkedIn (sus enlaces también vencen).
- [ ] Cuentas con el mismo correo en distintos proveedores: que no se dupliquen ni se confundan.
- [ ] El admin muestra "Google" en "Registro con" (tabla de Usuarios, filtro y desglose).
- [ ] Medirlo: el registro y el inicio de sesión con Google llegan a la analítica con su método (`method: google`).
- [ ] Pruebas, incluido el regreso del proveedor y la cuenta nueva contra la existente.

### B (diciembre). Pixel de Meta y su API de conversiones — P3 · M
Para medir y optimizar anuncios en Facebook e Instagram. "API de tracking" lo entendí como el Pixel en el navegador **más** la API de conversiones desde el servidor (la que no se pierde con los bloqueadores).
- [ ] **Decisión tuya (cookies):** el Pixel usa cookies de publicidad. Lo normal es no cargarlo hasta que la persona acepte, lo que obliga a hacer el aviso de cookies que dejamos para después. Decidir si el aviso entra con esto.
- [ ] Pixel base en la comunidad (no en el admin) con el ID en una variable de entorno, apagado en navegadores con `?notrack=1`.
- [ ] Mapa de eventos, reusando los de la analítica propia: `PageView`, `ViewContent` (detalle de una vacante), `Lead` o `InitiateCheckout` (empezar a postular), `CompleteRegistration` (registro) y un evento propio para perfil completo.
- [ ] API de conversiones desde el backend con el mismo `event_id` que el navegador, para que Meta no cuente dos veces el mismo evento.
- [ ] Datos de la persona (correo) solo con consentimiento y siempre cifrados (hash) antes de salir.
- [ ] Un interruptor para apagarlo todo sin desplegar.
- [ ] Revisar con el "Test Events" de Meta que cada evento llega una sola vez, y documentarlo.
- [ ] Pruebas de que no se manda nada sin consentimiento ni en cuentas del equipo o de prueba.

### C (diciembre). Compartir vacantes y discusiones con OG bien hecho — P2 · M
Que al pegar un enlace de AvoTalent en WhatsApp, LinkedIn, X o Facebook salga una tarjeta bonita y correcta. Hoy las vacantes tienen una tarjeta básica y las discusiones **no tienen ninguna** (la página de una publicación se arma en el navegador y las redes no la ven).
- [ ] Discusiones: que la dirección de cada publicación tenga su propia tarjeta (título, resumen, autor y portada), con la misma técnica que ya usan las vacantes (parte de servidor).
- [ ] Vacantes: mejorar la tarjeta que ya hay (empresa, puesto, modalidad y nivel) y pasarla a imagen grande.
- [ ] Imagen de la tarjeta (1200x630) generada para cada vacante y cada discusión, con la marca de AvoTalent; con imagen de respaldo cuando no hay portada ni logo.
- [ ] Etiquetas completas: `og:title`, `og:description`, `og:image` (con dirección absoluta), `og:url`, `og:type`, tarjeta grande de X y dirección canónica.
- [ ] Qué sale cuando la vacante ya venció o no existe, y que **nunca** salga un correo, teléfono ni dato de contacto en la tarjeta.
- [ ] Botones de compartir en vacantes y discusiones: copiar enlace, WhatsApp, LinkedIn, X, Facebook y el menú de compartir del celular.
- [ ] El enlace compartido lleva su origen (`utm_source=compartido` y el medio) para medir cuánto trae compartir.
- [ ] Probar en el depurador de Facebook, el inspector de LinkedIn y WhatsApp, y dejar una lista de revisión.

### D (diciembre). Pantallas legales, de privacidad y de cookies — P2 · L
Hoy hay dos páginas, `/privacy` y `/terms` (76 líneas cada una, genéricas, con fecha del 5 de septiembre de 2026). **No dicen** que medimos con nuestra analítica propia y con Google Analytics, que Clarity graba sesiones, que mandamos correos, ni qué cookies usamos, cuánto guardamos los datos ni a quién se los damos (Supabase, Vercel, Railway, Resend, Microsoft, Google). Tampoco hay aviso de cookies ni forma de elegir.
> **Nota (recomendación mía):** el sitio ya mide con Google Analytics, con la analítica propia y, desde que se subió Clarity, graba sesiones, sin que la persona pueda aceptar o rechazar. Por eso sugiero **adelantar al menos el aviso de cookies y la actualización de la política de privacidad a noviembre**, y dejar para diciembre el resto. Esto es una lista de trabajo técnico, **no asesoría legal**: los textos los debe revisar un abogado (para México, el "aviso de privacidad" y los derechos ARCO de la LFPDPPP; si hay personas en la UE, el RGPD).
- [ ] **Decisión tuya:** en qué países se va a cumplir (México primero; si se anuncia en Europa o Brasil hay más reglas) y quién del lado legal revisa los textos.
- [ ] **Política de privacidad** reescrita con lo que de verdad pasa: qué datos se guardan (cuenta, perfil, CV, skills, postulaciones, visitas, errores), para qué, con quién se comparten (los servicios de arriba), dónde se guardan, cuánto tiempo, y cómo ejercer los derechos de acceder, corregir, borrar y llevarse los datos (con un correo o formulario real y un plazo de respuesta).
- [ ] **Aviso de privacidad** corto en el registro (integral y simplificado, como pide la ley mexicana) y enlazado en el pie de todas las páginas y en los correos.
- [ ] **Términos y condiciones** reescritos: edad mínima (Clarity no debe usarse con menores de 18, así que 18+), reglas de la comunidad, qué pasa con lo que publican, vacantes (AvoTalent reúne vacantes de otros sitios y no es la empresa), baja de cuentas y límites de responsabilidad.
- [ ] **Reglas de la comunidad** (uso aceptable y moderación) y cómo reportar un contenido (se conecta con "Moderación y reportes" de noviembre).
- [ ] **Política de cookies**: una tabla con cada cookie y almacenamiento (`_avo_cid`, `avo_ws`, `avocado_token`, las de Clarity `_clck` y `_clsk`, las de Google Analytics), para qué sirve, quién la pone y cuánto dura.
- [ ] **Aviso de cookies** (aceptar, rechazar y elegir): categorías necesarias, de medición y de publicidad; lo no necesario **no se carga hasta aceptar**; se recuerda la elección; accesible con teclado y sin tapar el contenido.
- [ ] **Preferencias de cookies** en el pie y en Ajustes para cambiar la decisión cuando quiera.
- [ ] Conectar el aviso con lo que ya existe: Clarity (su API de consentimiento), Google Analytics (modo de consentimiento), la analítica propia (decidir si cuenta como necesaria o de medición) y el Pixel de Meta de B (solo con aceptación).
- [ ] Al registrarse, aceptar términos y privacidad con una casilla, y **guardar qué versión y cuándo** (`terms_accepted_at`, `terms_version`); si cambian de forma importante, avisar y pedir aceptar otra vez.
- [ ] Borrar mi cuenta y descargar mis datos (es lo mismo que "Privacidad de cuenta" de noviembre: hacerlo una sola vez).
- [ ] Pruebas: sin aceptar no se carga ningún script de medición ni de publicidad; la elección se recuerda; retirar el consentimiento los detiene; los textos legales aparecen en el pie de todas las páginas y en los correos.

### E (diciembre). Jefe de producto con Claude — P2 · L · arranca cuando haya 2 meses de datos
Un agente que hace de **jefe de producto de AvoTalent**: lee los datos, detecta huecos y errores, propone features y protecciones con sustento, te avisa por correo, diseña lo que propone y lo muestra, y **puede actuar** (activar una alerta, mandar un correo a usuarios, publicar, cambiar código) **solo con tu aprobación explícita en cada acción**. Ese es el tope: llegar hasta el nivel "Actúa con aprobación"; nunca actúa solo hacia afuera.

**Por qué va al final y por qué es lo que más da después.** Un agente de producto es tan bueno como la historia que tiene. Hoy hay decenas de personas y apenas semanas de la medición nueva. Con **2 meses de datos** (analítica propia, Clarity, errores y flujos, correos, vacantes) ya hay comportamiento, retención y antes/después de cada cambio de los que sacar conclusiones, y el agente se estrena con evidencia y no con suposiciones.

**Requisitos antes de empezar**
- [ ] Haber acumulado ~2 meses de datos de la medición nueva (desde el 31 de octubre de 2026) y revisar que no tenga huecos.
- [ ] D de diciembre (privacidad): los datos agregados se mandan a la API de Anthropic para que el agente los lea; la política de privacidad debe decirlo.
- [x] Bitácora de lanzamientos al día (qué se cambió y cuándo). **Construida el 1 de noviembre de 2026** (Tráfico web > Cambios, herramienta `get_change_log` del MCP, anotación automática de cada despliegue). Falta correr `product-changes-migration.sql` y traer el historial con `npm run log-changes -- --apply`; desde ahí hay que mantenerla al día con `npm run log-change` para lo que no es un commit.
- [ ] Tus decisiones: dónde corre (supuesto: **en nuestro backend**, siempre encendido, con una llave de la API de Anthropic y un tope de gasto mensual), a quién le llegan los correos, cómo se aprueban las acciones y la lista inicial de acciones permitidas.

**E1. El jefe de producto en conversación (nivel 1)** — Proyecto de Claude Desktop conectado al MCP
- [ ] Proyecto con instrucciones de jefe de producto: separar datos de suposiciones, citar siempre la consulta y el periodo de cada cifra, avisar cuando la muestra es chica, no confundir correlación con causa, no inventar, no mostrar datos personales.
- [ ] Documento de contexto: qué es AvoTalent, para quién, el backlog, las **decisiones ya tomadas** (para no reproponer lo descartado) y la definición de cada métrica (activo, nuevo, recurrente, conversión).
- [ ] Más herramientas en el MCP: retención y cohortes, personas nuevas y recurrentes, desempeño de cada vacante, calidad de "Para ti", oferta y demanda de skills y puestos, resultados de correos y de LinkedIn, el botón de feedback y la bitácora de lanzamientos.
- [ ] Formato fijo de propuesta: problema, evidencia (cifras con periodo y tamaño de muestra), hipótesis, métrica que debería moverse, esfuerzo (S/M/L), riesgo, nivel de confianza y cómo se medirá después.

**E2. Revisión automática (nivel 2)** — cron en el backend
- [ ] Cron semanal (y opcional diario) que llama a Claude por la API con **herramientas de solo lectura** y deja un informe: cómo vamos, qué cambió, huecos, errores, propuestas.
- [ ] El informe se guarda en la base, se ve en una pantalla nueva de Telemetry ("Informe del jefe de producto") y llega por correo **solo a ti**, usando el control de cuota de correos que ya existe.
- [ ] Cada conclusión trae su nivel de confianza; con poca muestra dice "con esto no se puede afirmar".

**E3. Alertas, con las métricas de errores (nivel 3)**
- [ ] Las reglas de alerta pasan de estar en código a una **tabla de reglas** (umbral, ventana, severidad, canal, tiempo de espera entre avisos, encendida o apagada), para que activarlas sea un dato y no un despliegue.
- [ ] Alertas de **errores y flujos** (los umbrales se calibran con los 2 meses de datos, no con números inventados):
  - [ ] Pico de errores: más errores por hora que lo normal.
  - [ ] Error nuevo que afecta a al menos X personas.
  - [ ] Tasa de error por flujo crítico (iniciar sesión, registrarse, buscar, postularse) por encima del umbral.
  - [ ] Respuestas 5xx de la API o errores del servidor por encima del umbral.
  - [ ] Un flujo crítico con intentos y **ningún** completado en N horas (por ejemplo, nadie logra registrarse).
  - [ ] Carga lenta sostenida en un paso (más de 2.5 s durante una hora).
  - [ ] Salto de rage clicks en una página (Clarity).
  - [ ] "La medición dejó de registrar": hay visitas pero ninguna sesión nueva, o hay sesiones pero ningún evento ni flujo en 24 h.
  - [ ] Falla de los procesos programados (sincronización de Clarity, correos, el propio informe).
- [ ] Cada alerta de error lleva el enlace a la pantalla de errores, el stack y el video de Clarity del más reciente.
- [ ] Sin avisos repetidos (tiempo de espera), con severidad y con "ya lo vi" para silenciarla.
- [ ] El agente puede **proponer** reglas nuevas o cambiar umbrales; quedan como borrador hasta que las apruebes.

**E4. Diseño (nivel 4)**
- [ ] Bajo demanda desde la app de Claude: le pides una pantalla o un cambio y te la dibuja para verla al instante, y se afina conversando.
- [ ] Cada propuesta de feature puede llevar un boceto adjunto (una página que se abre en el panel).
- [ ] Borradores de cambios de código para revisar: **nunca** se publican ni se unen solos.

**E5. Actúa con tu aprobación explícita en cada acción (nivel 5)**
- [ ] **El modelo nunca tiene las llaves para actuar.** Solo crea **propuestas de acción**; un ejecutor de código normal (no el modelo) hace la acción **después** de que apruebes.
- [ ] Lista cerrada de acciones permitidas, cada una con su aprobación: activar o cambiar una alerta, mandar un correo (siempre un borrador que ves completo, con la lista de a quién le llega), publicar una publicación, abrir una propuesta de cambio de código. Cualquier cosa fuera de la lista no existe para el agente.
- [ ] Pantalla de aprobaciones en Telemetry: ver la propuesta con su evidencia, aprobar o rechazar (solo superadmin con sesión; **no** se aprueba desde un enlace del correo sin iniciar sesión).
- [ ] Cada acción queda con un identificador único (no se ejecuta dos veces), quién aprobó, cuándo, qué hizo y qué resultado dio, y se puede deshacer cuando la acción lo permita.
- [ ] Los correos a usuarios usan el control de cuota y los topes que ya existen y respetan las preferencias; el agente no puede saltarse ninguno.
- [ ] Registro de propuestas aceptadas, rechazadas y su resultado: el agente aprende qué te sirve y no repite lo rechazado.

**Lo que lo hace robusto (aplica a todas las etapas)**
- [ ] **Interruptor de apagado** (variable y botón en el panel) que detiene al agente y a cualquier acción en curso.
- [ ] **Tope de gasto** diario y mensual de la API, con aviso al acercarse y corte al llegar.
- [ ] **Registro completo** de cada corrida: qué consultó, qué respondió, cuánto costó, qué propuso.
- [ ] **Defensa contra instrucciones escondidas:** lo que escribe la gente (discusiones, mensajes de error, feedback) entra siempre como **dato**, nunca como órdenes; el agente no puede ejecutar nada por lo que lea. Con pruebas que intentan engañarlo.
- [ ] **Privacidad:** solo datos agregados y sin personales hacia la API; el rol de base de datos es de solo lectura y con permisos mínimos.
- [ ] **Modo sombra** antes de dejarlo actuar: unas semanas donde solo propone y tú comparas con tu criterio, sin ninguna acción.
- [ ] **Evaluación:** una lista de preguntas con respuesta conocida y de casos con trampa (muestra chica, correlación falsa), que se corre cada vez que cambian sus instrucciones; las instrucciones llevan versión.
- [ ] Reintentos y fallas controladas: si la API falla, el informe lo dice y no inventa; las acciones no se repiten.
- [ ] Pruebas automáticas del ejecutor (que nada fuera de la lista se pueda ejecutar y que sin aprobación no corra nada).

### F (diciembre). Días muertos: medirlos y traer a nuestra propia gente de vuelta — P2 · L
Pedido el 31 de octubre, al ver que un sábado casi sin visitas se queda sin registros. Hoy el sitio vive de lo que le llega de afuera (sobre todo las publicaciones de LinkedIn), así que **cuando afuera se calla, el sitio se vacía**: ese día entraron 8 visitantes, de los cuales ninguno era de LinkedIn. Dos partes: primero saber cuáles son los días flojos y por qué, y luego tener una forma de **llamar a nuestra propia gente** (la que ya se registró o ya nos conoce) para que esos días no se mueran.

**Parte 1. Medir los días flojos** — **movida a noviembre como el punto 0** ("Ritmo de la semana": mapa de calor por día y hora, origen, comparación con el mismo día de otras semanas y qué se publicó). Lo que se queda aquí es lo que necesita esas semanas de datos:
- [ ] Una **alerta de "día muerto"** en el sistema de alertas (E de este sprint, tabla de reglas): a media tarde, si hoy va muy por debajo de la línea base de su día de la semana, avisa a tiempo de hacer algo todavía hoy.
- [ ] **Resumen semanal** de los días y horas más flojos y qué se hizo en ellos, para comparar activaciones.

**Parte 2. Activaciones: traer a nuestra propia gente a la web**
La gente que ya conocemos es el único tráfico que no depende de LinkedIn. Ideas, de menor a mayor esfuerzo; cada una se mide con su propio origen (`utm_medium=activacion`, `utm_campaign=dia-muerto-<tipo>`):
- [ ] **Avisos dentro de la app y notificaciones push del navegador** (ya existe la campana; falta el aviso al teléfono o la computadora con la pestaña cerrada). Un "hay 12 vacantes nuevas para ti" o un tema de la comunidad. Los push necesitan un permiso de la persona y un service worker.
- [ ] **"El tema del día"**: una pregunta o discusión diaria (publicada por nosotros o propuesta por la comunidad) que dé una razón para volver aunque no haya vacantes nuevas, sobre todo en fin de semana.
- [ ] **Correo ligero en los días flojos** a quien tiene cuenta y le conviene (las mejores coincidencias nuevas de "Para ti", ya existentes), con tope por persona y por semana para no cansar. Cabe en la cuota gratis de Resend solo con un tope diario de unos 90 correos en total.
- [ ] **Resumen del fin de semana** (viernes en la tarde o sábado en la mañana): las vacantes más vistas de la semana y lo que se perdieron.
- [ ] **Nuestra audiencia propia**: la lista de correos del dueño y los suscriptores de Substack (que ya son la base de las invitaciones), y las personas que nos siguen en LinkedIn con publicaciones pensadas para el fin de semana (ya son 4 al día todos los días).
- [ ] **Racha o recordatorio suave** para quien volvió varios días: "llevas 3 días, hoy hay 8 vacantes nuevas de tu puesto". Con cuidado de no presionar.
- [ ] **Experimentos medidos**: cada activación se prueba en unos cuantos días flojos y se compara con el mismo día de las semanas anteriores (la línea base de la parte 1). No se deja encendida si no mueve la aguja.
- [ ] **Límites y respeto:** máximo de avisos por persona a la semana, horario de envío razonable, y cada tipo se puede apagar en Ajustes (ya existe la pestaña Notificaciones). Los push y los correos de activación respetan esa elección.

**Decisiones tuyas**
- [ ] Qué canal probar primero: push del navegador, correo ligero o "el tema del día". Propuesta: empezar por **el tema del día** (no cuesta cuota ni exige permisos) y el **correo ligero** de fin de semana, y dejar los push para después de la parte legal (D de este sprint).
- [ ] Si el contenido del "tema del día" lo escribes tú, lo propone el agente de producto (E) para que lo apruebes, o sale de la propia comunidad.
- [ ] Cuántos avisos por persona a la semana son aceptables (propuesta: 2 en total, contando todos los canales).

**Depende de:** la pantalla de ritmo semanal necesita unas semanas de datos; los push necesitan D (privacidad y consentimiento); el agente de producto (E) puede proponer y medir estas activaciones con su informe semanal.

---

## 3. Decisiones ya tomadas (no se rehacen)

- El registro de empresas está **pausado**: AvoTalent solo atiende a personas por ahora.
- Los proyectos (`showcase`) están **pausados**: solo se publican discusiones.
- Los visitantes sin cuenta solo ven el feed.
- No hay botones que no funcionen.
- Los correos **no** llevan enlace de baja; el control para apagarlos está en Ajustes.
- Equipo, cuentas de prueba y robots no cuentan en las cifras públicas ni del panel.
- Resend gratis: 100 correos por 24 horas móviles; el tope propio es 90.
- El umbral de los avisos "Para ti" es de 80 %.
- El diseño de la comunidad ya está unificado con el del admin; no se rehace.

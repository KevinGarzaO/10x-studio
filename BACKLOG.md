# Backlog de AvoTalent

Estado al **30 de octubre de 2026** (se agregó **V** el mismo día). Se trabaja **de a poco**: una cosa a la vez, en el orden de la tabla de la sección 2. Al terminar una, se marca aquí y se sube.

- Detalle del plan original: [requirements/005-retention-and-engagement-roadmap.md](requirements/005-retention-and-engagement-roadmap.md) (usa las letras viejas; la columna "Antes" de abajo dice cuál es cuál).
- Plan del CRM y el webhook de Resend: [requirements/006-resend-webhook-and-crm.md](requirements/006-resend-webhook-and-crm.md)
- Reglas ya decididas que no se rehacen: sección 3 y `CLAUDE.md`.
- **Funciones nuevas (monetización, planes de pago, comisiones) solo empiezan cuando termine este backlog.** Meta: enero de 2027.

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
- [x] Todas las tablas del admin son como la de Usuarios: buscador, páginas de 10 y, donde aplica, filtro (`DataTable`). Cubre Adquisición (2), LinkedIn (4), Match (5), Retención (quién usa AvoTalent) y Vacantes (ahora las 100 más abiertas). La tabla de cohortes de Retención no, porque es un mapa de calor y no una lista.
- [x] Usuarios: cambiar de filtro o de página ya no recarga toda la pantalla; solo se atenúa la tabla mientras llega.
- [x] Editor de publicaciones: dar clic en una letra de la barra de Markdown ya no manda el texto hasta abajo (se conserva la selección y el scroll).

---

## 2. Pendiente (todo, con letra, prioridad y orden)

**Prioridad:** **P1** urgente (seguridad, fugas, que lo que ya existe funcione) · **P2** alta (valor claro, se hace pronto) · **P3** media · **P4** después. **Tamaño** estimado con Claude Code: **S** unas horas o menos · **M** medio día a un día · **L** varios días.

| Orden | Letra | Pendiente | Prioridad | Tamaño | Antes |
|---|---|---|---|---|---|
| 1 | **A** | Cerrar la API (que no entregue vacantes sin sesión) | P1 | M | A |
| 2 | **B** | Llave de Resend con acceso completo y rotar el token pegado en el chat | P1 | S | cabo suelto |
| 3 | **C** | Revisar las variables de entorno de Railway | P1 | S | cabo suelto |
| 4 | **D** | Velocidad real: medir con tu base y revisar las secciones lentas del admin | P1 | M | cabo suelto |
| 5 | **E** | Las 156 vacantes que no le sirven a nadie y el conteo de la cola | P2 | S | cabo suelto |
| 6 | **V** | Feedback en cada sección y página de la app | P2 | M | nuevo (pedido 30 oct) |
| 7 | **F** | Confianza en las vacantes (reportar, cola de revisión, enlaces vivos) | P2 | M | B |
| 8 | **G** | Webhook de Resend | P2 | M | plan nuevo |
| 9 | **H** | Comunidad: seguir, likes, respuestas y menciones | P2 | L | D |
| 10 | **I** | SEO y GEO (posición 0 en Google y citas de las IA) | P2 | M | H (parte SEO/GEO) |
| 11 | **J** | CRM en el admin y termómetro "Valiosas" | P3 | L | plan nuevo |
| 12 | **K** | Validación de skills: más preguntas de examen | P3 | M | E |
| 13 | **L** | Mis postulaciones | P3 | M | F |
| 14 | **M** | Filtro de señal humana en la analítica (en espera) | P3 | M | en espera |
| 15 | **N** | Arreglar la prueba de retención que depende de la hora | P3 | S | cabo suelto |
| 16 | **O** | Moderación y reportes | P4 | M | G |
| 17 | **P** | Sembrar la comunidad con algunas discusiones | P4 | S | G |
| 18 | **Q** | Perfil como CV y barra de qué tan completo está | P4 | M | G |
| 19 | **R** | Privacidad de cuenta (contraseña, borrar, exportar) | P4 | M | G |
| 20 | **S** | Medir las vistas de los artículos del equipo | P4 | S | cabo suelto |
| 21 | **T** | Subir a git el documento de plan de monetización | P4 | S | cabo suelto |
| 22 | **U** | Tener presente: la actividad se mide desde el 24 de octubre | Informativo | — | cabo suelto |

> El CRM (**J**) queda en P3 por tamaño y porque primero conviene el webhook (**G**), pero si quieres adelantarlo es una decisión tuya.

### A. Cerrar la API — P1 · M
`/api/community/posts`, `/feed` y `/stats` todavía entregan vacantes a quien no tiene sesión.
- [ ] Exigir sesión en esas rutas.
- [ ] Mantener abiertas las rutas `/seo/*` (las usan las páginas públicas y Google).
- [ ] Revisar qué datos necesita ver un visitante (por ejemplo, las cifras de la página de inicio) y qué no.
- [ ] Pruebas de que sin sesión no se entrega nada.

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

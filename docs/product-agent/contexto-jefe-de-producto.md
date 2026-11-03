# AvoTalent: contexto para el jefe de producto

Este documento es el **conocimiento base** del proyecto de Claude que hace de jefe de producto de AvoTalent. Se escribió el 1 de noviembre de 2026 y se actualiza cuando cambia algo de fondo (una decisión, una definición de métrica, una función nueva).

**Lo que este documento NO tiene: cifras de uso.** Los números (visitantes, registros, retención...) se leen siempre con las herramientas del MCP, con su periodo, y nunca de memoria. Si una cifra no sale de una herramienta, no se afirma.

---

## 1. Qué es AvoTalent y para quién

AvoTalent es una bolsa de trabajo con comunidad, hecha para **personas que buscan trabajo en tecnología** (hoy, sobre todo puestos de desarrollo, QA y diseño UX/UI, hablando español y con foco en México y Latinoamérica). Meta del producto: que buscar trabajo, aprender y crecer en comunidad sea gratis en lo esencial.

- **Dueño y único decisor:** el fundador. Todo lo que cambia el producto, manda correos a gente o publica algo lo aprueba él.
- **Hoy atiende solo a personas.** El registro de empresas está pausado; las empresas que aparecen las crea el sistema al leer las vacantes.
- **Etapa:** la comunidad es chica (decenas de personas registradas al 1 de noviembre de 2026) y la medición propia es nueva (ver sección 5). Cualquier conclusión sobre el comportamiento hay que tomarla con esa muestra.
- **Negocio:** todavía no cobra nada. El plan (documento «Plan de producto y monetización», octubre de 2026) es terminar primero el backlog de crecimiento y retención (noviembre y diciembre de 2026) y **desde enero de 2027** empezar a monetizar: afiliación de cursos, patrocinador mensual, aviso premium por correo, vacantes destacadas, un plan Pro para personas y, mucho después, publicidad. Las cifras de precios y metas de ese plan son **hipótesis**, no hechos.

## 2. Cómo funciona el producto hoy

**Vacantes.** Un sistema (scraper) lee las páginas de empleo de las empresas (Greenhouse, Lever, Workable) en lotes cada ~15 días y las pone en una cola. El feed publica cada día una cuota calculada para vaciar la cola justo cuando llega el siguiente lote. Una vacante cuenta como abierta **45 días**; después su página sigue existiendo (con aviso y vacantes parecidas) pero ya no se puede solicitar.

**Reglas para que una vacante entre al feed:** título, empresa, enlace de postulación, un puesto del catálogo distinto de «otro» y al menos un skill del catálogo. Además, la publicación diaria solo elige vacantes que **le sirven a alguien**: encajan con una persona real (compatibilidad de al menos 42 %) y comparten un skill con ella.

**Catálogo de puestos y skills.** Una lista oficial (puestos como backend, QA, UX/UI; skills como React o Python). Cada vacante y cada persona se ligan a ella. Los skills nuevos los propone la gente y los aprueba el dueño desde SQL.

**«Para ti» (compatibilidad).** Un porcentaje entre cada persona y cada vacante: puesto 35 %, skills 35 %, nivel 15 %, modalidad 15 %. Una vacante aparece en «Para ti» si comparte un skill y llega a 45 %. Se calcula por adelantado (al guardar el perfil y cada 30 minutos), no al abrir el feed. Un aviso por correo o dentro de la app solo sale con 80 % o más.

**Perfil y CV.** Foto, puesto, nivel, ciudad, modalidad y skills (más de 5 skills completan la barra de progreso). El perfil está «completo» con foto y, para candidatos, título/puesto, nivel, ubicación, modalidad y al menos un skill. El CV es privado por defecto.

**Examen de skills.** Un examen corto para validar un skill. Hoy solo existe uno (React, 20 preguntas): el banco es muy corto.

**Comunidad.** Los miembros con perfil completo publican **discusiones** (máximo 5 al día; título, texto con formato, portada opcional, hasta 5 etiquetas del catálogo), votan y comentan. El equipo publica artículos (aparece uno cada 4 vacantes en el feed). Los proyectos de miembros están pausados.

**Quién ve qué.** Un visitante sin cuenta solo ve el feed (las tarjetas) y las páginas públicas para buscadores. El **detalle de una vacante** (descripción, enlace de postulación, contactos) exige sesión desde el 1 de noviembre de 2026; sin sesión se ve un aviso de registro sobre una versión pública de la vacante.

**Adquisición.**
- **LinkedIn del dueño:** el sistema publica **4 vacantes al día, todos los días** (8:30, 11:30, 14:30 y 18:30, hora de Monterrey), siempre entre las de mayor compatibilidad, solo de puestos de desarrollo, con una tarjeta de enlace. Antes eran 2 al día de lunes a viernes; se cambió el 31 de octubre de 2026 porque el sábado no había traído registros.
- **Google:** páginas públicas por vacante, por skill (`/empleos`) y por puesto (`/puestos`), con mapa del sitio y marcado de «oferta de empleo».
- **Correo:** invitaciones a la lista de contactos del dueño (máximo 2 correos por persona), bienvenida, recordatorio de perfil incompleto (a las 72 horas, una vez), alertas «Para ti» y un resumen semanal. Los correos **no llevan enlace de baja**; se apagan desde Ajustes.
- Cada registro guarda su origen (primer origen en 30 días).

**Límites que hay que conocer.** El correo gratis de Resend permite 100 envíos por cada 24 horas móviles; el tope propio es 90. Toda la medición de comportamiento tiene fecha de inicio (sección 5).

## 3. Definiciones exactas de las métricas

Estas definiciones son **únicas** en todo el panel. Si una cifra se calcula distinto, está mal.

- **Persona.** Su cuenta si ya la reconocimos (al registrarse o iniciar sesión se unen sus visitas anteriores) y, si no, su navegador. Una persona que usa dos navegadores sin cuenta cuenta dos veces.
- **Sesión activa.** Al menos una de estas: 10 segundos con la pestaña visible, 2 o más páginas vistas, o un evento clave (registro, clic en postularse, perfil completo). Una sesión nueva empieza tras 30 minutos sin actividad.
- **Persona activa.** Tuvo al menos una sesión activa en el periodo. **Solo visita:** entró y se fue sin hacer nada; nunca cuenta como usuario (se muestra aparte como ruido, igual que las sesiones).
- **Nueva / recurrente.** Nueva = su primera visita (o su cuenta, si es más vieja que la medición) cae dentro del periodo. Recurrente = ya había entrado antes. Una cuenta anterior a la medición cuenta como recurrente.
- **Registrada / anónima.** Registrada = tiene cuenta. Anónima = todavía no.
- **Conversión.** Personas **nuevas** que se registraron en el periodo ÷ personas **nuevas activas**. Quien ya era recurrente y se registra no entra en la cuenta.
- **Registros.** Cuentas reales: sin equipo, sin cuentas de prueba y sin perfiles creados por el sistema.
- **Se excluyen siempre:** el equipo (superadmins), las cuentas de prueba, los perfiles del scraper y los robots (por agente de usuario). `?notrack=1` apaga la medición de un navegador.
- **Días y horas:** hora de Monterrey (UTC-6 todo el año). Periodos de 7, 30 y 90 días son días completos; «24 horas» es una ventana móvil.
- **Retención (hay dos y no se mezclan hasta que cuadren).** *Analítica > Retención* usa la actividad por cuenta (solo cuentas). *Tráfico web > Retención* usa las sesiones nuevas: activa = un día con sesión activa; volvió = activa en un día posterior al de su primera visita; solo cuentan las personas cuya primera visita fue antes de hoy. No cuenta equipo, pruebas ni scraper.
- **Día flojo (Ritmo de la semana).** Un día con personas activas por debajo de la mitad de la **mediana del mismo día de la semana** de las últimas 4 semanas, solo si hay al menos 3 y esa mediana es de 4 personas o más. Mientras no hay base dice «aún no hay base». El primer día de la medición y el día en curso no se juzgan.
- **Velocidad del servidor.** Medida por ruta y por hora; mediana y p95 son **estimados** con rangos de tiempo («hasta N ms»). Una ruta es lenta si su p95 pasa de 1 segundo. El tiempo en el navegador (feed y vacante) se mide como flujos y es frustración si pasa de 2.5 segundos.
- **Antes/después de un cambio (bitácora).** Promedio por día medido en los 3, 7 o 14 días previos contra los siguientes. Cada cambio trae su comparabilidad: `comparable`, `mezclado` (3 o más cambios cerca), `sin_base` (menos de 2 días medidos antes) o `pendiente` (muy reciente). **No prueba una causa.**
- **Estimaciones de «le sirve a alguien» y de compatibilidad.** Usan el mismo motor que «Para ti»; una vacante «califica» desde 42 % y es «buena» desde 70 %.

## 4. Qué datos existen y qué herramientas los leen

En el panel de Telemetry (telemetry.avotalent.app) hay: Resumen, LinkedIn, Vacantes, Match, Adquisición, Usuarios, Retención, y el módulo **Tráfico web** (En vivo, Sesiones, Geografía, Audiencia, Páginas, Canales, Embudo y eventos, Cohortes, Retención, Errores, Flujos críticos, Velocidad, Ritmo de la semana, Cambios). El servidor MCP del jefe de producto lee una parte de eso con **herramientas de solo lectura, con consultas fijas y sin datos personales**:

- `get_funnel_dropoffs`: embudo del candidato y dónde abandonan.
- `get_clarity_frustration_data`: rage clicks, dead clicks y scroll por página (Microsoft Clarity).
- `get_user_session_recording`: sesiones y grabación de una persona concreta (solo con su correo o id, para investigar un caso).
- `get_error_logs_with_clarity_video`: errores del navegador, la API y el servidor, con su video.
- `get_flow_performance_analysis`: iniciar sesión, crear cuenta, buscar vacantes, postularse, **ver el feed** y **ver una vacante**: completitud, abandono, tiempos y frustración.
- `get_change_log`: lo que se cambió y cuándo, con su antes/después.
- `get_retention_and_cohorts`: personas nuevas contra recurrentes, solo visitaron, conversión, activas por día/semana/mes, cuántas volvieron y las cohortes semanales.
- `get_signup_sources`: de dónde llegan las personas nuevas y los registros (canal, publicación de LinkedIn, total de LinkedIn) y su conversión.
- `get_panel_metric`: lee la MISMA pantalla del panel de Telemetry (mismos números). Para saber de dónde venía quien terminó registrándose (el origen guardado al crear la cuenta) usa `metric: acquisition` y lee `registrationOrigins`; `get_signup_sources` cuenta canales que la gente VISITÓ, no el origen del registro. Para el embudo de postulación por móvil/escritorio y con/sin cuenta usa `metric: web_apply_funnel`.
- `get_weekly_rhythm`: cada día contra el mismo día de otras semanas, días flojos, origen y las horas con más gente.
- `get_server_speed`: cuánto tarda cada ruta del servidor (mediana y p95 estimados) y qué parte del tiempo consume.

Faltan herramientas para: desempeño de cada vacante, calidad de «Para ti», oferta y demanda de skills y puestos, resultados de correos y de LinkedIn, y el botón de feedback (todavía no existe). Si la pregunta necesita una de ellas, **se dice que falta la herramienta** en vez de contestar con lo que se recuerda.

## 5. Desde cuándo hay datos (muy importante para no sobreinterpretar)

| Medición | Desde | Nota |
|---|---|---|
| Analítica propia de sesiones, personas, eventos, canales | **30 de octubre de 2026** (14:13 hora de Monterrey) | Antes de esa fecha no hay sesiones; solo existen los registros (tabla de usuarios). |
| Actividad por cuenta (la Retención de Analítica) | 24 de octubre de 2026 | No se puede reconstruir hacia atrás. |
| Errores y flujos críticos | 31 de octubre de 2026 | |
| Clarity (grabaciones y frustración) | 31 de octubre de 2026 | Las grabaciones se muestrean y se conservan ~30 días; muchas sesiones no tienen video. La API trae solo las últimas 24 horas. |
| Velocidad del servidor y tiempo del feed/vacante | 1 de noviembre de 2026 | |
| Ritmo de la semana | 30 de octubre de 2026 | Las comparaciones con «el mismo día de otras semanas» necesitan 3 semanas de ese día: antes del 20 de noviembre de 2026 casi todo dirá «aún no hay base». |
| Bitácora de cambios | 30 de octubre de 2026 (traída de git) | Lo que no es un commit se anota a mano. |

Con tan pocos días y tan poca gente, **casi toda diferencia es ruido**. El agente debe decirlo.

## 6. Decisiones ya tomadas (no se vuelven a proponer)

- El registro de empresas está **pausado**: AvoTalent solo atiende a personas por ahora.
- Los proyectos (`showcase`) están **pausados**: solo se publican discusiones.
- Los visitantes sin cuenta solo ven el feed; el detalle de una vacante exige sesión.
- No hay botones que no funcionen.
- Los correos **no** llevan enlace de baja; el control para apagarlos está en Ajustes.
- Equipo, cuentas de prueba y robots no cuentan en las cifras públicas ni del panel.
- Resend gratis: 100 correos por 24 horas móviles; el tope propio es 90 (con reservas para que lo urgente no se quede sin cupo).
- El umbral de los avisos «Para ti» es de 80 %.
- El diseño de la comunidad ya está unificado con el del admin; no se rehace. Un solo acento (verde); sin píldoras ni bordes de colores en las tarjetas del feed.
- LinkedIn: 4 publicaciones al día, todos los días, siempre entre las vacantes de mayor compatibilidad.
- Las funciones nuevas de monetización (planes de pago, comisiones) **solo empiezan cuando termine el backlog actual**. Meta: enero de 2027.
- El agente de producto **nunca actúa solo hacia afuera**: puede llegar hasta proponer y, con aprobación explícita del dueño en cada acción, ejecutar. En esta etapa (nivel 1) solo conversa y no ejecuta nada.

## 7. En qué se trabaja (backlog)

**Noviembre de 2026.** Hecho el 1 de noviembre: Ritmo de la semana, la bitácora de cambios, el cierre del detalle de vacantes sin sesión y la medición de velocidad. Pendiente, en orden de prioridad: acelerar el feed y la vacante con lo que muestre la medición (D); mantener la sesión de la gente y permitir entrar directo desde el correo (W, en espera de una decisión); feedback dentro de la app (V); vacantes que no le sirven a nadie y conteo de la cola (E); webhook de Resend para rebotes y quejas (G); confianza en las vacantes: reportar, revisar y comprobar enlaces (F); seguir y likes en la comunidad (H); SEO y GEO (I); CRM y filtro de señal humana (J, M), y otros de menor prioridad.

**Diciembre de 2026.** Inicio de sesión con Google; Pixel de Meta; compartir vacantes con buena vista previa; pantallas legales, de privacidad y de cookies; **este agente**; y días muertos (alerta de día flojo y activaciones para traer a la gente que ya conocemos).

## 8. Cómo se usa este documento

Es contexto, no instrucciones de comportamiento: cómo debe trabajar el agente está en `instrucciones-del-proyecto.md`. Cuando una pregunta dependa de algo que aquí no está o que pudo cambiar, se verifica con las herramientas o se pregunta al dueño; no se completa con suposiciones.

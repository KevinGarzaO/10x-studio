# Backlog de AvoTalent

Estado al **30 de octubre de 2026**. Se trabaja **de a poco**: una cosa a la vez, se marca aquí al terminarla y se sube.

- Detalle del plan original: [requirements/005-retention-and-engagement-roadmap.md](requirements/005-retention-and-engagement-roadmap.md)
- Plan del CRM y el webhook de Resend: [requirements/006-resend-webhook-and-crm.md](requirements/006-resend-webhook-and-crm.md)
- Reglas que ya están decididas y no se rehacen: ver `CLAUDE.md` (registro de empresas pausado, proyectos pausados, sin enlace de baja en correos, etc.).
- **Funciones nuevas (monetización, planes de pago, comisiones) solo empiezan cuando termine este backlog.** Meta: enero de 2027.

Orden sugerido: **A → B → D → E → F → G**, con **H (GEO)** en paralelo. El CRM entra cuando tú lo indiques.

---

## 1. Ya hecho

### C. Retención por correo y avisos
- [x] Recordatorio de perfil incompleto (a las 72 h, una vez por persona).
- [x] Invitaciones a tu lista de contactos (máximo 2 correos por persona).
- [x] Correos de bienvenida (personas nuevas y fundadores).
- [x] Avisos de "Para ti" (coincidencia de 80 % o más) y resumen semanal (martes/miércoles).
- [x] Campana con avisos en la app, página de notificaciones y preferencias en Ajustes.
- [x] Cuota de correos de Resend: 100 por 24 horas móviles (tope propio de 90, con reservas).

### H. Diseño (etapas 1 a 4)
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

---

## 2. Pendiente del backlog original

### A. Cerrar la API (recomendado: siguiente)
`/api/community/posts`, `/feed` y `/stats` todavía entregan vacantes a quien no tiene sesión.
- [ ] Exigir sesión en esas rutas.
- [ ] Mantener abiertas las rutas `/seo/*` (las usan las páginas públicas y Google).
- [ ] Revisar qué datos necesita ver un visitante (por ejemplo, las cifras de la página de inicio) y qué no.
- [ ] Pruebas de que sin sesión no se entrega nada.

### B. Confianza en las vacantes
- [ ] Botón "Reportar vacante" para los miembros.
- [ ] Cola de revisión para ti en el admin.
- [ ] Revisar que los enlaces de postulación sigan vivos.

### D. Comunidad (seguir, likes, respuestas)
Necesita una tabla compartida de "follows" que también alimente los avisos.
- [ ] Seguir personas.
- [ ] Seguir empresas (avisar de vacantes nuevas).
- [ ] Seguir un skill.
- [ ] Seguir un puesto.
- [ ] Guardar discusiones y artículos (hoy solo se guardan vacantes).
- [ ] Likes en discusiones, artículos y comentarios (los votos de los artículos del equipo hoy son solo locales: no tienen fila donde guardarse).
- [ ] Respuestas y menciones entre usuarios.
- [ ] Botón "Seguir" en las tarjetas flotantes (hoy existen, pero sin botón porque seguir no existe).

### E. Validación de skills
- [ ] Banco de preguntas más grande: hoy el examen tiene pocas preguntas. Plan: preguntas redactadas con IA para los 15 skills más pedidos y aprobadas por ti en el admin.

### F. "Mis postulaciones"
- [ ] Marcar "ya me postulé".
- [ ] Estado sencillo de cada postulación.
- [ ] Recordatorios.

### G. Más adelante
- [ ] Moderación y reportes.
- [ ] Sembrar la comunidad con algunas discusiones.
- [ ] Botón "usar mi perfil como CV" y barra de qué tan completo está.
- [ ] Privacidad de cuenta: cambiar contraseña, borrar cuenta, exportar datos.

### H. SEO y GEO (el diseño ya está hecho)
Meta: posición 0 en Google (fragmentos destacados, preguntas frecuentes).
- [ ] Archivo `llms.txt`.
- [ ] Páginas con respuestas cortas y citables.
- [ ] Más datos estructurados (discusiones, perfiles, empresas).
- [ ] Permitir los rastreadores de IA.
- [ ] Medir cuántas veces nos citan.
- [ ] Mejorar el SEO de discusiones, perfiles y empresas.

---

## 3. Planeado, sin construir

### Webhook de Resend + módulo CRM + termómetro "Valiosas"
Plan completo en [requirements/006-resend-webhook-and-crm.md](requirements/006-resend-webhook-and-crm.md).
- [ ] **Decisión tuya 1:** las aperturas de correo se muestran como dato orientativo (poco confiables: Apple Mail y otros cargan el pixel solos); las etapas se basan en clics y registros.
- [ ] **Decisión tuya 2:** los datos del CRM los ven solo los superadmins y nunca salen por la API pública.
- [ ] **Decisión tuya 3:** primera versión de solo lectura, más notas y etiquetas; sin enviar correos desde el CRM.
- [ ] Fase 1, webhook (medio día): ruta firmada `POST /api/webhooks/resend`, tabla `email_events` sin duplicados, y estado de cada envío actualizado (un rebote o una queja suprime a la persona). Reemplaza la consulta periódica que exige la llave de Resend con acceso completo.
- [ ] Fase 2, datos por persona (medio día): vista `person_timeline` con registro, origen, visitas, vacantes vistas/guardadas, actividad, exámenes, avisos y correos.
- [ ] Fase 3, admin en dos módulos (un día): el menú actual pasa a ser el módulo **Analítica** y se crea el módulo **CRM** con las pantallas Personas y Ficha de persona.
- [ ] Termómetro "Valiosas" (medio día): puntuación de 0 a 100 por persona, con etapa (fría, tibia, caliente), el porqué de cada punto y la tendencia frente a 30 días antes. Los pesos se calibran con datos reales.
- [ ] Resto de pantallas del CRM: Correos, Invitaciones, Segmentos (listas guardadas y exportables) y Empresas.

---

## 4. En espera

### Filtro de señal humana en la analítica
El 29 de octubre, de 10:15 a 12:50 (Monterrey), hubo 167 vistas de 167 visitantes nuevos, en 150 vacantes distintas, sin origen y sin ninguna acción (0 postulaciones, guardados ni registros). Casi seguro fue un navegador automático: distorsiona visitantes, conversión y la popularidad del feed.
- [ ] Confirmar la causa con los registros de Vercel (User-Agent) y Google Search Console del 29 de octubre.
- [ ] Contar una vista o visita solo si la página estuvo visible unos segundos **y** hubo un movimiento, scroll, tecla o toque.
- [ ] Opcional: SQL para marcar esa ráfaga.

---

## 5. Cabos sueltos

- [ ] Crear en Resend una llave con **acceso completo** y **rotar el token** que se pegó en el chat (sin la llave completa no se pueden leer aperturas ni rebotes; el webhook quitaría esa necesidad).
- [ ] Revisar en Railway las variables de entorno: `INVITE_EMAILS`, `WELCOME_EMAILS`, `WELCOME_FOUNDERS_EMAILS`, `MATCH_ALERTS`, `MATCH_DIGEST`, `PROFILE_REMINDER_EMAILS`, `LINKEDIN_VACANCY_POSTS`, `RESEND_API_KEY`.
- [ ] Las **156 vacantes** que hoy no le sirven a nadie siguen en el feed (elegiste aplicar la regla solo a las nuevas). Decidir si se retiran, salvo las que tengan comentarios o guardados.
- [ ] El panel (tarjeta "En cola" y cupo diario) cuenta la cola completa, así que se lee un poco más alto que lo que realmente saldrá. Ajustar para que cuente solo las que sirven.
- [ ] La actividad se mide desde el 24 de octubre: las cuentas más antiguas que no han vuelto no aparecen como activas. No se puede reconstruir hacia atrás.
- [ ] El documento `docs/AvoTalent-Plan-de-Producto-y-Monetizacion` (Word y PDF) sigue sin commit.
- [ ] Revisar una por una las demás secciones lentas del admin (hasta ahora solo se aceleró la capa común).
- [ ] Probar los tiempos de carga con tu base real y tu conexión.
- [ ] Las vistas de los artículos del equipo no se miden.
- [ ] La prueba `analytics-routes.test.ts` (retención) falla según la hora por la zona horaria (UTC frente a Monterrey). No es un error del producto; conviene arreglarla.

---

## 6. Decisiones ya tomadas (no se rehacen)

- El registro de empresas está **pausado**: AvoTalent solo atiende a personas por ahora.
- Los proyectos (`showcase`) están **pausados**: solo se publican discusiones.
- Los visitantes sin cuenta solo ven el feed.
- No hay botones que no funcionen.
- Los correos **no** llevan enlace de baja; el control para apagarlos está en Ajustes.
- Equipo, cuentas de prueba y robots no cuentan en las cifras públicas ni del panel.
- Resend gratis: 100 correos por 24 horas móviles; el tope propio es 90.
- El umbral de los avisos "Para ti" es de 80 %.

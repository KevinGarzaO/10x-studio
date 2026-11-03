# 012 — Mis postulaciones: preguntar al volver, marcar «Postulada», seguimiento

Estado: **construido el 2 nov 2026**. Falta activarlo: correr `backend/sql/vacancy-applications-migration.sql` en Supabase (no depende de otras; se puede correr más de una vez) y, cuando quieras el seguimiento automático, poner `APPLICATION_FOLLOWUPS=on` en Railway.

## Lo pedido (2 de noviembre de 2026)

Contexto: «Postularse» llevaba a un modal con el formulario de la empresa dentro de un marco, que quedaba en blanco en muchos sitios, y el flujo de postulación nunca se cerraba como completo (0 de 11). El dueño quería que la gente se quedara en su página; no se puede completar la postulación de una vacante de otra empresa dentro de AvoTalent (los sitios bloquean el marco y enviarla por ellos exige una llave privada de cada empresa), así que se hizo lo que hace LinkedIn con las vacantes externas, y el dueño pidió estas cinco cosas:

1. Otra pestaña (ya estaba hecho, ver nota de 009).
2. **Pregunta al volver:** cuando la persona regresa a la pestaña de AvoTalent, una franja «¿Ya te postulaste a X?» con *Sí, ya / Todavía no / Más tarde*.
3. **Estado visible:** «Postulada» en el feed y en el detalle, y una página **Mis postulaciones** (el pendiente L del backlog).
4. **Seguimiento:** unos días después, un aviso dentro de la app y un correo («¿Cómo te fue con X?») respetando los límites.
5. **Señales de confianza** antes de salir: el dominio de la empresa y «Te llevamos al sitio oficial de la empresa».

## Cómo quedó

- **Tabla `vacancy_applications`** (una fila por persona y vacante; sin llaves foráneas a propósito, igual que `vacancy_matches`: una llave entre `users` y `community_posts` vuelve ambiguo el embed del autor, PGRST201). Estados: `clicked` (salió, sin contestar), `not_yet` (todavía no), `applied` (sí, ya), `interview`, `offer`, `rejected`. Guarda cómo se veía la vacante (título, empresa, dominio) para que la lista no se quede vacía si luego se borra.
- **Es lo que la persona DICE, no lo que vemos.** El formulario es del sitio de la empresa. Toda pantalla que use este dato debe decirlo así.
- **Rutas** `/api/community/applications` (todas con sesión; nadie ve ni toca las de otra persona): `POST /` (salió a postularse), `GET /pending` (por cuál preguntar), `POST /:id/answer` (applied | not_yet | later), `PATCH /:id` (estado desde la lista), `GET /` (las mías, con si la vacante ya cerró), `DELETE /:id`. Sin la tabla contestan 503 `not_ready` y la app sigue como siempre. El feed y el detalle traen `applicationStatus` (nunca rompe el feed si falta la tabla).
- **Qué se pregunta y cuándo:** solo lo que salió y no contestó, de los últimos 14 días, y sin «más tarde» vigente (24 horas). El servidor decide, así que preguntar de más no repite nada. La franja (`components/apply-prompt.tsx`, en el shell) pregunta al abrir una página y cada vez que la pestaña vuelve a estar a la vista (como mucho cada 5 s). Al contestar se avisa a las pantallas abiertas (`avo:application-changed`) para que «Postulada» aparezca sin recargar.
- **Marca «Postulada»:** en la tarjeta del feed (texto verde con palomita, sin píldoras ni bordes, un solo acento) y en el detalle, para postulada, en proceso, con oferta y «no avanzó».
- **Mis postulaciones** (`/postulaciones`, en el menú de la cuenta y en el menú lateral): lista con el estado editable, el dominio al que salió y si la vacante ya no acepta solicitudes; se puede quitar.
- **Confianza antes de salir:** bajo «Postularse» (en el panel de la empresa en pantallas grandes, y arriba en pantallas chicas) dice «Te llevamos al sitio oficial de la empresa (dominio). AvoTalent no recibe lo que escribas allá».
- **Seguimiento** (`services/applications/followup.ts`, cron diario 10:20 Monterrey, apagado hasta `APPLICATION_FOLLOWUPS=on`): a los **5 días** de «Sí, ya», «¿Cómo te fue con X?» (aviso en la app y, si lo quiere, correo); a quien salió y nunca contestó, **un** recordatorio en la app a los **2 días** (sin correo). Topes: cada postulación se avisa una sola vez; varias juntas de una persona se agrupan en un aviso; **máximo un correo de seguimiento por persona por semana**; el correo gasta del cupo diario compartido con la misma reserva que las alertas (aviso en la app no gasta cupo); si el proveedor de correo dice que se acabó la cuota, se para y se reintenta mañana; se apaga en Ajustes > Notificaciones («Seguimiento de tus postulaciones», `email_prefs.followups`); a quien tiene `email_opt_out` no se le escribe.
- **Medición:** al confirmar se manda el evento `application_answer` (con la respuesta). El flujo `job_application` sigue cerrándose con `external_apply`.

## No se hizo (a propósito)

- No se puede completar la postulación de una vacante de otra empresa dentro de AvoTalent. Para vacantes publicadas directamente en AvoTalent sí sería posible (cuando se abra el registro de empresas).
- Todavía no hay un panel de postulaciones en Telemetry ni una herramienta del MCP para el agente de producto: «cuántas personas dicen haberse postulado» es el dato más útil que falta mostrar.

## Para activarlo

1. Supabase (editor SQL): `vacancy-applications-migration.sql`.
2. Después del despliegue: abre una vacante con tu sesión, presiona «Postularse», vuelve a la pestaña de AvoTalent y debe aparecer la franja.
3. Cuando quieras el seguimiento automático: en Railway, `APPLICATION_FOLLOWUPS=on` (usa `RESEND_API_KEY` que ya está).

## Pruebas

`backend/tests/unit/vacancy-applications-sql.test.ts` (la tabla contra Postgres real), `vacancy-applications.test.ts` (reglas y rutas, incluido que nadie toque lo de otra persona), `application-followup.test.ts` (quién recibe qué, topes, correo) y `apps/community/tests/applications-ui.test.tsx` (la franja, la marca, el aviso del sitio oficial y la página).

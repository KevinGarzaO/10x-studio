# 013 — Avisos push (Web Push), invitación al contestar «¿Ya te postulaste?» y su medición

Estado: **construido el 2 nov 2026**. Falta activarlo (ver «Para activarlo»).

## Lo pedido (2 de noviembre de 2026)

Que la app pueda mandar push notifications y que se midan. Y: cuando la persona regresa y contesta cualquiera de las tres opciones («Sí, ya me postulé», «Todavía no», «Más tarde»), preguntarle si quiere estar más atento y darle mejor seguimiento a su vacante, activando los avisos push «para no perderse de nada». Al aceptar, que le llegue de inmediato una notificación de muestra para ver cómo se verán.

## Cómo quedó

- **Web Push propio** (librería `web-push`, llaves VAPID, sin servicio de pago). Service worker en `apps/community/public/sw.js` (muestra el aviso, al tocarlo abre la dirección y cuenta el clic; la dirección del backend le llega en `/sw.js?api=...`).
- **La invitación** (`components/apply-prompt.tsx`): después de contestar las tres opciones, una ventana «¿Quieres estar más atento a X?» con «Sí, activar avisos» / «Ahora no». Solo si el navegador lo admite, la persona no ha decidido y no dijo «ahora no» en los últimos 14 días (`lib/push.ts`, `shouldOfferPush`). También en Ajustes > Notificaciones («Este dispositivo»). El permiso del navegador se pide solo cuando la persona acepta, nunca al entrar. En iPhone solo existe con la app agregada a la pantalla de inicio (iOS 16.4+).
- **Notificación de muestra:** al activarse un dispositivo llega una notificación («Listo, así te avisaremos…») solo a ese dispositivo. No cuenta para el tope y no se repite.
- **Qué se manda:** los mismos avisos que ya salen en la campana, solo de dos tipos: seguimiento de postulaciones (`application`) y coincidencias fuertes (`match`). Se envían desde `notify()` (`services/notifications/notify.ts`) sin cambiar a quien los provoca. Topes: **3 por persona en 24 horas** (la muestra no cuenta), nada si la persona lo apagó (`users.email_prefs.push`, Ajustes) y un dispositivo dado de baja por el navegador (404/410) se revoca. Nunca rompe lo que lo provocó.
- **Tablas** (`backend/sql/push-notifications-migration.sql`): `push_subscriptions` (un dispositivo por fila) y `push_events` (se mostró la invitación, aceptó, negó, no quiso, se mandó, falló, lo tocó, apagó). Sin llaves foráneas, con RLS. `push_summary()` es la única definición del resumen.
- **Rutas** `/api/community/push`: `GET /public-key`, `POST /subscribe`, `POST /unsubscribe`, `GET /status`, `POST /event` (con sesión) y `POST /click` (sin sesión: la llama el service worker con el `nid` del aviso; solo cuenta si ese aviso se envió de verdad y una sola vez).
- **Medición:** Telemetry > Tráfico web > Avisos push (`GET /api/admin/analytics/push`, métrica `push` para el agente): invitación (se mostró / aceptó / negó / ahora no / apagó), dispositivos activos, enviados / fallidos / tocados y % que tocó por tipo. Las visitas que traen los avisos llevan `utm_source=push` y aparecen en Adquisición como el canal «push». En el sitio, los eventos `push_prompt_shown`, `push_enabled`, `push_prompt_dismissed`, `push_permission_denied`.
- Apagado hasta que `PUSH_NOTIFICATIONS=on` y las llaves VAPID estén en el servidor.

## Para activarlo

1. Supabase: correr `backend/sql/push-notifications-migration.sql`.
2. Railway (backend): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:hola@avotalent.app`) y `PUSH_NOTIFICATIONS=on`. Las llaves se generan una vez con `npx web-push generate-vapid-keys` y la privada no se comparte.
3. Probar: contestar «¿Ya te postulaste?» → «Sí, activar avisos» → debe llegar la notificación de muestra.

## Pruebas

`backend/tests/unit/push.test.ts` (envío, topes, revocación, rutas, resumen), `push-sql.test.ts` (tablas y resumen contra Postgres real), `apps/community/tests/push-offer.test.tsx` (la invitación tras las tres respuestas).

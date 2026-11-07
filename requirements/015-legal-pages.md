# 015 — Páginas legales: aviso de privacidad, términos y cookies

Estado: **construido el 6 nov 2026 (commit local, sin publicar)**. Los textos son BORRADORES para revisión de un abogado, no texto legal definitivo.

## Lo pedido (6 de noviembre de 2026)

Hacer las páginas legales con el borrador que dejó el agente de producto (aviso de privacidad, política de cookies y medición, términos y condiciones, con los textos cortos y dónde ponerlos). La fecha de «última actualización» se pone el día de publicar.

## Cómo quedó

- Páginas públicas (sin iniciar sesión, en el mapa del sitio): `/privacidad`, `/terminos`, `/cookies` (`apps/community/app/privacidad|terminos|cookies/page.tsx`, layout común `components/legal-layout.tsx`). Las direcciones viejas `/privacy` y `/terms` redirigen (permanente, `next.config.mjs`); las páginas viejas se borraron (decían cosas que ya no son ciertas).
- Enlaces: pie de todas las pantallas (`components/shell.tsx`), pantalla de registro («Al registrarte aceptas los Términos y condiciones y el Aviso de privacidad»), inicio de sesión, el aviso de registro sobre una vacante, la hoja de feedback, los ajustes del CV y el pie de los correos HTML (`legalFooterHtml()` en `backend/services/email/links.ts`; las versiones de solo texto de los correos todavía NO llevan los enlaces).
- Lo que se corrigió del borrador contra el código (todo verificado):
  1. **Google Analytics** se carga para todas las visitas (`app/layout.tsx`, `G-B5F7C83ERC`) y el borrador no lo mencionaba: ahora está en el aviso y en la tabla de cookies.
  2. **El CV es en línea** (se arma en el perfil, no es un archivo que se sube) y, si se hace público, **cualquiera con el enlace puede verlo aunque no tenga cuenta** (el borrador decía que solo personas con cuenta). Y se dice «ninguna pantalla del equipo lo muestra» en vez de «el equipo no lo ve» (quien tiene acceso a la base de datos técnicamente podría).
  3. La tabla de cookies lleva los nombres y duraciones reales del código (`_avo_cid` 2 años, `avo_attribution` 30 días, `avo_ws` 30 min, sesión en almacenamiento local) y los de Google y Microsoft según su documentación.
  4. Se agregó Vercel (aloja el sitio) y las postulaciones (lo que cuenta la persona sobre a qué vacantes salió).

## Falta antes de publicar (de tu lado y del abogado)

- Razón social exacta y domicilio completo (calle y número, colonia, municipio, código postal): el texto trae «Transformateck S.A.S.» y «Calzada del Valle, San Pedro».
- Edad mínima (18 o mayoría de edad del país), tiempo de respuesta a derechos (7 días hábiles), qué pasa con las copias de seguridad al dar de baja una cuenta, y si borrar una cuenta es «de inmediato» o manual (hoy se hace escribiendo a hola@avotalent.app).
- Confirmar en el panel de Clarity que enmascara los campos de texto y de perfil (el texto lo afirma; no se puede comprobar desde el código).
- Qué aloja cada proveedor (Supabase, Railway, Vercel).
- Las 5 preguntas del abogado del borrador (aviso corto en cada punto donde se piden datos, la lista del newsletter de Kevin Garza para las invitaciones con otra entidad, medir sin banner de consentimiento, correos sin enlace de baja, grabaciones de sesión).
- Actualizar estas páginas ANTES de activar: el Pixel de Meta, el inicio de sesión con Google, el modal y el correo de feedback y los cobros o patrocinios.

## Pruebas

`apps/community/tests/legal-pages.test.tsx` (contenido, proveedores, la verdad sobre el CV, tabla de cookies, enlaces), `seo.test.tsx` (mapa del sitio) y `backend/tests/unit/invitations.test.ts` (los enlaces legales del pie no llevan marcas de invitación).

# Requerimiento 005 — Qué falta para que la app quede amarrada: retención y engagement

| | |
|---|---|
| **Origen** | Pregunta del dueño de producto: "¿qué falta al momento a la app para que quede más amarrada y completa, partiendo de lo que tenemos?", y su petición de guardarlo y sumar el engagement de la comunidad |
| **Fecha** | 2026-10-25 |
| **Spec derivada** | Ninguna todavía: cada parte se especifica o se implementa directo cuando se tome |
| **Estado** | Plan acordado, sin empezar. Antes de tocar algo, preguntar con cuál se empieza |

## Lo que se pidió (texto original)

> ahora pregunta que falta al momento a la app para que quede mas amarrada y completa? partiendo de lo que tenemos?

Y, después de ver el análisis de abajo:

> ok guarda esto y tambien agregar lo de engagmente en la comunidad, que es guardado, likes,
> comentarios entre usuarios y seguirse entre ellos o a emprasas para nuevas vacantes,
> seguimiento de skill o de puestos todo esto

## Contexto: de dónde se parte (2026-10-25)

- Funciona: registro y onboarding de candidatos, perfil público, match "Para ti", vacantes con
  métricas de interés (vistas, guardados, postulaciones), feed ordenado por popularidad, guardar
  vacantes, publicar discusiones, votos y comentarios guardados, búsqueda, usuarios destacados,
  SEO, panel de administración con analítica.
- En pausa por decisión del dueño: **alta de empresas** (por ahora solo se ofrece algo a las
  personas) y **proyectos** (`showcase`).
- Datos de ese día: 23 cuentas reales; banco de examen con 20 preguntas, todas de React, y 1
  persona con 1 skill validado de 90 en el catálogo; 0 publicaciones de miembros; retención baja
  (la mayoría entra una vez).

## Plan, en el orden recomendado

### A. Cerrar el servidor
El feed ya exige cuenta en pantalla, pero el API (`/api/community/posts`, `/feed`, `/stats`)
sigue devolviendo vacantes a quien lo llame directo. Exigir sesión ahí, dejando abiertas las
rutas de SEO (`/api/community/seo/*`). Es un cambio chico y de seguridad.

### B. Confianza en las vacantes
- Botón **"Reportar vacante"** (cerrada, enlace roto, engaño) y una cola para revisarlas.
- Revisar que el enlace de postulación siga vivo; las vacantes duran hasta 45 días y el scraper
  trae lotes cada 15, así que algunas ya están cerradas.

### C. Avisos para que regresen (retención)
- Resumen semanal por correo: "las 5 vacantes que mejor te quedan".
- Avisos dentro de la app (la campana existe, casi nada la alimenta): respuestas a tus
  discusiones, votos, comentarios, vacantes nuevas que encajan.
- Preferencias de avisos por persona.

### D. Engagement de la comunidad (pedido el 2026-10-25)
Todo lo que hace que las personas interactúen entre sí y con lo que les importa:

1. **Guardar** — ya existe para vacantes; extenderlo a discusiones y artículos, con la lista
   unificada en "Guardadas".
2. **Likes / votos** — ya se guardan en discusiones; faltan los artículos del equipo (viven en la
   tabla `content`, sin dónde guardar el voto) y los votos en comentarios.
3. **Comentarios entre usuarios** — ya hay comentarios; faltan **respuestas a un comentario**,
   avisos al autor y menciones (@usuario).
4. **Seguirse entre personas** — seguir a un miembro para ver sus discusiones y enterarse de lo
   que publica. Hoy el botón "Seguir" fue quitado porque no existía.
5. **Seguir empresas** — para enterarse de sus **nuevas vacantes**. Las empresas que existen hoy
   son las que trae el scraper (las empresas con cuenta propia están en pausa).
6. **Seguir un skill** — avisar cuando salgan vacantes o discusiones de ese skill.
7. **Seguir un puesto** (rol) — lo mismo para un puesto (backend, frontend, UX/UI…).

Pieza común: una tabla de "seguimientos" (quién sigue a qué: persona, empresa, skill o puesto),
y que el feed y los avisos de la parte C se alimenten de ella. Conviene hacer C y D juntas en
diseño, porque seguir algo solo sirve si después llega el aviso.

### E. Validación de skills de verdad
Banco de preguntas para los 15 skills más pedidos, generadas con IA y **aprobadas por el dueño
en el admin** antes de publicarse; mostrar el sello de validado en tarjetas y perfil (el perfil ya
lo muestra).

### F. "Mis postulaciones"
"Postularse" abre el sitio de la empresa y ahí se pierde el rastro. Marcar "ya apliqué", un
estado simple (aplicada, en proceso, descartada), recordatorios, y medir cuántas postulaciones
salen realmente de AvoTalent.

### G. Después
- Moderación y denuncias en la comunidad (cola para revisar).
- Sembrar la comunidad: 3 o 4 discusiones abiertas por el equipo al inicio.
- Perfil como CV: botón "Ver mi CV" y barra de "tu perfil está al 80 %".
- Cuenta y privacidad: cambiar contraseña, borrar cuenta, descargar los datos (verificar qué
  existe).

## Cosas que quedaron a medias y se suman a este plan

- Votos en los artículos del equipo (solo en pantalla) y vistas de artículos (no se miden).
- Aplicar `backend/sql/community-post-images-migration.sql` (portadas de las publicaciones).
- Imágenes dentro de discusiones ya funcionan; proyectos (`showcase`) están en pausa.

## Decisiones ya tomadas que este plan respeta

- La app es solo para personas por ahora: nada de ofrecer algo a empresas.
- Lo que escriben los miembros se muestra siempre por `lib/user-markdown.ts` (nunca HTML crudo).
- Lo que no está construido no se muestra (nada de botones apagados).
- Los números que ve el público no cuentan al equipo, cuentas de prueba ni robots.

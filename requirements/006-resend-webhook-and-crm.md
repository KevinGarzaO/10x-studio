# 006 — Webhook de Resend y módulo CRM en el admin

Estado: **solo plan** (decidido 2026-10-29: no se construye todavía; entra cuando se cierre el backlog actual A–H o cuando el dueño lo indique).

## Requerimiento original (dueño, resumido)

- Un webhook de Resend para tener los datos de cada persona y cada interacción con los correos.
- Un CRM dentro del admin. Lo que hoy es el menú del panel pasa a ser un **módulo (Analítica)** y se crea **otro módulo (CRM)** con sus propias pantallas.
- Una pantalla para saber **qué personas son las más valiosas** y con quién podemos contar para futuras ventas o mejoras de la app, con un **termómetro por persona**.

## Lo que ya existe y se aprovecha

- `resend_id` guardado en `email_sends`, `invitation_sends` y `match_emails`: cada evento de Resend se liga a una persona sin adivinar.
- Panel con `studioAuth()` (superadmin) y menú lateral.
- Reglas de "persona real" (sin pruebas, scraper, equipo ni bots) en `services/analytics/metrics.ts`.

## Fase 1 — Webhook (backend)

1. `POST /api/webhooks/resend`, público pero **solo acepta lo firmado** (Svix: `svix-id`, `svix-timestamp`, `svix-signature`, secreto `whsec_…` en variable de entorno). Necesita el cuerpo sin procesar: se monta antes de `express.json` en `backend/index.ts`.
2. Tabla `email_events` (tipo, `resend_id`, destinatario, fecha, enlace si fue clic, cuerpo completo), idempotente por id del evento (Resend reintenta). `ENABLE ROW LEVEL SECURITY`.
3. Eventos: `email.sent`, `delivered`, `delivery_delayed`, `bounced`, `complained`, `opened`, `clicked`, `failed`. Los `contact.*` quedan fuera (no usamos audiencias de Resend).
4. Cada evento actualiza el estado de los envíos existentes. Rebote o queja suprime a la persona. Sustituye el polling de `emails.get`, que exige una llave de acceso completo.

## Fase 2 — Datos por persona

- Vista `person_timeline`: registro y origen (UTM), visitas, vistas/clics/guardados de vacantes, actividad diaria, exámenes, notificaciones, correos y sus eventos.
- Solo personas reales.

## Fase 3 — Admin en dos módulos

- **Analítica**: lo que hay hoy (Resumen, LinkedIn, Vacantes, Match, Adquisición, Usuarios, Retención, Configuración), solo cambia de lugar.
- **CRM**, rutas `/panel/crm/...`:
  1. **Personas**: tabla con búsqueda y filtros (puesto, nivel, origen, perfil completo, última actividad, correos).
  2. **Ficha de persona**: perfil, línea de tiempo, correos con su estado, vacantes vistas, notas internas y etiquetas.
  3. **Valiosas (termómetro)**: ver abajo.
  4. **Correos**: campañas y envíos con entregados, clics, rebotes (aperturas como dato orientativo).
  5. **Invitaciones**: la cola de contactos del dueño.
  6. **Segmentos**: listas guardadas y exportables ("perfil incompleto hace más de 7 días", "hizo clic pero no se registró").
  7. **Empresas**: las que crea el scraper, hasta reactivar el registro de empresas.

## Termómetro por persona ("Valiosas")

Una puntuación de 0 a 100 por persona, con la etapa visible (frío, tibio, caliente) y **el porqué** (qué sumó cada señal), para que no sea una caja negra. Pantalla con la lista ordenada, filtros por etapa y la tendencia (sube o baja frente a 30 días antes).

Señales propuestas (pesos a calibrar con datos reales, no inventados):

- **Perfil**: completo, skills validados con examen, CV público.
- **Actividad**: días activos en 30 días, regresa semana tras semana (retención).
- **Intención**: vacantes guardadas y postulaciones, "Para ti" abiertos, clics en correos.
- **Aportación**: publicaciones, comentarios, votos recibidos.
- **Alcance**: invitó a otras personas (cuando exista).
- **Encaje comercial**: nivel y puesto del foco de AvoTalent; después, si hay empresas, cuántas vacantes encajan con la persona.

Usos: elegir a quién pedir opinión de una mejora, a quién ofrecer un curso o plan Pro, a quién escribirle primero. Reglas: solo superadmin, nunca por la API pública, el equipo y las pruebas no puntúan, y la puntuación se **calcula en una sola función** (como `metrics.ts`) con pruebas.

## Decisiones pendientes del dueño

1. Aperturas: orientativas; las etapas se basan en clics y registros (propuesto).
2. Acceso: solo superadmins (propuesto).
3. Primera versión: lectura + notas y etiquetas; sin enviar correos desde el CRM (propuesto).

## Estimado (con Claude Code)

Fase 1: medio día. Fase 2: medio día. Fase 3 (módulos y pantallas Personas + Ficha): un día. Valiosas: medio día. Resto de pantallas: después.

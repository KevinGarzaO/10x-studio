# Phase 0 Research: Validación de nivel por skill mediante examen

## R1 — Cómo impedir que la respuesta correcta llegue al cliente (FR-005)

**Decision**: Los endpoints del examen construyen su respuesta con `select()` explícito y
**nunca** incluyen `exam_questions.correct_answer_index`. El candidato recibe el enunciado
y las opciones (texto + `order_index`), y envía de vuelta el `order_index` que eligió. La
comparación contra `correct_answer_index` ocurre solo dentro del backend, al recibir la
respuesta, y el resultado (`is_correct`) se guarda pero **no se devuelve pregunta por
pregunta** — el candidato solo ve su nivel al terminar.

**Rationale**: Es la restricción dura de toda la feature; si la respuesta correcta viaja al
navegador, el examen no valida nada. El riesgo concreto en este repo es real: el patrón
dominante en las rutas existentes es `.select('*')` (ver
`backend/src/routes/community/users.routes.ts:16`), que aquí filtraría
`correct_answer_index` sin que nadie lo note. Por eso la decisión se enuncia como una regla
explícita sobre cómo escribir la consulta, no como una intención general.

**Alternatives considered**:
- Enviar todas las preguntas de una vez al iniciar el examen, con las respuestas correctas,
  y calificar en el cliente (rechazado — viola FR-005 y FR-007 de forma directa).
- Enviar las preguntas con las opciones barajadas y un mapeo opaco por intento (rechazado —
  añade una capa de indirección que no aporta seguridad real: la protección no viene de
  ocultar el orden sino de no enviar nunca la respuesta).
- Devolver `is_correct` tras cada respuesta para dar retroalimentación inmediata
  (rechazado — no lo pide ningún AC, y convierte el examen en una fuente de verdad
  consultable: con reintentos permitidos, alguien podría mapear el banco completo).

## R2 — Estado del examen en curso y expiración a las 24 horas (FR-018, FR-019)

**Decision**: El intento se crea al iniciar con `started_at` y `expires_at = started_at +
24h`. Las respuestas se guardan una por una conforme el candidato avanza, así que retomar
es simplemente "continuar en la primera pregunta sin responder". La expiración se evalúa
**de forma perezosa**: un intento está expirado si `status = 'in_progress'` y
`expires_at < now()`. No hay proceso en segundo plano que barra intentos vencidos.

**Rationale**: Evita añadir un cron nuevo, lo cual importa concretamente en este repo:
`CLAUDE.md` advierte que arrancar el backend dispara crons reales del scraper y del
orquestador de contenido contra producción, y el usuario ya expresó preocupación por eso.
La evaluación perezosa además hace imposible el estado inconsistente "venció pero el cron
aún no corrió": cualquier lectura ve la verdad calculada del mismo dato.

**Alternatives considered**:
- Un cron que marque intentos vencidos (rechazado — un proceso más que mantener, una
  ventana de inconsistencia, y fricción real de arranque en este backend en particular).
- Guardar un `status = 'expired'` escrito la primera vez que alguien observa el intento
  vencido (rechazado — obliga a escribir en un camino de lectura y no aporta nada que el
  cálculo perezoso no dé; el historial auditable se conserva igual con `expires_at`).

## R3 — Selección de las 10 preguntas y no repetir en un reintento (FR-014)

**Decision**: Al iniciar un intento se eligen 10 preguntas al azar del banco de ese skill,
**excluyendo** las que se presentaron en el intento anterior del mismo candidato para el
mismo skill. Si tras excluirlas quedan menos de 10, se completa con las excluidas (mejor
esfuerzo). Las preguntas elegidas se congelan en `skill_exam_attempt_questions` al momento
de iniciar, no se vuelven a sortear en cada carga.

**Rationale**: Congelar el conjunto al iniciar es lo que hace que retomar un examen (R2)
sea coherente — si se sorteara en cada petición, el candidato vería preguntas distintas al
volver y podría girar el sorteo hasta que le tocaran fáciles. La exclusión del intento
anterior es justo lo que el mínimo de banco de 20 preguntas hace posible: con 20 en banco y
10 por examen, un reintento puede ser completamente disjunto del anterior.

**Alternatives considered**:
- Excluir todas las preguntas de todos los intentos históricos (rechazado — con 3 o 4
  reintentos agota el banco y deja de poder formarse un examen; la spec solo exige no
  repetir *el mismo conjunto*, no memoria infinita).
- Sortear en cada carga de página (rechazado — rompe retomar, y permite "rerollear" el
  examen recargando).

## R4 — Dónde vive el nivel que muestra el perfil (FR-021)

**Decision**: Una tabla desnormalizada `user_skill_levels` con clave `(user_id,
skill_name)` que guarda el **mejor** nivel alcanzado y cuándo se alcanzó. Se actualiza al
terminar un intento, solo si el nivel obtenido supera al que ya había.

**Rationale**: El perfil público es el camino caliente (lo visitan empresas y es la razón de
negocio de la feature, US2). La alternativa —calcular el máximo sobre el historial de
intentos en cada visita— es cara e incómoda: el orden básico < intermedio < avanzado no es
alfabético, así que "el mejor" requiere un `CASE` o una tabla de rangos en cada lectura de
perfil. Guardar el resultado ya resuelto deja la lectura del perfil en un `JOIN` trivial.

**Alternatives considered**:
- Calcular al vuelo desde `skill_exam_attempts` (rechazado por el costo y la complejidad en
  el camino más visitado; además obligaría a repetir esa lógica de ordenamiento en cualquier
  otro lugar que quiera mostrar el nivel).
- Guardar el nivel dentro de la fila del usuario (p. ej. un JSONB en `users`) (rechazado —
  `users` ya acumula responsabilidades y un JSONB pierde los constraints de DB que el
  principio I exige).

## R5 — Qué pasa si el admin borra una pregunta ya usada en un intento (FR-012, FR-016)

**Decision**: `skill_exam_attempt_questions.exam_question_id` referencia `exam_questions`
con **`ON DELETE RESTRICT`**: una pregunta que ya se presentó en algún intento no se puede
borrar. El nivel ya validado vive en `user_skill_levels` y en el propio intento, así que no
se recalcula nunca aunque el banco cambie.

**Rationale**: Satisface literalmente FR-012 (el intento sigue reconstruible) y FR-016 (el
nivel no cambia) con el mínimo de maquinaria. Hoy no existe ninguna interfaz para borrar
preguntas —la feature 001 es solo de alta— así que `RESTRICT` no rompe ningún flujo actual.

**Consecuencia que hay que declarar**: esto introduce una restricción de producto real —
cuando alguien construya la edición/borrado de preguntas, descubrirá que las preguntas ya
usadas no son borrables. Es deliberado, no un accidente.

**Alternatives considered**:
- Copiar el texto de la pregunta y de sus opciones dentro del intento (rechazado como
  scope creep: haría el intento auditable *palabra por palabra* incluso si la pregunta se
  reescribe, pero ni FR-012 ni FR-016 piden eso, y duplica contenido en cada intento).
- `ON DELETE SET NULL` (rechazado — rompe FR-012: el intento dejaría de ser reconstruible).

## R6 — Forma de la API y momento de la calificación

**Decision**: Cuatro endpoints bajo `/api/community/skill-exams`, todos detrás de
`communityAuthMiddleware` y operando solo sobre `req.userId`. El examen **se cierra solo**
al enviarse la última respuesta: no hay endpoint separado de "terminar". La respuesta a esa
última petición trae el nivel obtenido. Ver `contracts/skill-exams.md`.

**Rationale**: Un cierre explícito añadiría un estado intermedio ("todas respondidas pero
sin terminar") que no aporta nada y sí abre preguntas incómodas (¿qué pasa si nunca lo
llama? ¿expira igual?). Cerrar al completar la última respuesta elimina ese estado.

**Alternatives considered**:
- `POST /finish` explícito (rechazado por el estado intermedio sin dueño).
- Calificar todo al final recibiendo las 10 respuestas juntas (rechazado — es incompatible
  con retomar un examen interrumpido, R2, que necesita respuestas persistidas una a una).

## R7 — Un solo examen en curso a la vez (FR-017)

**Decision**: Un índice único parcial sobre `skill_exam_attempts(user_id)` limitado a
`status = 'in_progress'`. El backend valida además antes de insertar, para devolver un
error claro en vez de dejar que reviente el constraint.

**Rationale**: El principio I pide que la regla exista también en la capa DB, y un índice
único parcial la expresa exactamente. Es además la única defensa real contra dos pestañas
compitiendo: dos peticiones simultáneas de "iniciar examen" no pueden ganar ambas.

**Alternatives considered**:
- Solo validar en el backend antes de insertar (rechazado — es una condición de carrera:
  dos peticiones concurrentes pueden pasar ambas la verificación antes de que cualquiera
  inserte).

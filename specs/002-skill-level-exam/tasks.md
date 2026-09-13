---

description: "Task list template for feature implementation"
---

# Tasks: Validación de nivel por skill mediante examen

**Input**: Design documents from `/specs/002-skill-level-exam/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/skill-exams.md, quickstart.md

**Tests**: Incluidos — `quickstart.md` define 6 niveles de prueba y el principio V de la
constitución ("Tests Ship With The Code") exige tests unitarios e integración en el mismo PR.

**Organization**: Tareas agrupadas por historia de usuario. US1 y US2 son P1 (MVP); US3 y
US4 son P2.

> **Revisado tras `/speckit-analyze`** (2026-09-13): se añadieron T010 y T011 para cerrar el
> hallazgo CRITICAL (el endpoint `GET /current` tenía implementación sin ningún test de
> integración, violando el principio V), y se reforzaron T004, T008, T016, T022-T026, T035,
> T039 y T040. La numeración corrió respecto a la versión previa.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1, US2, US3 o US4, mapeado a spec.md
- Cada tarea incluye ruta de archivo exacta

---

## Phase 1: Setup

**Purpose**: Esta feature **no necesita tooling nuevo** — Vitest, Playwright y
`packages/schemas` ya los introdujo la feature 001. El único prerequisito real es de datos.

- [X] T001 Capturar al menos **20 preguntas de un mismo skill** (p. ej. `react`) usando el formulario admin existente en `/admin/exam-questions/new`, porque `exam_questions` está vacía hoy y FR-003 exige un mínimo de 20 para habilitar un examen. Sin esto ninguna tarea posterior se puede probar de punta a punta.

**Checkpoint**: `SELECT count(*) FROM exam_questions WHERE skill_name = '<skill>'` devuelve 20 o más.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Esquema de DB, schema compartido y la lógica pura que todas las historias
necesitan.

**🔴 CRITICAL**: Ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [X] T002 Escribir `backend/sql/skill-exams-migration.sql`, idempotente (`CREATE TABLE IF NOT EXISTS`), con las tres tablas exactamente como las define `data-model.md`:
  1. `skill_exam_attempts` — `id uuid PK DEFAULT gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `skill_name varchar(50) NOT NULL REFERENCES skills(name)`, `status varchar(12) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed'))` (**sin** valor `'expired'` — es estado derivado), `started_at timestamptz NOT NULL DEFAULT now()`, `expires_at timestamptz NOT NULL`, `finished_at timestamptz NULL`, `correct_count smallint NULL CHECK (correct_count >= 0)`, `question_count smallint NOT NULL CHECK (question_count > 0)`, `level varchar(12) NULL CHECK (level IN ('basico','intermedio','avanzado'))`, `created_at timestamptz DEFAULT now()`
  2. `skill_exam_attempt_questions` — `id uuid PK`, `attempt_id uuid NOT NULL REFERENCES skill_exam_attempts(id) ON DELETE CASCADE`, `exam_question_id uuid NOT NULL REFERENCES exam_questions(id) ON DELETE RESTRICT` (ver `research.md` R5), `position smallint NOT NULL CHECK (position >= 0)`, `selected_option_index smallint NULL CHECK (selected_option_index >= 0)`, `is_correct boolean NULL`, `answered_at timestamptz NULL`, más `UNIQUE (attempt_id, position)` y `UNIQUE (attempt_id, exam_question_id)`
  3. `user_skill_levels` — `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `skill_name varchar(50) NOT NULL REFERENCES skills(name)`, `level varchar(12) NOT NULL CHECK (level IN ('basico','intermedio','avanzado'))`, `achieved_at timestamptz NOT NULL`, `source_attempt_id uuid NOT NULL REFERENCES skill_exam_attempts(id)`, `updated_at timestamptz DEFAULT now()`, `PRIMARY KEY (user_id, skill_name)`
  4. El índice único parcial de FR-017: `CREATE UNIQUE INDEX IF NOT EXISTS ... ON skill_exam_attempts (user_id) WHERE status = 'in_progress'`
- [ ] T003 Aplicar `backend/sql/skill-exams-migration.sql` manualmente en el editor SQL de Supabase (este repo no tiene migration runner) y verificar que existen las 3 tablas y el índice parcial con `SELECT indexname FROM pg_indexes WHERE tablename = 'skill_exam_attempts'`
- [X] T004 [P] Crear `packages/schemas/src/skillExam.ts` exportando `buildStartSkillExamSchema(skillNames: string[])` — que valida `skillName` **contra la lista de skills válidos** con un `.refine()`, siguiendo el mismo patrón ya establecido por `buildExamQuestionSchema` en `packages/schemas/src/examQuestion.ts:11-16` de la feature 001 — y `submitAnswerSchema` (`{ position: z.number().int().min(0), selectedOptionIndex: z.number().int().min(0).max(5) }`, donde el máximo de 6 opciones viene de la regla de 001), más sus tipos inferidos. **No usar `z.string().min(1)` para `skillName`**: dejaría la capa frontend del principio I sin nada real que validar y se apartaría del patrón de 001
- [X] T005 [P] Crear `backend/src/services/skill-exam.service.ts` con la lógica pura (sin acceso a DB en estas funciones, para que sean testeables aisladas): `levelFor(correctCount, questionCount)` con los umbrales **≥90% → avanzado, ≥70% → intermedio, resto → basico** (FR-020: nunca devuelve "sin nivel"), `isBetterLevel(candidate, current)` con el orden `basico < intermedio < avanzado`, `pickQuestions(bankIds, previousAttemptIds, count)` que excluye las del intento anterior y completa con ellas si faltan (FR-014), y `isExpired(attempt, now)` que deriva el vencimiento de `status === 'in_progress' && expires_at < now` (FR-019)
- [X] T006 [P] Unit tests del schema compartido en `backend/tests/unit/skillExam.schema.test.ts`: un caso que falla y uno que pasa por cada regla (`selectedOptionIndex` negativo y `> 5`, `position` negativa, `skillName` fuera de la lista de skills válidos y dentro de ella)
- [X] T007 [P] Unit tests de la lógica pura en `backend/tests/unit/skill-exam.service.test.ts`: 10/10 → avanzado; 9/10 → avanzado; 7/10 → intermedio; 6/10 → basico; **0/10 → basico** (FR-020); `isBetterLevel` en las 9 combinaciones; `pickQuestions` con banco de 20 → conjunto disjunto del anterior, y con banco de 12 → comparte solo lo necesario; `isExpired` antes y después de `expires_at`

**Checkpoint**: Migración aplicada, schema compartido importable desde backend y frontend, lógica pura con tests en verde.

---

## Phase 3: User Story 1 - Presentar el examen y obtener un nivel (Priority: P1) 🎯 MVP

**Goal**: Un candidato inicia el examen de un skill declarado, responde las 10 preguntas de
una en una sin poder volver atrás, y al terminar ve su nivel.

**Independent Test**: Con una cuenta que tenga el skill declarado y banco suficiente, entrar
directo a la URL del examen, responder las 10 preguntas, y confirmar que se muestra un nivel
coherente y que quedó registrado en `skill_exam_attempts`.

### Tests for User Story 1

> **NOTA: escribir estos tests primero y confirmar que fallan antes de implementar**

- [ ] T008 [P] [US1] Integration test del flujo completo en `backend/tests/integration/skill-exams.routes.test.ts`: iniciar → responder las 10 → confirmar `201`/`200` con nivel, y lectura directa a DB verificando `status='completed'`, `correct_count`, `level` y `question_count`. **Verificar además la retención auditable (FR-012, SC-005)**: leer `skill_exam_attempt_questions` del intento y afirmar 10 filas, `position` 0-9 sin huecos, `selected_option_index` igual a lo enviado en cada respuesta, `is_correct` poblado y `answered_at` no nulo — sin esto, un handler que guardara mal las respuestas pasaría todos los demás tests. Limpiar las filas creadas en `afterAll`
- [ ] T009 [P] [US1] Integration test de FR-005 en el mismo archivo: recorrer **todas** las respuestas HTTP del flujo completo (start, cada answer, current) y afirmar que ninguna contiene `correct_answer_index` ni `is_correct`. Es la red de seguridad contra que alguien cambie el `select()` explícito por `select('*')` — ver `research.md` R1
- [ ] T010 [P] [US1] Integration test de **retomar** en el mismo archivo (FR-018, US3 escenario 5): iniciar un examen, responder 3 preguntas, llamar `GET /api/community/skill-exams/current` y afirmar que devuelve la pregunta en posición 3, que `answered` es 3, y que las 3 respuestas previas siguen registradas sin cambios en `skill_exam_attempt_questions`
- [ ] T011 [P] [US1] Integration test de **expiración** en el mismo archivo (FR-019, US3 escenario 6): con un intento cuyo `expires_at` esté en el pasado, `GET /current` devuelve `410 exam_expired` con `retryAvailableAt`, y un `POST /api/community/skill-exams` posterior del mismo skill devuelve `409 waiting_period` — es decir, el intento vencido **se consumió** y arrancó el periodo de espera
- [ ] T012 [P] [US1] Component test en `apps/community/tests/SkillExamRunner.test.tsx`: muestra una pregunta a la vez; tras responder no existe forma de volver a la anterior (FR-006); al recibir `completed: true` muestra el resultado
- [ ] T013 [P] [US1] Component test en `apps/community/tests/SkillExamResult.test.tsx`: muestra el nivel obtenido y el conteo de aciertos
- [ ] T014 [P] [US1] E2E happy path en `e2e/skill-level-exam.spec.ts`: sesión inyectada (mismo patrón que 001), ir al examen, responder las 10, ver el nivel. Limpiar las filas creadas en `afterAll`

### Implementation for User Story 1

- [ ] T015 [US1] Implementar `POST /api/community/skill-exams` en `backend/src/routes/community/skill-exams.routes.ts`: crea el intento con `expires_at = started_at + 24h` y congela 10 preguntas en `skill_exam_attempt_questions` — **ambas escrituras juntas o ninguna**, para no dejar un intento sin preguntas bloqueando el índice único parcial (ver `contracts/skill-exams.md`, Side effects). Responde `201` con solo la pregunta en posición 0, **sin** `correct_answer_index`
- [ ] T016 [US1] Implementar `POST /api/community/skill-exams/:attemptId/answers` en el mismo archivo: verifica que el intento sea del `req.userId` (`403` si no), que **el intento no esté ya completado** (`409 attempt_completed`, FR-015), que el intento no haya vencido (`410 exam_expired`, FR-019), que la posición no esté ya respondida (`409 already_answered`, FR-006) y que `selectedOptionIndex` sea una opción real de esa pregunta (`400`); guarda `is_correct` calculado **solo en el servidor**; si era la última respuesta cierra el intento, calcula el nivel con `levelFor()` y escribe `user_skill_levels`. Devuelve el cuerpo documentado en el contrato, sin revelar si cada respuesta fue correcta
- [ ] T017 [US1] Implementar `GET /api/community/skill-exams/current` en el mismo archivo: devuelve el intento en curso y la primera pregunta sin responder (FR-018); `404` si no hay ninguno; `410` con `retryAvailableAt` si venció (FR-019, usando `isExpired()` de T005)
- [ ] T018 [US1] Montar las rutas en `backend/index.ts` bajo `/api/community/skill-exams` detrás de `communityAuthMiddleware`, junto a las demás rutas de comunidad
- [ ] T019 [P] [US1] Crear `apps/community/components/exam/SkillExamRunner.tsx`: una pregunta a la vez, opciones seleccionables, sin navegación hacia atrás, valida el payload con `submitAnswerSchema` antes de enviarlo
- [ ] T020 [P] [US1] Crear `apps/community/components/exam/SkillExamResult.tsx`: muestra el nivel obtenido y los aciertos sobre el total
- [ ] T021 [US1] Crear `apps/community/app/(main)/examenes/[skill]/page.tsx`: resuelve el examen en curso (o lo inicia), renderiza `SkillExamRunner` y al completarse `SkillExamResult`

**Checkpoint**: US1 funciona de punta a punta para un candidato elegible, incluyendo retomar un examen interrumpido. Probarla de forma independiente antes de seguir.

---

## Phase 4: User Story 2 - El nivel validado se muestra en el perfil público (Priority: P1)

**Goal**: Cualquiera que visite el perfil del candidato ve qué skills tiene validados y con
qué nivel, distinguibles de los solo declarados.

**Independent Test**: Partiendo de una fila ya existente en `user_skill_levels`, visitar el
perfil público **sin sesión iniciada** y confirmar que el skill aparece con su nivel y se
distingue de los no validados.

### Tests for User Story 2

- [ ] T022 [P] [US2] Integration test en `backend/tests/integration/users.routes.test.ts`: `GET /api/community/users/:username` incluye `skillLevels` con solo los skills validados, y sigue siendo accesible sin autenticación. **Incluir el caso del skill retirado del perfil** (edge case de `spec.md`): con una fila en `user_skill_levels` de un skill que ya **no** está en `users.skills`, la respuesta **no** debe incluirlo en `skillLevels`, aunque la fila se conserve en la tabla
- [ ] T023 [P] [US2] Component test en `apps/community/tests/public-profile-view.test.tsx`: un skill con nivel se renderiza distinto de uno sin nivel; y un `skillLevels` que trajera un skill ausente de `profile.skills` no debe pintar nada (el render parte de `profile.skills`, no de `skillLevels`)
- [ ] T024 [P] [US2] E2E en `e2e/skill-level-exam.spec.ts`: visitar el perfil público sin sesión y confirmar que el nivel validado es visible

### Implementation for User Story 2

- [ ] T025 [US2] Ampliar `GET /:username` en `backend/src/routes/community/users.routes.ts` para incluir `skillLevels` (`skillName`, `level`, `achievedAt`) leídos de `user_skill_levels`, **filtrados contra `users.skills`** para no exponer el nivel de un skill que el candidato ya retiró de su perfil — el edge case de `spec.md` exige que deje de mostrarse conservando el resultado, y filtrar en el backend lo hace explícito en vez de depender de cómo itere el frontend. **Cambio declarado en el Constitution Check** (principio VI) — no ampliar el `select('*')` existente para traer nada más
- [ ] T026 [US2] Actualizar el render de skills en `apps/community/components/public-profile-view.tsx:69` para mostrar el nivel validado junto al skill y distinguir visualmente los validados de los declarados. El bucle **debe seguir partiendo de `profile.skills`** y cruzar contra `skillLevels`, no al revés. **Cambio declarado en el Constitution Check**

**Checkpoint**: US1 + US2 = MVP entregable — el candidato se valida y las empresas lo ven.

---

## Phase 5: User Story 3 - Un intento por skill, con periodo de espera (Priority: P2)

**Goal**: Un candidato no puede repetir el examen de un skill de inmediato; debe esperar 30
días, y un reintento peor no baja lo que ya tenía validado.

**Independent Test**: Terminar un examen e intentar iniciarlo otra vez de inmediato,
confirmando el bloqueo y la fecha comunicada; luego, con un intento previo simulado fuera de
la ventana, reintentar y confirmar que un resultado peor no degrada el perfil.

### Tests for User Story 3

- [ ] T027 [P] [US3] Integration test en `backend/tests/integration/skill-exams.routes.test.ts`: reintento dentro de la ventana → `409 { error: "waiting_period", retryAvailableAt }` y no se crea intento nuevo
- [ ] T028 [P] [US3] Integration test en el mismo archivo: con `user_skill_levels` en `intermedio`, completar un intento que dé `basico` → el intento nuevo guarda `level='basico'`, pero `user_skill_levels` conserva `intermedio` con su `achieved_at` original y la respuesta trae `improved: false` y `profileLevel: "intermedio"` (FR-021)
- [ ] T029 [P] [US3] E2E en `e2e/skill-level-exam.spec.ts`: tras terminar un examen, intentar iniciarlo de nuevo y ver el bloqueo con la fecha de reintento

### Implementation for User Story 3

- [ ] T030 [US3] En `backend/src/routes/community/skill-exams.routes.ts` (T015), bloquear el inicio cuando el último intento de ese skill —completado o vencido— esté dentro de los 30 días: responder `409` con `retryAvailableAt` derivado de `finished_at` o `expires_at` (FR-011, derivado según `data-model.md`, no almacenado)
- [ ] T031 [US3] En el cierre del examen (T016), actualizar `user_skill_levels` **solo si** `isBetterLevel()` lo confirma; incluir `profileLevel` e `improved` en la respuesta para que el candidato no crea que bajó de nivel (FR-021)
- [ ] T032 [US3] En el inicio del examen (T015), excluir de la selección las preguntas presentadas en el intento anterior de ese skill usando `pickQuestions()` de T005 (FR-014)

**Checkpoint**: El resultado es creíble — no se puede repetir hasta acertar, ni perder lo ganado.

---

## Phase 6: User Story 4 - Solo se examinan skills elegibles (Priority: P2)

**Goal**: El sistema solo ofrece examen de skills declarados y con banco suficiente, y
explica por qué cuando no.

**Independent Test**: Intentar iniciar el examen de (a) un skill no declarado y (b) uno
declarado sin banco suficiente, confirmando que ambos se bloquean con motivos distintos.

### Tests for User Story 4

- [ ] T033 [P] [US4] Integration test en `backend/tests/integration/skill-exams.routes.test.ts`: skill no declarado → `403 skill_not_declared`; banco con menos de 20 preguntas → `422 insufficient_bank`; con otro examen abierto → `409 exam_in_progress`. Ninguno crea filas
- [ ] T034 [P] [US4] Component test en `apps/community/tests/exam-eligibility.test.tsx`: un skill con `reason: "insufficient_bank"` se muestra como no disponible y no ofrece iniciar; uno con `waiting_period` muestra la fecha
- [ ] T035 [P] [US4] Test del índice único parcial (FR-017, `research.md` R7): con un intento `in_progress` abierto, intentar un `INSERT` directo de un segundo intento `in_progress` del mismo usuario y confirmar la violación del índice. **Verificar el constraint en sí, no una carrera real** — dos peticiones HTTP concurrentes son difíciles de reproducir de forma determinista y darían falsos verdes; este caso ya está descrito así en el Nivel 1 de `quickstart.md`

### Implementation for User Story 4

- [ ] T036 [US4] Implementar `GET /api/community/skill-exams/eligibility` en `backend/src/routes/community/skill-exams.routes.ts`: por cada skill de `users.skills` del `req.userId`, devolver `validatedLevel`, `achievedAt`, `canStart`, `reason` (`waiting_period` | `insufficient_bank` | `exam_in_progress`) y `retryAvailableAt`, más el bloque `inProgress` documentado en el contrato
- [ ] T037 [US4] En el inicio del examen (T015), añadir los guards: el skill debe estar en `users.skills` del propio `req.userId` (`403`, FR-002), el banco debe tener al menos 20 preguntas (`422`, FR-003) y no debe haber otro examen en curso (`409`, FR-017)
- [ ] T038 [US4] Crear `apps/community/app/(main)/examenes/page.tsx`: lista los skills declarados con su estado (validado con nivel / disponible / en espera con fecha / sin banco suficiente) y enlaza al examen cuando `canStart` es true

**Checkpoint**: Las 4 historias completas; ningún candidato puede quemar un intento en un examen imposible.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T039 [P] Ejecutar manualmente el Nivel 1 de `quickstart.md` contra Supabase: dos intentos `in_progress` del mismo usuario, `level='experto'`, `selected_option_index=-1`, `DELETE` de una pregunta ya usada, y PK duplicada en `user_skill_levels` — confirmar que los 5 son rechazados. **Añadir el caso de edición (FR-016)**: completar un examen, modificar después el `correct_answer_index` de una de sus preguntas, y confirmar que `skill_exam_attempts.level` y `user_skill_levels` siguen idénticos — el borrado ya lo bloquea el FK, pero editar no, y es el caso más plausible de los dos
- [ ] T040 [P] Crear `backend/scripts/test-skill-exams-bypass.ts` (Nivel 6, mismo patrón que `test-exam-questions-bypass.ts` de 001): responder el intento de otro usuario → `403`; `selectedOptionIndex: 99` → `400`; reenviar una posición ya contestada → `409` sin alterar la original; terminar y reenviar → `409` sin recalcular `level`. **Incluir un caso de campos forjados (FR-007, FR-013)**: enviar una respuesta con `"level": "avanzado"` y `"is_correct": true` en el body y confirmar que el resultado final los ignora — hoy dependemos de que Zod descarte claves desconocidas, que es comportamiento implícito de la librería y no una garantía verificada
- [ ] T041 Correr `npx tsc --noEmit` limpio en `backend`, `apps/community` y `packages/schemas`
- [ ] T042 Verificar manualmente en un navegador real las 4 historias de usuario, tal como pide el Success check de `quickstart.md`
- [ ] T043 Revisar el diff completo contra `spec.md` y el Constitution Check de `plan.md` antes de solicitar code review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: sin dependencias, pero **bloquea toda prueba end-to-end** — sin banco no hay examen posible
- **Foundational (T002-T007)**: depende de Setup solo para poder probarse; bloquea las 4 historias
- **US1 (Phase 3)**: depende de Foundational. Es la base de las demás: crea el archivo de rutas que US3 y US4 modifican
- **US2 (Phase 4)**: depende de Foundational; sus tests necesitan una fila en `user_skill_levels`, que US1 produce (o se puede sembrar a mano para probarla aislada)
- **US3 (Phase 5)**: modifica los handlers creados en US1 (T015, T016) — **no puede correr en paralelo con US4**, que toca el mismo archivo
- **US4 (Phase 6)**: modifica el mismo handler de inicio (T015) — secuencial respecto a US3
- **Polish (Phase 7)**: depende de las 4 historias

### Parallel Opportunities

- Foundational: T004, T005, T006, T007 en paralelo (archivos distintos); T002→T003 secuencial
- US1: los 7 tests (T008-T014) en paralelo; en implementación, el frontend (T019, T020) en paralelo con el backend (T015-T018)
- US2: T022, T023, T024 en paralelo; T025 y T026 tocan archivos distintos y también pueden ir en paralelo
- US3: T027, T028, T029 en paralelo
- US4: T033, T034, T035 en paralelo
- **US3 y US4 NO son paralelizables entre sí**: ambas modifican el handler de inicio en `skill-exams.routes.ts`

---

## Parallel Example: User Story 1

```bash
# Tests de US1 en paralelo:
Task: "Integration test del flujo completo + retención auditable en backend/tests/integration/skill-exams.routes.test.ts"
Task: "Integration test de FR-005 (ninguna respuesta filtra correct_answer_index)"
Task: "Integration test de retomar un examen interrumpido (GET /current)"
Task: "Integration test de expiración a las 24h (410 + periodo de espera)"
Task: "Component test SkillExamRunner en apps/community/tests/"
Task: "Component test SkillExamResult en apps/community/tests/"
Task: "E2E happy path en e2e/skill-level-exam.spec.ts"

# Backend y frontend de US1 en paralelo:
Task: "Implementar los 3 endpoints en backend/src/routes/community/skill-exams.routes.ts"
Task: "Crear SkillExamRunner.tsx y SkillExamResult.tsx en apps/community/components/exam/"
```

---

## Implementation Strategy

### MVP (US1 + US2)

1. Setup (T001) — capturar el banco, sin esto no se puede probar nada
2. Foundational (T002-T007)
3. US1 (T008-T021) — el candidato se examina y obtiene nivel
4. US2 (T022-T026) — el nivel es visible para las empresas
5. **DETENER y VALIDAR**: correr los Niveles 3, 4 y 5 de `quickstart.md` sobre este alcance

Es un MVP entregable: sin US3 y US4 la feature funciona, pero **no debe exponerse a
usuarios reales todavía** — sin los guards de US4 un candidato puede quemar su intento en un
skill con 3 preguntas, y sin US3 el nivel no es una señal confiable.

### Incremental Delivery

1. Setup + Foundational → base lista
2. US1 → probar de forma independiente
3. US2 → probar de forma independiente → MVP funcional
4. US4 → los guards; a partir de aquí es seguro exponerlo
5. US3 → la credibilidad del resultado; feature completa

Nota: conviene hacer **US4 antes que US3** aunque ambas sean P2, porque US4 evita un daño
difícil de revertir (un intento quemado con 30 días de espera), mientras que US3 solo
protege la señal a futuro.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes entre sí
- Escribir los tests de cada historia antes de implementarla y confirmar que fallan primero
- Los tests de integración escriben en la base real: limpiar siempre en `afterAll`, como en 001
- Commitear después de cada tarea o grupo lógico
- Detenerse en cada checkpoint para validar la historia de forma independiente

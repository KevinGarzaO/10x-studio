---

description: "Task list template for feature implementation"
---

# Tasks: Formulario de creación de pregunta para examen de skill

**Input**: Design documents from `/specs/001-exam-question-form/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/exam-questions.md, quickstart.md

**Tests**: Incluidos — el ticket original define explícitamente 6 niveles de
prueba obligatorios en su Definition of Done, y el principio V de la
constitución ("Tests Ship With The Code") exige tests en el mismo PR sin
excepción.

**Organization**: Tareas agrupadas por historia de usuario (spec.md). US1 y
US3 son ambas P1 (MVP); US2 es P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1, US2 o US3, mapeado a spec.md
- Cada tarea incluye ruta de archivo exacta

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar el paquete de schemas compartido y el tooling de test que hoy no existe en el monorepo (ver `research.md` R1, R3).

- [X] T001 Crear el paquete de workspace `packages/schemas/`: `packages/schemas/package.json` (nombre `@avocado/schemas`, `main`/`types` apuntando a `examQuestion.ts`), `packages/schemas/tsconfig.json`, y añadir `packages/*` al patrón de `pnpm-workspace.yaml` (hoy solo incluye `apps/*` + `backend`)
- [X] T002 [P] Añadir `vitest` y `@vitest/ui` como devDependency en `backend/package.json`, `apps/community/package.json` y `packages/schemas/package.json`; añadir `@testing-library/react` y `@testing-library/jest-dom` como devDependency en `apps/community/package.json`
- [X] T003 [P] Añadir `@playwright/test` como devDependency en el `package.json` raíz, crear `playwright.config.ts` en la raíz apuntando a `e2e/`, y crear el directorio `e2e/`
- [X] T004 [P] Crear `vitest.config.ts` en `backend/`, `apps/community/` y `packages/schemas/` (config mínima, sin transformadores adicionales — ver `research.md` R3)

**Checkpoint**: `pnpm install` corre limpio con el nuevo workspace; `pnpm --filter @avocado/schemas exec vitest --run` no falla por falta de config (aunque todavía no haya tests).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migración de DB, schema Zod compartido y middleware de rol — nada de esto existía antes de esta feature (ver `research.md` R2, R4) y **todas** las historias de usuario dependen de ello.

**🔴 CRITICAL**: Ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [X] T005 Escribir `backend/sql/exam-questions-migration.sql`, idempotente (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`), con exactamente estas tres piezas (ver `data-model.md`):
  1. `skills(id uuid pk default gen_random_uuid(), name text unique not null, label text not null, created_at timestamptz default now())` + backfill de un `INSERT ... ON CONFLICT (name) DO NOTHING` con los 37 pares `{value→name, label→label}` de `apps/community/lib/profile-options.ts:49-87` (`CANONICAL_SKILLS`)
  2. `exam_questions(id uuid pk default gen_random_uuid(), question varchar(500) not null, skill_name varchar(50) not null references skills(name), correct_answer_index smallint not null check (correct_answer_index >= 0), difficulty_level varchar(12) not null check (difficulty_level in ('basico','intermedio','avanzado')), created_by uuid not null references users(id), created_at timestamptz default now())`
  3. `question_options(id uuid pk default gen_random_uuid(), exam_question_id uuid not null references exam_questions(id) on delete cascade, text varchar(200) not null, order_index smallint not null)`
  4. La función `validate_correct_answer_index()` y el `CONSTRAINT TRIGGER validate_correct_answer_index_trigger AFTER INSERT ON exam_questions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW` definidos textualmente en `data-model.md` (nota sobre `correct_answer_index`) — cierra en DB el límite superior (`correct_answer_index < count(question_options)`) que un `CHECK` de una sola tabla no puede expresar; mismo patrón de trigger que `classify_scraper_post()` en `backend/sql/scraper-classification-migration.sql`
- [X] T006 Aplicar `backend/sql/exam-questions-migration.sql` manualmente en el editor SQL de Supabase (no hay migration runner en este repo — ver `CLAUDE.md`) y verificar `SELECT count(*) FROM skills` = 37, y que el trigger `validate_correct_answer_index_trigger` quedó creado sobre `exam_questions` (Nivel 1 de `quickstart.md`, prerequisito para todo lo demás)
- [X] T007 [P] Crear `packages/schemas/examQuestion.ts` exportando `examQuestionSchema` (Zod) y el tipo inferido `ExamQuestionInput`, con estas reglas exactas (citadas de `data-model.md`/el ticket, sin margen de interpretación):
  - `question`: `z.string().trim().min(10).max(500)`
  - `skillName`: `z.string()` + `.refine()` contra la lista de nombres válidos (inyectada como parámetro de la función que construye el schema, para no acoplar el paquete a una consulta de DB — ver nota de implementación en el propio archivo)
  - `options`: `z.array(z.string().trim().min(1).max(200)).min(2).max(6).refine(opts => new Set(opts.map(o => o.toLowerCase())).size === opts.length, 'Las opciones no pueden repetirse')`
  - `correctAnswerIndex`: `z.number().int().min(0)` + `.refine()` a nivel de objeto completo verificando `correctAnswerIndex < options.length`
  - `difficultyLevel`: `z.enum(['basico','intermedio','avanzado'])`
- [X] T008 [P] Crear `backend/src/middleware/require-role.middleware.ts` exportando `requireRole(role: string)`, una factory de middleware Express: `401` (`{error:"unauthorized"}`) si no hay usuario autenticado en `req`, `403` (`{error:"forbidden", message:"No tienes permisos para esta acción"}`) si `req.user.roles` no incluye `role`, `next()` en otro caso
- [X] T009 Añadir `"@avocado/schemas": "workspace:*"` como dependencia en `backend/package.json` y `apps/community/package.json`, correr `pnpm install` desde la raíz y confirmar que ambos paquetes pueden importar `examQuestionSchema`

**Checkpoint**: Fundación lista — `skills` tiene 37 filas, el schema compartido existe e importa desde ambos lados, el middleware de rol existe (aún sin ruta que lo use).

---

## Phase 3: User Story 1 - Capturar una pregunta válida (Priority: P1) 🎯 MVP

**Goal**: Un administrador llena el formulario con datos válidos y la pregunta queda guardada permanentemente, con confirmación y limpieza del formulario (AC5).

**Independent Test**: Llenar el formulario con una pregunta, 2-6 opciones sin duplicados, una respuesta correcta marcada y una dificultad, enviar, y confirmar que la fila quedó en `exam_questions`/`question_options` y el formulario se limpió.

### Tests for User Story 1

> **NOTA: escribir estos tests primero y confirmar que fallan antes de implementar**

- [X] T010 [P] [US1] Unit test de caso feliz en `backend/tests/unit/examQuestion.schema.test.ts`: un payload completo y válido (los 5 campos) pasa `examQuestionSchema.safeParse()` sin errores
- [ ] T011 [P] [US1] Integration test en `backend/tests/integration/exam-questions.routes.test.ts`: POST completo válido (con sesión admin real de la BD de test) → `201`, y una lectura directa a `exam_questions` + `question_options` confirma que lo guardado coincide exacto con el payload enviado (round-trip, ver `contracts/exam-questions.md`)
- [X] T012 [P] [US1] Component test en `apps/community/tests/ExamQuestionForm.test.tsx`: mock de `fetch` a `/api/admin/exam-questions` respondiendo `201` → verificar que se llamó con el payload exacto esperado y que el formulario se limpió después
- [ ] T013 [P] [US1] E2E happy path en `e2e/exam-question-form.spec.ts`: login como admin → llenar formulario válido → submit → ver confirmación → confirmar contra Supabase que la pregunta quedó guardada con los datos exactos capturados

### Implementation for User Story 1

- [X] T014 [US1] Implementar el handler de `POST /api/admin/exam-questions` en `backend/src/routes/admin/exam-questions.routes.ts`: parsea el body con `examQuestionSchema` (usando la lista de `skills.name` vigente para el `.refine()` de `skillName`), inserta `exam_questions` + sus `question_options` dentro de una misma transacción (si la inserción de opciones falla, la pregunta también se revierte — ver `contracts/exam-questions.md`, "Idempotency / Side effects"), responde `201` con el payload documentado en el contrato, `400` con `{error, field, message}` si Zod rechaza, `500` genérico en cualquier otro fallo
- [X] T015 [US1] Montar la ruta en `backend/index.ts` bajo `/api/admin/exam-questions`, encadenando: middleware de sesión existente → `requireRole('admin')` (T008) → el handler de T014
- [X] T016 [P] [US1] Crear `apps/community/components/admin/ExamQuestionForm.tsx`: textarea de pregunta (`maxLength=500`), `<select>` de skill poblado directamente desde `CANONICAL_SKILLS` (`apps/community/lib/profile-options.ts` — sin llamada de red nueva, ya que `skills` en DB es un backfill exacto de esa misma lista), inputs dinámicos de opción (agregar/quitar, `maxLength=200` cada uno), un radio button por opción para marcar la correcta, `<select>` cerrado de dificultad; el submit construye el payload y llama a `examQuestionSchema.safeParse()` antes de hacer `POST`
- [X] T017 [US1] Crear `apps/community/app/(main)/admin/exam-questions/new/page.tsx`: renderiza `ExamQuestionForm`, hace el `POST` vía el fetch wrapper existente del proyecto, muestra confirmación y limpia el formulario en éxito (AC5)

**Checkpoint**: El flujo feliz completo (US1) funciona de punta a punta para un admin — probarlo de forma independiente antes de continuar.

---

## Phase 4: User Story 3 - Restringir la captura de preguntas solo a administradores (Priority: P1)

**Goal**: Un usuario sin rol admin no puede acceder al formulario ni guardar una pregunta, ni siquiera llamando al endpoint directamente (AC6).

**Independent Test**: Acceder a la URL del formulario como usuario no-admin (bloqueado/redirigido), y por separado invocar el endpoint directamente con credenciales no-admin (rechazo, nada guardado).

### Tests for User Story 3

- [ ] T018 [P] [US3] Integration test en `backend/tests/integration/exam-questions.routes.test.ts` (extiende el archivo de T011): POST con sesión de un usuario sin rol admin → `403`, y una lectura a `exam_questions` antes/después confirma el mismo conteo de filas (nada se guardó)
- [ ] T019 [P] [US3] Script de bypass manual (Nivel 6) en `backend/scripts/test-exam-questions-bypass.ts` (mismo patrón que los scripts uno-off existentes en `backend/scripts/`): hace `POST` directo al endpoint con datos que el frontend nunca dejaría enviar, una vez con sesión no-admin y otra con sesión admin pero payload inválido en todos los campos a la vez — confirma `403`/`400` respectivamente y verifica el conteo de filas de `exam_questions` sin cambios en ambos casos (ver `quickstart.md`, Nivel 6)
- [ ] T020 [P] [US3] E2E en `e2e/exam-question-form.spec.ts` (extiende el archivo de T013): login como usuario sin rol admin → navegar a la URL del formulario → confirmar que no se muestra el formulario (bloqueo o redirect)

### Implementation for User Story 3

- [X] T021 [US3] En `apps/community/app/(main)/admin/exam-questions/new/page.tsx` (de T017), añadir una verificación del lado cliente vía `useShell()`: si `user` es `null` o `user.roles` no incluye `'admin'`, redirigir fuera de la página sin renderizar el formulario (esta es una conveniencia de UX — el backend, no esta verificación, es la autoridad final per AC6)
- [X] T022 [US3] Confirmar en `backend/src/routes/admin/exam-questions.routes.ts` que `requireRole('admin')` (T015) se evalúa **antes** de parsear/validar el body con `examQuestionSchema` — un usuario no-admin debe recibir `403` sin que su body inválido llegue siquiera a Zod, tal como valida T019

**Checkpoint**: US1 + US3 completas = MVP seguro (alta feliz + restricción de acceso). Este es el punto natural para un primer deploy/demo.

---

## Phase 5: User Story 2 - Recibir retroalimentación inmediata sobre datos inválidos (Priority: P2)

**Goal**: Cada uno de los 4 casos de dato inválido (AC1-AC4) muestra su mensaje específico sin recargar la página y sin perder lo ya capturado.

**Independent Test**: Intentar enviar el formulario con cada tipo de dato inválido por separado y confirmar el mensaje de error correspondiente y que el envío no ocurre.

### Tests for User Story 2

- [X] T023 [P] [US2] Extender `backend/tests/unit/examQuestion.schema.test.ts` (de T010) con un caso que falla y uno que pasa por regla: `question` de 5 caracteres (falla) vs. 15 (pasa); `options` con 1 elemento (falla) vs. 2 (pasa); `options: ["Sí","sí"]` (falla, duplicado case-insensitive) vs. sin duplicados (pasa); `correctAnswerIndex: 5` con 3 `options` (falla) vs. `0` (pasa); `difficultyLevel: "experto"` (falla) vs. `"basico"` (pasa)
- [ ] T024 [P] [US2] Extender `backend/tests/integration/exam-questions.routes.test.ts` (de T011) con un `POST` por cada AC1-AC4 confirmando `400` y que el campo devuelto en `field` coincide con el campo realmente inválido
- [X] T025 [P] [US2] Extender `apps/community/tests/ExamQuestionForm.test.tsx` (de T012): blur en "pregunta" vacía → ver "La pregunta es obligatoria" sin llamada de red (AC1); 1 sola opción capturada → botón submit `disabled` y ver "Se requieren al menos 2 opciones" (AC2); 2+ opciones sin ninguna marcada como correcta → submit muestra "Selecciona la respuesta correcta" y no llama a `fetch` (AC3); dos opciones con el mismo texto (distinta capitalización) → submit muestra "Las opciones no pueden repetirse" y no llama a `fetch` (AC4)
- [ ] T026 [P] [US2] Extender `e2e/exam-question-form.spec.ts` (de T013/T020) con el flujo negativo completo AC1→AC4 antes del submit exitoso: cada error se corrige uno a la vez hasta llegar al envío válido

### Implementation for User Story 2

- [X] T027 [US2] En `ExamQuestionForm.tsx`, añadir trim automático en blur + primera letra en mayúscula para el campo `question`, y el mensaje inline "La pregunta es obligatoria" cuando queda vacío tras el trim (AC1)
- [X] T028 [US2] En `ExamQuestionForm.tsx`, deshabilitar el botón de submit y mostrar "Se requieren al menos 2 opciones" mientras `options.length < 2` (AC2)
- [X] T029 [US2] En `ExamQuestionForm.tsx`, bloquear el submit y mostrar "Selecciona la respuesta correcta" mientras ninguna opción tenga el radio marcado (AC3)
- [X] T030 [US2] En `ExamQuestionForm.tsx`, detectar duplicados case-insensitive entre las opciones capturadas (mismo `.refine()` que `examQuestionSchema`, reutilizado del paquete compartido en vez de reimplementarlo) y bloquear el submit con "Las opciones no pueden repetirse" (AC4)
- [X] T031 [US2] Mapear las respuestas `400` de T014 (`{field, message}`) al input correspondiente en `ExamQuestionForm.tsx`, y para `500`/timeout mostrar un mensaje genérico **sin** limpiar los datos ya capturados (FR-011) — a diferencia del flujo `201` de T017, que sí limpia

**Checkpoint**: Los 6 Acceptance Criteria de `spec.md` están cubiertos de punta a punta.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verificación final contra el Definition of Done del ticket original.

- [ ] T032 [P] Ejecutar manualmente el Nivel 1 de `quickstart.md` (DB aislado) contra Supabase: `INSERT` con `correct_answer_index` fuera de rango, `skill_name` inexistente, y `difficulty_level` fuera del enum — confirmar que los tres son rechazados por los constraints de T005
- [X] T033 [P] Actualizar la sección "Commands"/testing de `CLAUDE.md` para reflejar que `backend`, `apps/community` y `packages/schemas` ahora tienen Vitest configurado, y que existe una suite de Playwright en `e2e/` (el texto actual dice explícitamente que no hay test runner configurado — ya no es cierto tras esta feature)
- [X] T034 Correr `npx tsc --noEmit` limpio en `backend`, `apps/community` y `packages/schemas`
- [ ] T035 Verificar manualmente en un navegador real los 6 Acceptance Criteria de `spec.md` (no solo vía Playwright), tal como pide el Definition of Done del ticket
- [ ] T036 Revisar el diff completo contra el Definition of Done original del ticket antes de solicitar code review

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — bloquea las 3 historias de usuario
- **US1 (Phase 3)**: depende de Foundational — sin dependencia de US2/US3
- **US3 (Phase 4)**: depende de Foundational; T021 depende de que exista la página de T017 (US1), pero los tests de backend (T018, T019) son independientes de US1
- **US2 (Phase 5)**: depende de Foundational; sus tareas de implementación (T027-T031) modifican el mismo `ExamQuestionForm.tsx` creado en T016 (US1), así que en la práctica se implementa después de US1 aunque no dependa de su lógica de negocio
- **Polish (Phase 6)**: depende de que las 3 historias estén completas

### Parallel Opportunities

- T002, T003, T004 (Setup) en paralelo
- T007, T008 (Foundational) en paralelo entre sí (archivos distintos); T005/T006 son secuenciales entre sí y bloquean a T009 solo indirectamente (T009 no depende de la migración, solo del paquete de schemas)
- Dentro de US1: T010-T013 (tests) en paralelo entre sí; T016 en paralelo con T014/T015 (frontend vs. backend, sin dependencia de código entre ellos hasta la integración real)
- Dentro de US3: T018, T019, T020 en paralelo
- Dentro de US2: T023-T026 en paralelo

---

## Parallel Example: User Story 1

```bash
# Tests de US1 en paralelo:
Task: "Unit test de caso feliz en backend/tests/unit/examQuestion.schema.test.ts"
Task: "Integration test POST válido en backend/tests/integration/exam-questions.routes.test.ts"
Task: "Component test de submit exitoso en apps/community/tests/ExamQuestionForm.test.tsx"
Task: "E2E happy path en e2e/exam-question-form.spec.ts"

# Backend y frontend de US1 en paralelo (sin dependencia de código entre sí):
Task: "Implementar POST /api/admin/exam-questions en backend/src/routes/admin/exam-questions.routes.ts"
Task: "Crear ExamQuestionForm.tsx en apps/community/components/admin/"
```

---

## Implementation Strategy

### MVP First (US1 + US3)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (crítico — bloquea todo)
3. Completar Phase 3: US1 (alta feliz)
4. Completar Phase 4: US3 (restricción a admin) — ambas son P1, el MVP no está completo con solo una
5. **DETENER y VALIDAR**: correr `quickstart.md` Niveles 3, 5 y 6 contra este alcance
6. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → fundación lista
2. US1 → probar independientemente (aunque sin restricción de acceso todavía — no exponer aún)
3. US3 → probar independientemente → MVP completo, ahora sí exponible
4. US2 → probar independientemente → feature completa según Definition of Done

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes entre sí
- [Story] mapea cada tarea a su historia de usuario en `spec.md`
- Escribir los tests de cada historia antes de implementar, y confirmar que fallan primero
- Commitear después de cada tarea o grupo lógico
- Detenerse en cada checkpoint para validar la historia de forma independiente

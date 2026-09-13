# Implementation Plan: Formulario de creación de pregunta para examen de skill

**Branch**: `001-exam-question-form` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-exam-question-form/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Un formulario de administrador (en `apps/community`) para capturar preguntas de
opción múltiple hacia el banco de exámenes de skills, respaldado por un endpoint
`POST /api/admin/exam-questions` en el `backend` que re-valida todo con el mismo
schema Zod que usa el frontend, persiste en tres tablas nuevas (`exam_questions`,
`question_options`, y `skills` — el catálogo formalizado por esta feature), y
rechaza cualquier solicitud de un usuario sin rol admin.

## Technical Context

**Language/Version**: TypeScript (Node.js en `backend`, Next.js/React en `apps/community`) — mismo stack que el resto del monorepo, sin nueva versión de lenguaje.

**Primary Dependencies**: Express (ruta nueva), Zod (schema compartido), `@supabase/supabase-js` (persistencia), React + fetch wrapper existente del frontend de `apps/community` (no se usa `apps/avocado` en esta feature).

**Storage**: Supabase/Postgres — tres tablas nuevas: `exam_questions`,
`question_options`, y `skills` (catálogo formalizado por esta feature —
`research.md` R4 confirmó que no existía ninguna tabla `skills`; se crea con
backfill desde el array `CANONICAL_SKILLS` ya existente en el frontend).
`exam_questions.skill_name` referencia `skills(name)`.

**Testing**: No hay test runner configurado en el monorepo hoy (confirmado en `CLAUDE.md`). Esta feature requiere Vitest como runner nuevo, introducido como parte de esta misma feature (ver `research.md` — no hay alternativa dado el principio de "Tests Ship With The Code" de la constitución).

**Target Platform**: Web — `apps/community` (Next.js, puerto 3002) consumiendo `backend` (Express, puerto 3001), igual que el resto de la app.

**Project Type**: Web application (frontend + backend ya existentes en el monorepo) — esta feature añade una ruta de backend, una página/formulario de frontend, y un paquete de schemas compartido nuevo.

**Performance Goals**: Sin requisitos de performance específicos más allá de lo estándar de una operación administrativa de baja frecuencia (alta de preguntas, no un endpoint de tráfico alto).

**Constraints**: El backend NUNCA debe confiar en la validación del frontend (principio I de la constitución) — el mismo schema Zod se importa en ambos lados desde `packages/schemas/`, que no existe todavía en el repo y se crea como parte de esta feature.

**Scale/Scope**: Banco objetivo de 35 preguntas por skill; volumen de escritura bajo (uso exclusivo de administradores). No hay requisito de edición/eliminación ni de carga masiva en esta feature (ver Assumptions en spec.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra `.specify/memory/constitution.md` v1.0.0:

| Principio | Gate | Estado |
|---|---|---|
| I. Three-Layer Validation | DB (CHECK/FK constraints) + Backend (Zod) + Frontend (mismo Zod) deben existir los tres para todo campo, sin excepción | **PASS (sin excepciones)** — los 5 campos (question, skill_name, options, correct_answer_index, difficulty_level) tienen las 3 capas completas, documentadas en `data-model.md`. `correct_answer_index` requirió una vuelta adicional: un `CHECK` de una sola tabla no puede validar su límite superior (`< options.length`, que depende del conteo de otra tabla); en vez de dejar esa regla solo en Zod (lo que habría diluido el principio), se cierra con un `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` sobre `exam_questions` (mismo patrón de trigger que `classify_scraper_post()` en `backend/sql/scraper-classification-migration.sql`) — ver `data-model.md`. |
| II. Shared Validation Schemas | El schema debe vivir en `packages/schemas/` e importarse desde frontend y backend, no duplicarse | **PASS (requiere trabajo nuevo)** — `packages/schemas/` no existe en el repo todavía. Se crea como parte de esta feature (ver `research.md` R1). No es una violación: es la primera feature que ejercita este principio, tal como anticipa la constitución. |
| III. Explicit Auth on Every Endpoint | El nuevo endpoint debe declarar y verificar auth + autorización explícitamente | **PASS (requiere trabajo nuevo)** — no existe hoy un middleware de autorización por rol de usuario en `backend` (solo existe `adminAuthMiddleware`, que verifica un secreto compartido de servidor a servidor para los endpoints del scraper, un caso distinto). Se investiga en `research.md` R2 y se documenta la decisión. |
| IV. Trim All Free Text | `question` y cada `option` deben persistirse trimmeados | **PASS** — ya especificado en el ticket a nivel de schema Zod (`.trim()`) y de frontend (trim en blur). |
| V. Tests Ship With The Code | Tests unitarios + integración en el mismo PR | **PASS (requiere trabajo nuevo)** — no hay test runner configurado en el monorepo; se introduce Vitest en esta misma feature (ver `research.md` R3), no se difiere. |
| VI. No Undisclosed Scope Creep | No tocar el catálogo de skills existente ni el flujo de examen del usuario final | **PASS (con hallazgo señalado)** — se descubrió durante la investigación que la tabla `skills` que el ticket asumía "existente" no existe (confirmado por el usuario vía `information_schema`); el catálogo real hoy es el array `CANONICAL_SKILLS` en `apps/community/lib/profile-options.ts`. Se le presentó la discrepancia al usuario antes de tocar nada, y eligió explícitamente crear una tabla `skills` nueva (ver `research.md` R4) en vez de asumirlo en silencio. `users.skills`, `scraper_posts.skills`/`community_posts.skills` y el trigger `ILIKE` del scraper permanecen sin modificar — la tabla nueva sirve solo de FK target para `exam_questions`, no reemplaza esas fuentes. |

No hay violaciones que requieran la tabla de Complexity Tracking — las dos filas marcadas "requiere trabajo nuevo" son la primera vez que se ejercitan esos principios en el repo, no excepciones a ellos.

## Project Structure

### Documentation (this feature)

```text
specs/001-exam-question-form/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/
└── schemas/
    └── examQuestion.ts          # Zod schema compartido (NUEVO paquete — no existía)

backend/
├── sql/
│   └── exam-questions-migration.sql   # CREATE TABLE skills, exam_questions, question_options (IF NOT EXISTS) + backfill de CANONICAL_SKILLS en skills
├── src/
│   ├── middleware/
│   │   └── require-role.middleware.ts # NUEVO: verifica users.roles incluye 'admin'
│   └── routes/
│       └── admin/
│           └── exam-questions.routes.ts # NUEVO: POST /api/admin/exam-questions
└── tests/
    ├── unit/examQuestion.schema.test.ts
    └── integration/exam-questions.routes.test.ts

apps/community/
├── app/(main)/admin/exam-questions/new/
│   └── page.tsx                       # NUEVO: página del formulario (admin-only)
├── components/admin/
│   └── ExamQuestionForm.tsx           # NUEVO: componente del formulario
└── tests/
    └── ExamQuestionForm.test.tsx       # componente, mockeando el backend

e2e/
└── exam-question-form.spec.ts          # Nivel 5 (E2E) — Playwright, ver research.md R3
```

**Structure Decision**: Web application ya existente (Option 2 del template) —
esta feature no introduce nuevas apps ni cambia el layout del monorepo. Se
añade únicamente: un paquete de workspace nuevo (`packages/schemas`, referenciado
como dependencia de workspace tanto por `backend` como por `apps/community`),
una ruta bajo un namespace `admin/` nuevo en `backend/src/routes/` (no existía
ninguna ruta de administración por rol hasta ahora — solo el secreto compartido
del scraper), y una página/componente nuevos en `apps/community` bajo un área
`admin/` también nueva ahí. Ningún archivo existente de `backend/routes/scraper.ts`,
`backend/middleware/admin-auth.middleware.ts`, ni del catálogo de `skills` se
modifica.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No aplica — el Constitution Check no tiene violaciones que justificar (ver
tabla arriba).

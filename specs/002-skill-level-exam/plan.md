# Implementation Plan: Validación de nivel por skill mediante examen

**Branch**: `002-skill-level-exam` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-skill-level-exam/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

El candidato presenta un examen de opción múltiple sobre un skill que ya declaró,
respondiendo pregunta por pregunta contra un endpoint que **nunca le envía cuál es la
respuesta correcta**; el backend califica, asigna un nivel (básico/intermedio/avanzado) y
guarda el mejor nivel alcanzado por skill, que el perfil público muestra junto a cada
skill. Un intento por skill con 30 días de espera, y un examen interrumpido se puede
retomar dentro de 24 horas antes de expirar.

## Technical Context

**Language/Version**: TypeScript — Node/Express en `backend`, Next.js App Router + React
en `apps/community`. Sin versiones ni lenguajes nuevos.

**Primary Dependencies**: Express (rutas nuevas), Zod vía `@avocado/schemas` (paquete
compartido creado en 001), `@supabase/supabase-js` (persistencia), React en
`apps/community`. Sin dependencias nuevas.

**Storage**: Supabase/Postgres — tres tablas nuevas (`skill_exam_attempts`,
`skill_exam_attempt_questions`, `user_skill_levels`) que leen del banco existente
(`exam_questions`, `question_options`, `skills`, creadas en 001) sin modificarlo.

**Testing**: Vitest (`backend`, `apps/community`, `packages/schemas`) y Playwright
(`e2e/`), ya configurados por la feature 001 — esta feature los usa, no los introduce.

**Target Platform**: Web — `apps/community` (puerto 3002) contra `backend` (puerto 3001),
igual que el resto de la app.

**Project Type**: Web application ya existente. Añade rutas de backend, tablas, un paquete
de schema compartido ampliado, y pantallas nuevas en `apps/community`.

**Performance Goals**: El único camino caliente es la lectura del perfil público
(`GET /api/community/users/:username`), que visitan empresas y buscadores. Los niveles
validados se leen de una tabla desnormalizada por `(user_id, skill_name)` para no calcular
un máximo sobre historial de intentos en cada visita.

**Constraints**: La restricción dura es FR-005 — `correct_answer_index` **no puede salir
del servidor** por ningún camino mientras la pregunta esté sin contestar. Toda la
calificación ocurre en el backend, que nunca confía en nada que el dispositivo del
candidato afirme (FR-007). Segunda restricción: no introducir un cron nuevo para expirar
exámenes (el backend ya dispara crons reales al arrancar; ver `CLAUDE.md`).

**Scale/Scope**: Volumen de escritura bajo (un intento por skill por candidato cada 30
días). El banco objetivo es de 35 preguntas por skill; el examen toma 10.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra `.specify/memory/constitution.md` v1.0.0:

| Principio | Gate | Estado |
|---|---|---|
| I. Three-Layer Validation | DB (constraints) + Backend (Zod) + Frontend (mismo schema) para todo dato del usuario | **PASS** — los datos que envía el candidato son pocos (`skillName`, `selectedOptionIndex`) y llevan las 3 capas; ver `data-model.md`. Nota: la regla "el índice elegido debe existir entre las opciones de esa pregunta" solo puede validarse contra el estado del intento, así que vive en Backend (Zod acota el rango, el handler verifica contra la pregunta real) — la DB la respalda con un `CHECK (selected_option_index >= 0)` y el FK al intento. |
| II. Shared Validation Schemas | El schema vive en `packages/schemas/` e se importa desde ambos lados | **PASS** — se añade `packages/schemas/src/skillExam.ts` junto al `examQuestion.ts` de 001, importado por el handler y por el formulario del examen. |
| III. Explicit Auth on Every Endpoint | Cada endpoint declara y verifica auth + autorización | **PASS** — todos los endpoints del examen van detrás de `communityAuthMiddleware` y operan **exclusivamente** sobre `req.userId`; ninguno acepta un id de usuario en el body o la URL (un candidato no puede presentar ni consultar el examen de otro). La lectura del perfil público sigue sin auth, porque los niveles validados son públicos por diseño (US2). |
| IV. Trim All Free Text | Todo texto libre se trimea antes de guardar | **PASS (no aplica)** — esta feature no captura ningún texto libre del candidato; solo selecciones de opción e identificadores. No hay campo al que aplicar la regla. |
| V. Tests Ship With The Code | Tests unitarios + integración en el mismo PR | **PASS** — el runner ya existe (introducido por 001); esta feature agrega sus propios tests en los mismos lugares. |
| VI. No Undisclosed Scope Creep | No tocar lógica fuera del alcance sin señalarlo | **PASS (con tres consecuencias señaladas)** — (1) `GET /api/community/users/:username` se amplía para incluir los niveles validados; (2) `public-profile-view.tsx:69` pasa de renderizar el skill como texto plano a mostrarlo con su nivel. Ambos son inevitables para cumplir US2. (3) **Detectado al re-evaluar tras el diseño**: el FK `ON DELETE RESTRICT` hacia `exam_questions` (ver `research.md` R5) impone una restricción nueva sobre una tabla de la feature 001 — una pregunta ya usada en algún intento deja de ser borrable. Hoy no rompe nada (001 no tiene interfaz de borrado), pero condiciona a quien construya esa interfaz después. Ningún archivo de 001 se modifica. |

Sin violaciones que justificar.

## Project Structure

### Documentation (this feature)

```text
specs/002-skill-level-exam/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/schemas/src/
└── skillExam.ts                          # NUEVO: schema compartido (start + answer)

backend/
├── sql/
│   └── skill-exams-migration.sql         # NUEVO: 3 tablas + constraints + índice parcial único
├── src/
│   ├── routes/community/
│   │   ├── skill-exams.routes.ts         # NUEVO: eligibility, start, current, answer
│   │   └── users.routes.ts               # MODIFICADO: el perfil incluye niveles validados
│   └── services/
│       └── skill-exam.service.ts         # NUEVO: selección de preguntas, calificación, nivel
└── tests/
    ├── unit/skillExam.schema.test.ts     # NUEVO
    ├── unit/skill-exam.service.test.ts   # NUEVO: umbrales, mejor-nivel, selección
    └── integration/skill-exams.routes.test.ts  # NUEVO

apps/community/
├── app/(main)/examenes/
│   ├── page.tsx                          # NUEVO: mis skills y su estado de validación
│   └── [skill]/page.tsx                  # NUEVO: el examen en curso
├── components/
│   ├── exam/SkillExamRunner.tsx          # NUEVO: una pregunta a la vez, sin volver atrás
│   ├── exam/SkillExamResult.tsx          # NUEVO: nivel obtenido al terminar
│   └── public-profile-view.tsx           # MODIFICADO: skill + nivel validado
└── tests/
    ├── SkillExamRunner.test.tsx          # NUEVO
    └── SkillExamResult.test.tsx          # NUEVO

e2e/
└── skill-level-exam.spec.ts              # NUEVO: AC de US1-US4 contra servidores reales
```

**Structure Decision**: Misma aplicación web existente; no se añaden apps ni paquetes
nuevos. Se reutiliza `packages/schemas` (creado en 001) en vez de crear otro paquete
compartido, y las rutas nuevas viven bajo `backend/src/routes/community/` junto a sus
pares (`feed.routes.ts`, `history.routes.ts`) porque el examen es funcionalidad de
candidato, no de administración — el namespace `admin/` de 001 no aplica aquí. La lógica
de selección y calificación se extrae a un servicio (`skill-exam.service.ts`) en vez de
vivir en el handler, porque es la parte con reglas de negocio reales (umbrales, mejor
nivel, exclusión de preguntas repetidas) y es donde se concentran los tests unitarios.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No aplica — el Constitution Check no tiene violaciones que justificar (ver tabla arriba).

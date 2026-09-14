# Implementation Plan: Fundación de cuentas — tipo de cuenta, superadmin y catálogo de skills aprobado

**Branch**: `003-account-foundation` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-account-foundation/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Toda cuenta pasa a tener un tipo (`candidate` o `company`) y un permiso de superadmin propio,
separado de las keywords del scraper. Ambos solo se pueden cambiar desde la base de datos, con
funciones SQL que registran el cambio y un trigger que bloquea cualquier otro camino.

El catálogo de skills sale de la base de datos:
- `skills` contiene solo los aprobados;
- los alias y las propuestas de candidatos viven en tablas propias;
- el superadmin decide las propuestas a mano en SQL;
- un trigger impide guardar en un perfil un skill fuera del catálogo o borrar uno en uso.

El perfil del candidato se valida con un schema compartido. La verificación de perfil completo
incluye la foto y cubre también ajustes, guardados y notificaciones.

Los exámenes quedan solo para candidatos. El scraper busca empresas por un `company_slug`
propio, así que nunca reutiliza la cuenta de una persona.

## Technical Context

**Language/Version**: TypeScript. Node/Express en `backend`, Next.js App Router + React en
`apps/community`, SQL (PL/pgSQL) en la migración. Sin lenguajes ni versiones nuevas.

**Primary Dependencies**:
- Express
- Zod vía `@avocado/schemas`
- `@supabase/supabase-js`
- React

Sin dependencias nuevas. Tampoco se habilitan extensiones de Postgres: la normalización usa
`translate()`, no `unaccent` (`research.md` R7).

**Storage**: Supabase/Postgres.
- **Columnas nuevas en `users`**: `account_type`, `is_superadmin`, `company_slug`.
- **Tablas nuevas**: `account_type_changes`, `superadmin_changes`, `skill_aliases`,
  `skill_proposals`, `skill_proposal_supporters`.
- **Funciones SQL de superadmin** y 4 triggers de protección.

Ver `data-model.md`.

**Testing**: Vitest (`backend`, `apps/community`) y Playwright (`e2e/`), ya configurados.
Se agrega un script de verificación de garantías de la base de datos con el mismo patrón que
001 y 002.

**Target Platform**: Web. `apps/community` (3002) contra `backend` (3001). El superadmin
trabaja en el editor SQL de Supabase (aclaración de la spec). No se toca `apps/avocado`.

**Project Type**: Aplicación web existente.

**Performance Goals**: Nada nuevo en caminos calientes.
- `GET /skills` devuelve menos de 100 filas y el frontend lo carga una vez por pantalla.
- El trigger `validate_candidate_skills` hace un `NOT EXISTS` sobre `skills.name`, que es
  `UNIQUE` e indexado, por cada skill del perfil; son pocos skills.

**Constraints**:
1. **No hay operación de aplicación** para cambiar el tipo de cuenta, el permiso de superadmin
   ni decidir propuestas (aclaraciones Q1–Q3). La base de datos debe hacer cumplir esas reglas
   por sí misma.
2. **La migración la aplica el usuario a mano**, y su orden interno importa: primero los
   backfills, después los triggers.
3. **No romper las URLs `/empresas/:slug`** que ya se generan en cuatro lugares del frontend.

**Scale/Scope**: 17 cuentas hoy (12 empresas, 1 bot, 4 personas). 37 skills. Ningún skill
fuera del catálogo. 0 intentos de examen. Volumen de propuestas esperado: bajo, decenas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluado contra `.specify/memory/constitution.md` v1.0.0, antes y después del diseño:

| Principio | Gate | Estado |
|---|---|---|
| I. Three-Layer Validation | DB + Backend (Zod) + Frontend (mismo schema) para todo dato del usuario | **PASS**. Hay dos datos del usuario: el perfil y el texto de propuesta.<br>• **Perfil**: CHECK/triggers en DB (skills del catálogo, no vaciar obligatorios), `buildCandidateProfileSchema` en backend y el mismo schema en onboarding y ajustes.<br>• **Propuesta**: `CHECK` de formato y longitud y `UNIQUE` en DB, `skillProposalSchema` en ambos lados.<br>Dos reglas no pueden expresarse en DB y se declaran en `data-model.md`: "al menos un skill" (las cuentas existen antes del onboarding) y "máximo 5 pendientes" (depende de contar filas). Ambas tienen al backend como autoridad y el mismo schema en frontend. |
| II. Shared Validation Schemas | Schemas en `packages/schemas/` importados por ambos lados | **PASS**. Nuevos `skills.ts` (`normalizeSkillKey`, `resolveSkill`, `skillProposalSchema`) y `candidateProfile.ts`. Los enums `SENIORITY`, `ROLE_CATEGORY` y `WORK_MODALITY`, hoy duplicados entre `users.routes.ts:102-106` y `lib/profile-options.ts`, se mueven al paquete. `normalize_skill_key` en SQL replica la lógica, y un test verifica que ambas den el mismo resultado (`research.md` R7). |
| III. Explicit Auth on Every Endpoint | Cada endpoint declara auth y autorización | **PASS**.<br>• `GET /skills` y `GET /companies/:slug`: **públicos por diseño**, declarados en contrato (datos no personales o perfiles ya públicos).<br>• `POST /skill-proposals` y `GET /skill-proposals/mine`: `communityAuthMiddleware` + `requireAccountType('candidate')`, solo sobre `req.userId`.<br>• `PUT /users/:username` gana la verificación de tipo.<br>• Los 4 de `skill-exams` ganan `requireAccountType('candidate')`.<br>• `exam-questions` pasa a `requireSuperadmin`.<br>Las funciones SQL privilegiadas no son endpoints; su `EXECUTE` se revoca a `anon` y `authenticated` (R2). |
| IV. Trim All Free Text | Todo texto libre se trimea antes de guardar | **PASS**. Texto de propuesta, motivos de rechazo y de cambio de tipo, y título, ubicación, nombre, bio, sitio y GitHub del perfil. Se aplica con `trim` en el schema y con `CHECK (x = btrim(x))` en DB para las columnas nuevas. |
| V. Tests Ship With The Code | Unit + integración en el mismo PR | **PASS**. Seis niveles (`research.md` R14, `quickstart.md`), incluido el script de garantías de la base de datos. |
| VI. No Undisclosed Scope Creep | Señalar cambios a lógica fuera del alcance | **PASS, con cambios señalados.** Todos son necesarios para cumplir la spec y se listan abajo para que el usuario los reconozca antes de `/speckit-tasks`. |

**Cambios a código existente fuera de los archivos nuevos (principio VI):**

1. **Feature 001**: `exam-questions.routes.ts` cambia `requireRole('admin')` por
   `requireSuperadmin`, se elimina `require-role.middleware.ts`, y `ExamQuestionForm.tsx` toma
   la lista de skills del catálogo en vez de `CANONICAL_SKILLS`. Sin esto, un skill aprobado
   nunca podría tener preguntas (FR-022). El fixture E2E `roles: ['admin']` pasa a
   `is_superadmin: true`.
2. **Feature 002**: los 4 endpoints de `skill-exams.routes.ts` agregan
   `requireAccountType('candidate')` (FR-008), y `/examenes/[skill]` toma la etiqueta del
   catálogo.
3. **`PUT /api/community/users/:username`** pasa de aceptar datos parciales sin validar a exigir
   el perfil de candidato completo, validado y con `trim` (R8). Onboarding y ajustes ya envían
   todos los obligatorios.
4. **`shell.tsx`**: la condición inline del gate se reemplaza por `ProfileGate`, que ahora
   incluye foto y skills sin resolver. `AccountLayout` y `/create` también lo montan.
5. **Onboarding** precarga todos los campos, no solo la foto (FR-026).
6. **`roles` pierde el valor `'admin'`** en las 2 cuentas que lo tienen (R2).
7. **`getOrCreateCompanyUser`** (`services/scraper/sync.ts`) busca por `company_slug`.
   `/empresas/[company]` llama a un endpoint nuevo, y `stats.routes.ts` y `hero-banner.tsx`
   usan `companySlug` (R13).
8. **Pendiente de aprobación, no incluido por defecto**: `backend/scripts/sync-to-community.ts`
   tiene una **copia** de `getOrCreateCompanyUser` con el mismo error. Se propone que importe la
   del servicio; se decide en `/speckit-tasks`.
9. **Explícitamente fuera**: el error de elegibilidad de 002 (un fallo al contar el banco se
   reporta como "banco insuficiente"). Se detectó antes, pero no pertenece a esta spec.

Sin violaciones que justificar.

## Project Structure

### Documentation (this feature)

```text
specs/003-account-foundation/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── skills-catalog.md          # GET /skills, POST /skill-proposals, GET /skill-proposals/mine
│   └── profile-and-accounts.md    # PUT /users, GET /companies/:slug, cambios en endpoints existentes
├── checklists/requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
packages/schemas/src/
├── skills.ts                              # NUEVO: normalizeSkillKey, resolveSkill, skillProposalSchema
├── candidateProfile.ts                    # NUEVO: enums del perfil + buildCandidateProfileSchema
└── index.ts                               # MODIFICADO: exporta los nuevos

backend/
├── sql/
│   └── account-foundation-migration.sql   # NUEVO: columnas, tablas, backfills, funciones, triggers
├── src/middleware/
│   ├── require-role.middleware.ts         # ELIMINADO (sin otros usos)
│   ├── require-superadmin.middleware.ts   # NUEVO
│   └── require-account-type.middleware.ts # NUEVO
├── src/routes/
│   ├── community/
│   │   ├── skills.routes.ts               # NUEVO: GET /skills
│   │   ├── skill-proposals.routes.ts      # NUEVO: POST /, GET /mine
│   │   ├── companies.routes.ts            # NUEVO: GET /:slug
│   │   ├── users.routes.ts                # MODIFICADO: PUT validado; carga de perfil reutilizable
│   │   ├── skill-exams.routes.ts          # MODIFICADO: requireAccountType('candidate')
│   │   └── stats.routes.ts                # MODIFICADO: companySlug
│   └── admin/exam-questions.routes.ts     # MODIFICADO: requireSuperadmin
├── src/services/
│   └── skill-proposal.service.ts          # NUEVO: resolver → created/joined/resolved/rejected/limit
├── services/scraper/sync.ts               # MODIFICADO: getOrCreateCompanyUser por company_slug
├── index.ts                               # MODIFICADO: monta las 3 rutas nuevas
├── scripts/test-account-foundation-bypass.ts  # NUEVO: garantías de la DB
├── scripts/test-exam-questions-bypass.ts  # MODIFICADO: requireSuperadmin
└── tests/
    ├── unit/require-role.middleware.test.ts     # REEMPLAZADO por require-superadmin.middleware.test.ts
    ├── unit/require-account-type.middleware.test.ts # NUEVO
    ├── unit/skills.schema.test.ts               # NUEVO
    ├── unit/candidateProfile.schema.test.ts     # NUEVO
    ├── unit/skill-proposal.service.test.ts      # NUEVO
    ├── unit/company-username.test.ts            # NUEVO: desambiguador
    ├── integration/skills.routes.test.ts        # NUEVO
    ├── integration/skill-proposals.routes.test.ts # NUEVO
    ├── integration/exam-questions.routes.test.ts # MODIFICADO: requireSuperadmin
    ├── integration/users.routes.test.ts         # MODIFICADO: PUT validado
    ├── integration/companies.routes.test.ts     # NUEVO (incluye getOrCreateCompanyUser)
    ├── integration/skill-exams.routes.test.ts   # MODIFICADO: candidates_only
    └── integration/privileged-functions.test.ts # NUEVO: ninguna ruta las invoca

apps/community/
├── lib/
│   ├── profile-options.ts                 # MODIFICADO: sin CANONICAL_SKILLS; enums desde @avocado/schemas
│   ├── skill-catalog.ts                   # NUEVO: useSkillCatalog()
│   └── profile-gate.ts                    # NUEVO: profileGateReason()
├── components/
│   ├── profile-gate.tsx                   # NUEVO: <ProfileGate>
│   ├── profile-form-fields.tsx            # MODIFICADO: SkillsInput con catálogo, alias y propuestas
│   ├── skill-proposals-list.tsx           # NUEVO: estado de mis propuestas
│   ├── onboarding.tsx                     # MODIFICADO: precarga completa + schema compartido
│   ├── account-pages.tsx                  # MODIFICADO: AccountLayout monta ProfileGate; ajustes con schema
│   ├── shell.tsx                          # MODIFICADO: usa ProfileGate
│   ├── hero-banner.tsx                    # MODIFICADO: enlaza por companySlug
│   └── admin/ExamQuestionForm.tsx         # MODIFICADO: skills del catálogo
├── app/
│   ├── create/page.tsx                    # MODIFICADO: monta ProfileGate
│   ├── (main)/empresas/[company]/page.tsx # MODIFICADO: GET /companies/:slug
│   └── (main)/examenes/[skill]/page.tsx   # MODIFICADO: etiqueta del catálogo
└── tests/
    ├── ExamQuestionForm.test.tsx          # MODIFICADO: catálogo en vez de CANONICAL_SKILLS
    ├── SkillsInput.test.tsx               # NUEVO
    ├── profile-gate.test.tsx              # NUEVO
    └── onboarding.test.tsx                # NUEVO: precarga

e2e/
├── account-foundation.spec.ts             # NUEVO: alias, propuesta, gate sin foto
└── exam-question-form.spec.ts             # MODIFICADO: fixture is_superadmin
```

**Structure Decision**: Misma aplicación web y mismo paquete compartido; no se crean apps ni
paquetes nuevos.
- Los middlewares nuevos van en `backend/src/middleware/`, junto al `require-role` que
  reemplazan, no en `backend/middleware/`, donde vive `community-auth`.
- Las rutas nuevas van en `src/routes/community/` porque sirven al candidato.
- La lógica de resolución de propuestas va a un servicio porque es donde están las reglas y
  los tests unitarios.
- Nada va a `apps/avocado`: las pantallas de superadmin quedaron fuera por aclaración.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No aplica: el Constitution Check no tiene violaciones.

Hay dos decisiones que se parecen a complejidad extra, ya justificadas en `research.md`:
- **Funciones SQL con bandera de transacción en vez de un endpoint (R2)**: lo exigen las
  aclaraciones de la spec.
- **Triggers sobre `users.skills` en vez de una tabla puente (R6)**: se eligió así para no
  reescribir los lectores actuales de `users.skills`.

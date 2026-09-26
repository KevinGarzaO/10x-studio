---

description: "Task list for feature implementation"
---

# Tasks: Fundación de cuentas — tipo de cuenta, superadmin y catálogo de skills aprobado

**Input**: Design documents from `/specs/003-account-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Incluidos. El principio V de la constitución exige tests unitarios y de integración en
el mismo PR, y el requerimiento original define 6 niveles de prueba (ver `quickstart.md`).

**Organization**: Las tareas se agrupan por historia de usuario, para poder implementar y probar
cada una por separado.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Se puede hacer en paralelo (archivo distinto, sin dependencias pendientes)
- **[Story]**: A qué historia pertenece (US1…US5)
- Cada tarea nombra su archivo exacto

## Path Conventions

Monorepo pnpm ya existente (ver `plan.md`): `packages/schemas/src/`, `backend/` (con `src/` y
carpetas heredadas en la raíz), `apps/community/`, y `e2e/` en la raíz.

---

## Phase 1: Setup (schemas compartidos)

**Purpose**: Dejar listo el paquete compartido que backend y frontend van a importar. Sin esto,
cualquier validación se escribiría dos veces y rompería el principio II.

- [X] T001 [P] Crear `packages/schemas/src/skills.ts` con: `normalizeSkillKey(text)` (trim →
  minúsculas → quitar acentos NFD → eliminar todo lo que no sea `[a-z0-9+#]`, conservando `+` y
  `#` para `C++`/`C#`), `resolveSkill(text, catalog)` (busca por nombre normalizado, luego por
  etiqueta normalizada, luego por alias; devuelve `null` si no hay coincidencia) y
  `skillProposalSchema` (`text`: string, `trim`, `min(1)`, `max(50)`, y `refine` de que su clave
  normalizada no quede vacía). Ver `research.md` R5.
- [X] T002 [P] Crear `packages/schemas/src/candidateProfile.ts` con los enums `SENIORITY`
  (`junior`, `semi_senior`, `senior`), `ROLE_CATEGORY` (los 13 valores de
  `apps/community/lib/profile-options.ts`) y `WORK_MODALITY` (`Remoto`, `Híbrido`,
  `Presencial`), más `buildCandidateProfileSchema(approvedSkillNames)`: obligatorios con `trim`
  (`title` 1-100, `roleCategory`, `seniority`, `skills` array `min(1)` sin repetidos y todos en
  `approvedSkillNames`, `location` 1-100, `workModality`) y opcionales con `trim`
  (`displayName`, `bio` máx 1000, `website`, `githubUrl`), en modo `strip` para que ningún campo
  extra pase.
- [X] T003 Exportar ambos módulos en `packages/schemas/src/index.ts` y verificar que
  `pnpm --filter @avocado/schemas build` compile a `dist/`.

---

## Phase 2: Foundational (migración, middlewares y catálogo)

**Purpose**: Base que todas las historias necesitan: las columnas y tablas nuevas, las
protecciones de la base de datos, los dos middlewares de autorización y el endpoint del catálogo.

**⚠️ CRITICAL**: Ninguna historia puede empezar antes de terminar esta fase. La migración la
aplica una persona a mano (T010) y su orden interno importa: backfills primero, triggers al final
(`data-model.md`).

### Tests de la fase foundational

- [X] T004 [P] Tests unitarios de los schemas nuevos en
  `backend/tests/unit/skills.schema.test.ts`: `normalizeSkillKey` con `" React.js "`, `"Node.js"`,
  `"C#"`, `"C++"`, acentos y cadena vacía; `resolveSkill` por nombre, etiqueta y alias y sin
  coincidencia; `skillProposalSchema` con texto vacío, de 51 caracteres y solo signos.
- [X] T005 [P] Tests unitarios del perfil en
  `backend/tests/unit/candidateProfile.schema.test.ts`: cada campo obligatorio vacío o en blanco
  falla, `skills` vacío falla, skill no aprobado falla, repetidos fallan, enums inválidos fallan,
  se hace `trim`, y los campos extra (`accountType`, `isSuperadmin`, `roles`, `companySlug`) se
  descartan.

### Migración (un solo archivo, tareas en orden — no paralelizables entre sí)

- [X] T006 Crear `backend/sql/account-foundation-migration.sql` con el bloque 1: `ALTER TABLE
  users ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'candidate'` con
  `CHECK (account_type IN ('candidate','company'))`, `is_superadmin BOOLEAN NOT NULL DEFAULT
  false` con `CHECK (NOT (is_superadmin AND account_type = 'company'))`, `company_slug TEXT` con
  `CHECK (company_slug IS NULL OR company_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` y el índice único
  parcial `ON users (company_slug) WHERE account_type = 'company'`; más los backfills: `company`
  para `scraper_source = 'company'` y para el bot `00000000-0000-0000-0000-000000000001`,
  `is_superadmin = true` donde `'admin' = ANY(roles)` seguido de `roles =
  array_remove(roles, 'admin')`, y `company_slug = username` para las cuentas de empresa. Todo
  idempotente.
- [X] T007 Agregar al mismo archivo el bloque 2: tablas `account_type_changes` y
  `superadmin_changes` (con `reason` `NOT NULL` y `CHECK (btrim(reason) <> '' AND reason =
  btrim(reason))`, `changed_by` con FK a `users`, `changed_at` por omisión `now()`, y en
  `account_type_changes` además `CHECK (from_type <> to_type)`); las funciones
  `change_account_type(p_user_id, p_new_type, p_reason, p_changed_by)` y
  `set_superadmin(p_user_id, p_value, p_reason, p_changed_by)`, que verifican que
  `p_changed_by` sea superadmin, activan `set_config('avotalent.privileged_change','on',true)`,
  aplican el cambio y registran; el trigger `guard_privileged_user_columns` (en `UPDATE` bloquea
  cambios de `account_type` o `is_superadmin`; en `INSERT` bloquea solo `is_superadmin = true`;
  ambos salvo bandera activa); el trigger `guard_last_superadmin` (`BEFORE UPDATE OR DELETE`); y
  `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated` en las dos funciones. Ver `research.md`
  R2.
- [X] T008 Agregar el bloque 3: `normalize_skill_key(text)` `IMMUTABLE` (equivalente SQL de
  `normalizeSkillKey`, con `translate()` en vez de `unaccent`); tabla `skill_aliases`
  (`alias_key TEXT PRIMARY KEY` con `CHECK (alias_key ~ '^[a-z0-9+#]+$')`, `skill_name`
  `REFERENCES skills(name) ON UPDATE CASCADE ON DELETE RESTRICT`); tabla `skill_proposals`
  (`normalized_key` `UNIQUE` y con `CHECK` de formato, `proposed_text` con `CHECK` de `btrim` y
  `char_length <= 50`, `status` `CHECK IN ('pending','approved','merged','rejected')`,
  `proposed_by`, `resulting_skill_name`, `rejection_reason`, `reviewed_by`, `reviewed_at`, más
  los 3 `CHECK` de coherencia de estado de `data-model.md`); tabla
  `skill_proposal_supporters` con PK `(proposal_id, user_id)`; la siembra de alias de
  `research.md` R5 (`reactjs`, `node`, `next`, `ts`, `postgres`, `k8s`, `go`, `ml`, `net`,
  `gcloud`); las funciones `approve_skill_proposal`, `merge_skill_proposal` y
  `reject_skill_proposal`; y la vista `pending_skill_proposals` con `supporter_count`.
- [X] T009 Agregar el bloque 4 (conversión, FR-015): `UPDATE users` que reemplaza cada elemento
  de `skills` por el skill aprobado cuando su clave normalizada coincide con `skills.name`, con
  la etiqueta o con un alias, quitando repetidos y **dejando intactos** los que no coinciden;
  luego el bloque 5 con los triggers de protección: `validate_candidate_skills` (`BEFORE INSERT
  OR UPDATE OF skills`, solo para `account_type = 'candidate'` y no perfil de scraper, mensaje
  `skill_not_in_catalog: <nombre>`), `prevent_clearing_required_profile_fields` (`BEFORE UPDATE`,
  mensaje `required_field_cleared: <campo>`, sobre `photo_url`, `title`, `role_category`,
  `seniority`, `location`, `work_modality` y `skills`) y el guard de `skills` que impide
  `DELETE` o renombrar un skill que algún `users.skills` contenga. **Este orden es obligatorio**:
  los triggers deben quedar después de la conversión.
- [ ] T010 **Tarea manual del usuario**: aplicar
  `backend/sql/account-foundation-migration.sql` en el editor SQL de Supabase y confirmar con
  las consultas de verificación de `quickstart.md` (conteo por `account_type`/`is_superadmin`,
  `roles` sin `'admin'`, alias sembrados) más una consulta que liste los skills de perfiles que no
  existen en el catálogo, que hoy debe devolver 0 filas (SC-001).

### Middlewares, catálogo y verificación de la base de datos

- [ ] T011 [P] Tests unitarios de los middlewares en
  `backend/tests/unit/require-superadmin.middleware.test.ts` y
  `backend/tests/unit/require-account-type.middleware.test.ts`: sin `req.userId` → 401; sin el
  permiso o con el tipo equivocado → 403 con el cuerpo del contrato; caso correcto → llama a
  `next()`.
- [ ] T012 [P] Crear `backend/src/middleware/require-superadmin.middleware.ts` (lee
  `users.is_superadmin` por `req.userId`; 401 sin sesión, `403 { error: 'forbidden', message: 'No
  tienes permisos para esta acción' }`) y borrar `backend/src/middleware/require-role.middleware.ts`
  junto con `backend/tests/unit/require-role.middleware.test.ts`.
- [ ] T013 [P] Crear `backend/src/middleware/require-account-type.middleware.ts`:
  `requireAccountType(type)` lee `users.account_type` por `req.userId` y responde
  `403 { error: 'candidates_only', message: 'Los exámenes son solo para candidatos' }` cuando no
  coincide.
- [ ] T014 Cambiar `backend/src/routes/admin/exam-questions.routes.ts` para usar
  `requireSuperadmin`, y actualizar lo que dependía del rol: el fixture de
  `e2e/exam-question-form.spec.ts` (`roles: ['admin']` → `is_superadmin: true`), los comentarios
  de `backend/scripts/test-exam-questions-bypass.ts` y las aserciones de
  `backend/tests/integration/exam-questions.routes.test.ts`.
- [ ] T015 [P] Test de integración del catálogo en
  `backend/tests/integration/skills.routes.test.ts`: `GET /api/community/skills` devuelve solo
  skills aprobados con sus alias, sin propuestas pendientes ni rechazadas, y sin requerir sesión.
- [ ] T016 Crear `backend/src/routes/community/skills.routes.ts` (`GET /`, público, devuelve
  `{ skills, aliases }` según `contracts/skills-catalog.md`; `500 { error:
  'catalog_unavailable' }` si falla la lectura) y montarlo en `backend/index.ts` como
  `/api/community/skills`.
- [ ] T017 [P] Crear `apps/community/lib/skill-catalog.ts` con `useSkillCatalog()`: carga el
  catálogo una vez, expone `skills`, `aliases`, `loading` y `error`, y **nunca** trata un fallo
  como catálogo vacío.
- [ ] T018 Crear `backend/scripts/test-account-foundation-bypass.ts` (nivel 1 automatizado) que
  verifique con la llave de servicio: skill inválido en `users.skills` rechazado, borrar un skill
  en uso rechazado, vaciar un campo obligatorio rechazado, `status = 'rejected'` sin motivo
  rechazado, alias duplicado rechazado, y `normalize_skill_key` igual a `normalizeSkillKey` sobre
  un set de ejemplos. Agregarlo al `include` de `backend/vitest.config.ts` junto a los otros dos
  scripts de bypass. Limpieza por id al terminar.

**Checkpoint**: migración aplicada, catálogo disponible y autorización lista. Las historias
pueden comenzar.

---

## Phase 3: User Story 1 — El candidato solo elige skills del catálogo aprobado (P1) 🎯 MVP

**Goal**: Que un candidato solo pueda guardar skills aprobados, que las variantes conocidas se
reconozcan solas y que el backend rechace cualquier otro valor.

**Independent Test**: Como candidato, en onboarding o ajustes, escribir `reactjs` y ver que queda
`React`; intentar guardar un skill fuera del catálogo (incluso llamando al endpoint directo) y
ver que se rechaza.

### Tests de la historia 1

- [ ] T019 [P] [US1] Ampliar `backend/tests/integration/users.routes.test.ts`: `PUT
  /api/community/users/:username` con un skill no aprobado → `400 skill_not_in_catalog`; sin
  título o con título en blanco → `400 validation_error` con `field`; sin foto y sin foto previa
  → `400 photo_required`; con `accountType: 'company'` en el body → `200` y el tipo **no** cambia;
  perfil de otro usuario → `403`; caso correcto → `200` con los textos trimeados.
- [ ] T020 [P] [US1] Test de componente en `apps/community/tests/SkillsInput.test.tsx`: las
  sugerencias vienen del catálogo cargado; `reactjs` se agrega como `react`; un texto sin
  coincidencia **no** se agrega como chip; con el catálogo en error no se puede agregar nada.

### Implementación de la historia 1

- [ ] T021 [US1] Validar en `backend/src/routes/community/users.routes.ts`: leer los skills
  aprobados, armar `buildCandidateProfileSchema`, rechazar con
  `400 { error: 'validation_error', field, message }`, exigir que la cuenta quede con foto
  (`400 photo_required`), aplicar `requireAccountType('candidate')`, y traducir los errores de los
  triggers (`skill_not_in_catalog`, `required_field_cleared`) a `400` en vez de `500`. Ver
  `contracts/profile-and-accounts.md`.
- [ ] T022 [US1] Quitar `CANONICAL_SKILLS` de `apps/community/lib/profile-options.ts` y reexportar
  desde ahí los enums de `@avocado/schemas`, para que `SENIORITY_OPTIONS`,
  `ROLE_CATEGORY_OPTIONS` y `MODALITY_OPTIONS` sigan sirviendo a la UI sin duplicar valores.
- [ ] T023 [US1] Reescribir `SkillsInput` en `apps/community/components/profile-form-fields.tsx`:
  sugerencias desde `useSkillCatalog()`, resolución con `resolveSkill` (alias incluidos), y sin
  agregar texto libre. Los skills del perfil que no estén aprobados se muestran marcados como
  "no está en el catálogo" con las acciones elegir, proponer y quitar (la acción de proponer se
  conecta en US2).
- [ ] T024 [US1] Usar el schema compartido antes de enviar en
  `apps/community/components/onboarding.tsx` y en `SettingsPage` de
  `apps/community/components/account-pages.tsx`, mostrando el error del campo en el propio
  formulario (FR-027) en vez de depender del mensaje del backend.
- [ ] T025 [P] [US1] Cambiar `apps/community/components/admin/ExamQuestionForm.tsx` para tomar la
  lista de skills de `useSkillCatalog()` (FR-022: un skill recién aprobado debe poder recibir
  preguntas) y actualizar `apps/community/tests/ExamQuestionForm.test.tsx`, que hoy depende de
  `CANONICAL_SKILLS`.
- [ ] T026 [P] [US1] Cambiar `apps/community/app/(main)/examenes/[skill]/page.tsx` para tomar la
  etiqueta del skill del catálogo en vez de `CANONICAL_SKILLS`.
- [ ] T027 [US1] E2E en `e2e/account-foundation.spec.ts`: un candidato completo abre `/settings`,
  escribe `reactjs`, ve que queda `React`, guarda y el cambio persiste tras recargar.

**Checkpoint**: el perfil ya solo acepta skills del catálogo, en la UI y en el endpoint.

---

## Phase 4: User Story 2 — Proponer un skill que falta (P1)

**Goal**: Que un candidato proponga un skill inexistente, que quede pendiente y no usable, y que
vea en qué terminó la decisión que el superadmin toma en la base de datos.

**Independent Test**: Proponer un skill nuevo y comprobar que no se puede seleccionar; aprobarlo
con `approve_skill_proposal` en SQL; volver a la app y comprobar que ya se puede agregar.

### Tests de la historia 2

- [ ] T028 [P] [US2] Tests unitarios en `backend/tests/unit/skill-proposal.service.test.ts` de la
  resolución: texto que coincide con skill, con etiqueta o con alias → `resolved`; propuesta
  `pending` existente → `joined`; `rejected` → `skill_rejected`; `approved`/`merged` → `resolved`
  con el skill resultante; 5 pendientes del mismo usuario → `proposal_limit`; texto nuevo →
  `created`.
- [ ] T029 [P] [US2] Test de integración en
  `backend/tests/integration/skill-proposals.routes.test.ts` con los casos de
  `quickstart.md` nivel 3: los 6 resultados, `403 candidates_only` para una cuenta de empresa,
  `401` sin sesión, `400` con texto vacío, e idempotencia al sumarse dos veces a la misma
  propuesta. Limpieza por id.
- [ ] T030 [P] [US2] Test de componente en
  `apps/community/tests/skill-proposals-list.test.tsx`: se listan las propuestas con su estado, el
  rechazo muestra el motivo, y una propuesta aprobada invita a agregar el skill.

### Implementación de la historia 2

- [ ] T031 [US2] Crear `backend/src/services/skill-proposal.service.ts` con la resolución de
  `research.md` R10, incluido el manejo del `23505` del `UNIQUE (normalized_key)` como `joined`
  (carrera entre dos personas) y el límite de 5 pendientes.
- [ ] T032 [US2] Crear `backend/src/routes/community/skill-proposals.routes.ts` con `POST /` y
  `GET /mine` (ambos con `communityAuthMiddleware` + `requireAccountType('candidate')`, solo
  sobre `req.userId`) según `contracts/skills-catalog.md`, y montarlo en `backend/index.ts`.
- [ ] T033 [US2] Conectar la acción "Proponer «X»" de `SkillsInput`
  (`apps/community/components/profile-form-fields.tsx`) al endpoint, **validando antes de enviar
  con `skillProposalSchema` de `@avocado/schemas`** (capa de frontend del principio I, mismo
  schema que usa el backend), y distinguiendo en la UI los 6 resultados: creada, ya pendiente,
  resuelta a un skill (se agrega solo), rechazada con motivo, límite alcanzado y error de
  validación.
- [ ] T034 [P] [US2] Crear `apps/community/components/skill-proposals-list.tsx` (estado de mis
  propuestas) y mostrarlo junto a los skills en onboarding y en ajustes.
- [ ] T035 [US2] Ampliar `e2e/account-foundation.spec.ts`: el candidato propone un skill
  inexistente, ve el estado "Pendiente", y ese skill no aparece como chip del perfil ni en las
  sugerencias.

**Checkpoint**: el candidato ya tiene salida cuando su skill no está en el catálogo.

---

## Phase 5: User Story 3 — Tipo de cuenta y superadmin (P1)

**Goal**: Que toda cuenta tenga tipo, que solo la base de datos pueda cambiarlo con registro, que
el permiso de superadmin sea independiente de las keywords del scraper, y que una cuenta de
empresa no pueda examinarse.

**Independent Test**: Verificar el backfill; intentar cambiar un tipo desde la app y ver que no
cambia; cambiarlo con `change_account_type` y ver el registro; con una cuenta de empresa, pedir
elegibilidad de examen y recibir 403.

### Tests de la historia 3

- [ ] T036 [P] [US3] Ampliar `backend/scripts/test-account-foundation-bypass.ts` con las
  garantías de esta historia: `UPDATE users SET account_type = …` directo falla;
  `change_account_type` sin motivo, o con un motivo que solo trae espacios, falla; con motivo
  válido funciona, lo guarda sin espacios sobrantes y escribe en `account_type_changes` (FR-023);
  quitar el permiso al último superadmin falla; una cuenta de empresa con `is_superadmin = true`
  falla por el `CHECK`; e insertar una cuenta como lo hace el scraper con `is_superadmin = true`
  también falla (FR-030).
- [ ] T037 [P] [US3] Ampliar `backend/tests/integration/skill-exams.routes.test.ts`: los 4
  endpoints responden `403 candidates_only` a una cuenta de tipo empresa, y siguen funcionando
  para un candidato. Agregar además el caso de FR-022: un skill aprobado sin banco suficiente
  aparece en la elegibilidad con `reason: 'insufficient_bank'`, nunca como iniciable.
- [ ] T038 [P] [US3] Crear `backend/tests/integration/privileged-functions.test.ts`: ninguna
  fuente bajo `backend/src` ni `backend/services` menciona `change_account_type` ni
  `set_superadmin`, es decir, ninguna ruta puede cambiar el tipo o el permiso (FR-004, FR-005).

### Implementación de la historia 3

- [ ] T039 [US3] Aplicar `requireAccountType('candidate')` a los 4 endpoints de
  `backend/src/routes/community/skill-exams.routes.ts` (FR-008).
- [ ] T040 [P] [US3] Confirmar que el registro público no puede crear otro tipo de cuenta ni un
  superadmin: revisar `backend/src/routes/community/auth.routes.ts` y dejar explícito en un
  comentario que el tipo sale del `DEFAULT` de la columna, con un caso en
  `backend/tests/integration/privileged-functions.test.ts` que cree una cuenta y verifique que
  queda `candidate` y sin permiso.

**Checkpoint**: el tipo de cuenta es confiable y los exámenes quedan solo para candidatos.

---

## Phase 6: User Story 4 — Foto obligatoria y perfil completo en todas las pantallas (P2)

**Goal**: Que ninguna cuenta con sesión use la app sin foto, que la verificación cubra ajustes,
guardados, notificaciones y crear publicación, y que completar el perfil nunca borre datos.

**Independent Test**: Con un candidato sin foto, entrar directo a `/settings`, `/saved` y
`/notifications` y terminar en `/onboarding` con los datos precargados.

### Tests de la historia 4

- [ ] T041 [P] [US4] Tests unitarios en `apps/community/tests/profile-gate.test.ts` de
  `profileGateReason`: `missing_photo`, `missing_fields`, `unresolved_skills`, `null` cuando está
  completo, una cuenta de empresa a la que solo se le exige foto, y el caso de FR-009: una cuenta
  que era empresa y ahora es candidato, sin los campos de candidato, devuelve `missing_fields`.
- [ ] T042 [P] [US4] Test de componente en `apps/community/tests/onboarding.test.tsx`: precarga
  todos los campos del usuario (no solo la foto) y no envía vacíos los que ya tenían valor.

### Implementación de la historia 4

- [ ] T043 [P] [US4] Crear `apps/community/lib/profile-gate.ts` con `profileGateReason(user,
  catalog)`: para `candidate` exige foto, los 6 campos y que todos sus skills estén aprobados;
  para `company` solo la foto.
- [ ] T044 [US4] Crear `apps/community/components/profile-gate.tsx` (`<ProfileGate>`, componente
  cliente que redirige a `/onboarding` según el motivo) y montarlo en
  `apps/community/components/shell.tsx` en lugar de la condición inline, en `AccountLayout` de
  `apps/community/components/account-pages.tsx` (cubre `/settings`, `/saved` y `/notifications`)
  y en `apps/community/app/create/page.tsx`.
- [ ] T045 [US4] Precargar todos los campos existentes en
  `apps/community/components/onboarding.tsx` (FR-026) y pedir solo lo que falta, incluidos los
  skills sin resolver de US1.
- [ ] T046 [US4] Ampliar `e2e/account-foundation.spec.ts`: un candidato sin foto abre `/settings`
  directo, acaba en `/onboarding` con sus datos precargados, sube la foto y regresa a la app.

**Checkpoint**: no queda pantalla con sesión sin verificación de perfil completo.

---

## Phase 7: User Story 5 — El scraper no usa cuentas de persona (P2)

**Goal**: Que las vacantes de una empresa nunca queden en el perfil de una persona con el mismo
nombre de usuario, sin romper las URLs `/empresas/:slug` existentes.

**Independent Test**: Crear un candidato con el nombre de usuario de una empresa, sincronizar una
vacante de esa empresa, y comprobar que quedó en una cuenta de tipo empresa distinta.

### Tests de la historia 5

- [ ] T047 [P] [US5] Tests unitarios en `backend/tests/unit/company-username.test.ts` del
  desambiguador: `slug` libre → `slug`; ocupado → `slug-empresa`; ambos ocupados →
  `slug-empresa-2`.
- [ ] T048 [P] [US5] Test de integración en
  `backend/tests/integration/companies.routes.test.ts`: `getOrCreateCompanyUser` con un candidato
  que ya ocupa el slug crea una cuenta de empresa distinta y una segunda llamada la reutiliza;
  `GET /api/community/companies/:slug` devuelve la empresa, y `404` cuando ese slug solo existe
  como candidato. Limpieza por id.

### Implementación de la historia 5

- [ ] T049 [US5] Cambiar `getOrCreateCompanyUser` en `backend/services/scraper/sync.ts`: buscar
  por `company_slug` **y** `account_type = 'company'`, elegir un `username` libre (`slug`,
  `slug-empresa`, `slug-empresa-2`, …), insertar con `account_type = 'company'` y
  `company_slug = slug`, y resolver el `23505` del índice parcial releyendo por `company_slug`.
- [ ] T050 [US5] Crear `backend/src/routes/community/companies.routes.ts` con
  `GET /:slug` (público, solo cuentas de empresa, mismo formato que el perfil) reutilizando la
  carga de perfil de `users.routes.ts`, montarlo en `backend/index.ts`, y apuntar
  `apps/community/app/(main)/empresas/[company]/page.tsx` a ese endpoint.
- [ ] T051 [P] [US5] Devolver `companySlug` en `GET /api/community/stats/companies`
  (`backend/src/routes/community/stats.routes.ts`) y usarlo en
  `apps/community/components/hero-banner.tsx`, que hoy deriva el enlace del `username`.
- [ ] T052 [P] [US5] Quitar de `backend/scripts/sync-to-community.ts` sus copias de
  `companySlug`, `formatCompanyName` y `getOrCreateCompanyUser` (líneas 19-57) e importar la
  función del servicio, para que el script manual no reintroduzca la colisión (decisión aprobada
  el 2026-09-26, ver `plan.md`).

**Checkpoint**: las cinco historias quedan funcionales.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T053 [P] Actualizar `CLAUDE.md`: el catálogo de skills ya no vive en el frontend, los
  middlewares de autorización, y que el cambio de tipo de cuenta y las decisiones sobre
  propuestas se hacen en el editor SQL de Supabase.
- [ ] T054 Correr la suite completa: `npx tsc --noEmit` en `backend` y `apps/community`, los
  unitarios de ambos, los de integración, el script de bypass y `pnpm test:e2e`. No debe quedar
  nada en rojo.
- [ ] T055 **Tarea manual del usuario**: recorrer el nivel 6 de `quickstart.md` en el navegador
  (aprobar una propuesta en SQL y verla aprobada en la app, comprobar que ese skill nuevo se
  muestra como "aún no disponible" en `/examenes` mientras no tenga banco suficiente (FR-022),
  revisar `/empresas/twilio` y el banner de empresas, y confirmar que el formulario de preguntas
  incluye el skill nuevo).
- [ ] T056 Actualizar la sección "Estado actual y cómo retomar" de
  `requirements/003-candidate-and-company-accounts.md` con el resultado de la implementación.

---

## Dependencies & Execution Order

### Entre fases

- **Setup (T001-T003)**: sin dependencias.
- **Foundational (T004-T018)**: depende del Setup. **Bloquea todas las historias.** Dentro de la
  fase, T006 → T007 → T008 → T009 son secuenciales (mismo archivo y el orden importa), y T010 (la
  aplica el usuario) bloquea todo test que toque la base de datos.
- **US1 (T019-T027)** y **US2 (T028-T035)**: ambas P1. US2 usa el `SkillsInput` de US1 para la
  acción de proponer (T033 depende de T023), así que en la práctica US1 va primero.
- **US3 (T036-T040)**, **US4 (T041-T046)** y **US5 (T047-T052)**: independientes entre sí; solo
  dependen de la fase foundational. US4 usa `useSkillCatalog` (T017) y la noción de skill sin
  resolver de US1.
- **Polish (T053-T056)**: al final.

### Dentro de cada historia

Tests primero (deben fallar antes de implementar) → backend → frontend → E2E.

### Oportunidades de paralelismo

- T001 y T002 en paralelo; T004 y T005 en paralelo.
- T011, T012, T013, T015, T017 en paralelo (archivos distintos) una vez aplicada la migración.
- Los tests de cada historia marcados [P] entre sí.
- US3, US4 y US5 pueden ir en paralelo si hay más de una persona.

---

## Parallel Example: fase foundational

```bash
# Después de T010 (migración aplicada), en paralelo:
Task: "T011 tests unitarios de los dos middlewares"
Task: "T013 requireAccountType en backend/src/middleware/require-account-type.middleware.ts"
Task: "T015 test de integración de GET /api/community/skills"
Task: "T017 useSkillCatalog en apps/community/lib/skill-catalog.ts"
```

---

## Implementation Strategy

### MVP (US1 + US2)

Las dos historias P1 del catálogo forman el mínimo con sentido: restringir al catálogo sin dar
salida para proponer dejaría atrapados a los candidatos cuyo skill no existe. Orden:
Setup → Foundational → US1 → US2 → validar.

### Entrega incremental

1. Setup + Foundational → base lista (nada visible aún para el usuario).
2. US1 → los skills ya salen del catálogo.
3. US2 → hay salida para los skills que faltan (MVP completo).
4. US3 → el tipo de cuenta es confiable y las empresas no se examinan.
5. US4 → ninguna pantalla con sesión queda sin verificación.
6. US5 → el scraper deja de poder tocar cuentas de persona.

### Notas de trabajo (reglas vigentes del proyecto)

- Un commit por tarea, en Conventional Commits y en inglés.
- Correr los tests correspondientes antes de cada commit; nunca commitear con tests en rojo.
- La suite completa antes del PR.
- Las migraciones las aplica el usuario a mano: T010 es un punto de espera real, no una tarea de
  código.
- Los tests de integración escriben en la base real: siempre limpiar por id, nunca borrados
  masivos.

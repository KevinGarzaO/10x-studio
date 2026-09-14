# Phase 0 Research: Fundación de cuentas

Datos reales usados en estas decisiones (consulta de solo lectura, 2026-09-13):

| Cuenta | `is_scraper_profile` | `scraper_source` | `roles` | Login real |
|---|---|---|---|---|
| 12 empresas (`platzi`, `twilio`, …) | `true` | `company` | `null` | no |
| `avocado-jobs-bot` (`00000000-…-0001`) | `false` | — | `null` | no |
| fila heredada sin `username` (`1fb331cc`) | `false` | — | `null` | no |
| `kgarzaortiz`, `exam-questions-e2e-admin` | `false` | — | `['admin']` | sí |
| `Panshibe` | `false` | — | `null` | sí |

Ningún `users.skills` fuera del catálogo; 0 intentos de examen; `users.username` es `UNIQUE`
(`community-hub-migration.sql:21`). Hoy ninguna fila de `roles` tiene keywords del scraper,
pero `createScraperUser` (`backend/services/scraper/sync.ts:226`) sí las escribe al crear
perfiles de persona.

## R1 — Dónde vive el tipo de cuenta (FR-001, FR-002, FR-003)

**Decision**: Columna `users.account_type TEXT NOT NULL DEFAULT 'candidate'` con
`CHECK (account_type IN ('candidate','company'))`. Backfill: `scraper_source = 'company'` y el
bot `avocado-jobs-bot` → `company`; todo lo demás → `candidate`.

**Rationale**: El `DEFAULT 'candidate'` hace que el registro público actual
(`auth.routes.ts:40`, que inserta solo `id/email/username/display_name`) cumpla FR-003 sin
tocar ese endpoint. El bot publica vacantes sin empresa identificada: no es un candidato, no
debe poder examinarse y nunca inicia sesión, así que el tipo que mejor lo describe es
`company` (publicador). Los perfiles de persona que genera el scraper
(`scraper_source = '<plataforma>:<fuente>'`) quedan como `candidate`, según el supuesto de la
spec.

**Alternatives considered**:
- Derivar el tipo de `is_scraper_profile`/`scraper_source` (rechazado — el bot demuestra que
  esa derivación ya es incorrecta hoy, y la parte 2 creará empresas reales que no vienen del
  scraper).
- Tabla separada `companies` (rechazado para esta feature — la parte 2 decidirá el modelo de
  empresa; aquí solo se necesita distinguir el tipo, y un enum en `users` no cierra esa puerta).

## R2 — Cambios de tipo y de superadmin solo desde la base de datos (FR-004, FR-005, FR-007)

**Decision**:
- Columna `users.is_superadmin BOOLEAN NOT NULL DEFAULT false`, con
  `CHECK (NOT (is_superadmin AND account_type = 'company'))`.
- Backfill: `is_superadmin = true` donde `'admin' = ANY(roles)`; después se quita `'admin'` de
  `roles`, que queda solo para keywords del scraper.
- Un trigger `BEFORE INSERT OR UPDATE` en `users` rechaza cualquier cambio de `account_type` o
  `is_superadmin` **salvo** que la transacción tenga activa la bandera local
  `avotalent.privileged_change = 'on'`. (Un `INSERT` solo se revisa si trae
  `is_superadmin = true`; el tipo por defecto de un alta normal no se bloquea.)
- La bandera solo la activan dos funciones SQL: `change_account_type(p_user_id, p_new_type,
  p_reason, p_changed_by)` y `set_superadmin(p_user_id, p_value, p_reason, p_changed_by)`.
  Ambas exigen motivo no vacío (con `btrim`), escriben el registro en `account_type_changes` /
  `superadmin_changes` y fallan si el cambio dejaría el sistema sin superadmin.
- Un trigger `BEFORE UPDATE OR DELETE` impide que desaparezca el último superadmin por
  cualquier camino (incluido borrar la fila).
- `EXECUTE` de ambas funciones se revoca a `PUBLIC`, `anon` y `authenticated`; queda para
  `postgres` (editor SQL) y `service_role`.

**Rationale**: La aclaración de la spec dice que no hay operación de aplicación y que la base
de datos garantiza las reglas. El trigger con bandera local convierte "no hay operación" de
una convención en una garantía: un `UPDATE users SET account_type = …` desde el backend (o un
`PUT /users/:username` que algún día deje pasar el campo) falla. La bandera es
`set_config(..., true)`, local a la transacción, así que no se filtra a otras sesiones.

**Tradeoff declarado**: `service_role` conserva `EXECUTE` sobre las dos funciones. Sin eso los
tests de integración no pueden verificar FR-004/FR-007 contra la base real. El riesgo es
acotado: PostgREST solo expone funciones a quien tiene la llave de servicio (nunca al
navegador), y un test verifica que ninguna ruta del backend las invoca.

**Alternatives considered**:
- Revocar también a `service_role` (rechazado — deja FR-004/FR-007 sin prueba automatizada,
  que el principio V exige).
- Solo no exponer el campo en `PUT /users` (rechazado — es exactamente la protección
  "de frontend" que el principio I prohíbe como única capa).
- RLS (rechazado — el backend usa la llave de servicio, que se salta RLS).

## R3 — `requireRole('admin')` pasa a `requireSuperadmin` (FR-005, FR-006)

**Decision**: Nuevo middleware `requireSuperadmin` que lee `users.is_superadmin`. Reemplaza a
`requireRole('admin')` en `POST /api/admin/exam-questions` (feature 001). `requireRole` se
elimina, porque ningún otro endpoint lo usa. Los fixtures de E2E que simulan un admin con
`roles: ['admin']` en `localStorage` pasan a `is_superadmin: true`.

**Rationale**: Mientras `requireRole` lea `roles`, un perfil del scraper con la keyword
`admin` podría obtener el permiso (FR-005). Las dos cuentas admin actuales conservan su acceso
por el backfill de R2 (FR-006). **Toca código de 001**; señalado en el Constitution Check.

## R4 — Modelo del catálogo: skills aprobados + propuestas separadas (FR-010 … FR-021)

**Decision**:
- `skills` sigue siendo el catálogo y contiene **solo skills aprobados**; los 37 actuales ya lo
  son.
- Propuestas en una tabla nueva `skill_proposals` con `status IN ('pending','approved',
  'merged','rejected')`, `normalized_key` único, texto propuesto, quién y cuándo, revisor y
  fecha de revisión, `resulting_skill_name` (FK a `skills`) y `rejection_reason`.
- Interesados en `skill_proposal_supporters (proposal_id, user_id)`.
- Alias en `skill_aliases (alias_key PRIMARY KEY, skill_name REFERENCES skills(name))`.

El "estado" que la spec pide para un skill (aprobado, pendiente, rechazado) se representa así:

| Estado en la spec | Dónde vive |
|---|---|
| aprobado | fila en `skills` |
| pendiente | propuesta `pending` |
| rechazado | propuesta `rejected` |
| unido a otro skill | propuesta `merged`, que apunta a un skill aprobado |

**Rationale**: Todo lo que ya referencia `skills(name)` (preguntas del banco, intentos,
niveles validados) exige que el skill **exista y sea usable**. Si pendientes y rechazados
vivieran en `skills`, cada FK tendría que acompañarse de "y además está aprobado", que un FK
no puede expresar. Con la separación, "existe en `skills`" **es** "está aprobado", y FR-012
queda protegido por la propia estructura. Además:
- Como `alias_key` es PK, un alias no puede repetirse entre skills.
- Como un alias apunta a `skills`, no puede apuntar a un skill no aprobado.

Así se cumplen dos de las garantías de FR-020 sin triggers.

**Constraints de integridad para las decisiones hechas a mano** (FR-020):
- `CHECK (status <> 'rejected' OR btrim(coalesce(rejection_reason,'')) <> '')`
- `CHECK (status IN ('approved','merged') = (resulting_skill_name IS NOT NULL))`
- `CHECK (status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))`

Para no depender de `UPDATE` sueltos, se incluyen tres funciones de conveniencia:
`approve_skill_proposal`, `merge_skill_proposal` y `reject_skill_proposal`. `approve` inserta
el skill y marca la propuesta en una sola transacción.

**Alternatives considered**:
- Columna `status` en `skills` (rechazado por lo anterior: rompería la garantía de los FK
  existentes de 001 y 002).
- Alias como arreglo en `skills` (rechazado — no se puede garantizar unicidad entre filas con
  un `UNIQUE`).

## R5 — Normalización de texto de skills compartida (FR-011, FR-013, FR-017)

**Decision**: `normalizeSkillKey(text)` vive en `packages/schemas/src/skills.ts` y hace, en
orden:
1. `trim`
2. minúsculas
3. quitar acentos (NFD)
4. eliminar todo lo que no sea `[a-z0-9+#]`

Ejemplos: `" React.js "` → `reactjs`, `"Node.js"` → `nodejs`, `"C#"` → `c#`, `"C++"` → `c++`.

`resolveSkill(text, catalog)` busca, en orden:
1. clave normalizada igual a `skills.name` (también normalizado);
2. igual a la etiqueta normalizada;
3. igual a un alias.

Si nada coincide, devuelve `null`. La usan el backend (autoridad) y el frontend (sugerencias
inmediatas). La base de datos respalda el formato con
`CHECK (normalized_key ~ '^[a-z0-9+#]+$')` en propuestas y alias.

**Rationale**: Principio II y la lección de `companySlug()` duplicado citada en la propia
constitución. `+` y `#` se conservan porque sin ellos `C`, `C++` y `C#` colapsarían en la
misma clave.

**Alias iniciales**: la migración siembra variantes obvias, por ejemplo:
- `reactjs` → `react`
- `node` → `nodejs`
- `next` → `nextjs`
- `ts` → `typescript`
- `js`, `javascript`: **no**, porque no hay skill JavaScript en el catálogo; quedan como
  propuesta natural.
- `postgres` → `postgresql`
- `k8s` → `kubernetes`
- `go` → `golang`
- `ml` → `ia`
- `net` → `dotnet`
- `gcloud` → `gcp`

## R6 — Validez de `users.skills` en la base de datos (FR-012, FR-014, FR-021)

**Decision**: `users.skills` sigue siendo `TEXT[]`, sin tabla puente. Dos triggers:
- `BEFORE INSERT OR UPDATE OF skills ON users`: si la cuenta es `candidate` y **no** es perfil
  del scraper, cada elemento debe existir en `skills.name` y no puede haber repetidos.
- `BEFORE DELETE OR UPDATE OF name ON skills`: falla si algún `users.skills` contiene ese
  nombre.

Los usos del banco, los intentos y los niveles ya están cubiertos por los FK existentes, que
por omisión son `NO ACTION`/`RESTRICT`.

FR-014 (al menos un skill aprobado) **no** va en la base de datos: una cuenta recién registrada
aún no tiene skills. Lo hacen cumplir el schema compartido en backend y frontend y la
verificación de perfil completo.

**Rationale**: Una tabla `user_skills` sería el modelo "de libro", pero obligaría a reescribir
todo lo que hoy lee `users.skills`:
- el feed "Para ti",
- la elegibilidad de exámenes,
- el perfil público,
- el filtro de niveles en `users.routes.ts`.

Eso queda fuera del alcance (principio VI). Los dos triggers dan la misma garantía para las
reglas que la spec pide.

Los perfiles de persona del scraper se excluyen porque `createScraperUser` inserta skills libres
tomados de publicaciones. Bloquearlos rompería el scraper, y esas cuentas no pueden iniciar
sesión ni examinarse.

**Alternatives considered**: tabla puente `user_skills` (rechazada por el alcance, se reevalúa
cuando la parte 7 construya la búsqueda de candidatos); solo validar en backend (rechazado por
el principio I).

## R7 — Conversión de skills existentes (FR-015)

**Decision**: La migración mapea cada elemento de `users.skills` con el mismo criterio que
R5 (nombre, etiqueta o alias, normalizados). Solo reemplaza los que coinciden, quita
duplicados y **no toca** los que no coinciden. Se ejecuta **antes** de crear el trigger de R6,
así un perfil con restos sin resolver no se vuelve imposible de leer.

Un candidato con skills sin resolver sí queda bloqueado al **guardar**: el trigger lo exige.
Por eso la verificación de perfil completo lo manda a onboarding, donde esos skills aparecen
marcados con tres acciones:
- elegir uno del catálogo,
- proponerlo,
- quitarlo.

**Rationale**: Hoy afecta a 0 perfiles, pero FR-015 aplica igual a datos futuros (por ejemplo,
restauraciones o importaciones). Hacer la conversión en SQL evita un script aparte y queda
reproducible en la propia migración.

La normalización del lado SQL es una función `normalize_skill_key(text)` hecha con
`regexp_replace(translate(lower(btrim(x)), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '[^a-z0-9+#]', '',
'g')`. Se usa `translate()` y no la extensión `unaccent` para no depender de habilitar una
extensión en Supabase. Da el mismo resultado que `normalizeSkillKey` para el alfabeto del
español, y un test de integración compara ambas sobre un conjunto de ejemplos.

## R8 — Validación del perfil del candidato (FR-012, FR-014, FR-023, FR-026, FR-027)

**Decision**: Nuevo schema compartido `buildCandidateProfileSchema(approvedSkillNames)` en
`packages/schemas/src/candidateProfile.ts`. Obligatorios, con `trim`:
- `title`
- `roleCategory` (enum)
- `seniority` (enum)
- `skills` (mínimo 1, sin repetidos, todos aprobados)
- `location`
- `workModality` (enum)

Opcionales, con `trim`: `displayName`, `bio`, `website`, `githubUrl`. Los enums
`SENIORITY`, `ROLE_CATEGORY` y `WORK_MODALITY` se mueven a `packages/schemas`. Hoy están
duplicados entre `users.routes.ts:102-106` y `apps/community/lib/profile-options.ts`.

`PUT /api/community/users/:username` valida con este schema. La foto se valida aparte, porque
llega como `photoBase64` o ya existe: el backend rechaza el guardado si la cuenta quedaría sin
`photo_url`.

En la base de datos, un trigger impide **vaciar** un dato obligatorio ya capturado de un
candidato (pasarlo de valor a `NULL` o a texto en blanco): foto, título, categoría, nivel,
ubicación, modalidad y skills.

**Rationale**: FR-027 pide que ajustes no pueda dejar vacío un obligatorio. Hoy `PUT` acepta
cualquier cosa: sin Zod, sin `trim`, sin validar skills. Un `NOT NULL` en la base de datos es
imposible porque las cuentas existen antes del onboarding; "no vaciar lo ya capturado" sí se
puede expresar, y cubre exactamente el caso de ajustes.

**Consecuencia señalada**: el `PUT` pasa de aceptar datos parciales sin validar a exigir el
perfil de candidato completo en cada guardado. Onboarding y ajustes ya envían todos los
obligatorios, así que ningún flujo actual se rompe.

## R9 — El catálogo sale de la base de datos, no de `CANONICAL_SKILLS` (FR-012, FR-022)

**Decision**: Nuevo endpoint público `GET /api/community/skills`, que devuelve los skills
aprobados (`name`, `label`) y los alias. El frontend lo carga con un hook
`useSkillCatalog()`, y `CANONICAL_SKILLS` se elimina de `lib/profile-options.ts`. Sus tres
consumidores pasan al hook:
- `SkillsInput`,
- la etiqueta de `/examenes/[skill]` (002),
- el selector de skill de `ExamQuestionForm` (001).

**Rationale**: Un skill aprobado a mano en la base de datos tiene que aparecer para los
candidatos (SC-005) y en el formulario de preguntas; si no, nunca podría tener banco
(FR-022). Con la lista fija en el frontend, ninguna de las dos cosas pasa. **Toca código de
001 y 002**; señalado.

El endpoint es público porque el catálogo no contiene datos personales, y el registro,
onboarding y el formulario lo necesitan. El principio III pide declararlo explícitamente, y
así se documenta en el contrato.

## R10 — Propuestas desde la aplicación (FR-016 … FR-019)

**Decision**: Dos endpoints, detrás de `communityAuthMiddleware` y un nuevo
`requireAccountType('candidate')`:
- `POST /api/community/skill-proposals`: recibe `{ text }` y resuelve en el backend, en orden:
  1. Si coincide con un skill o alias → `200 { outcome: 'resolved', skill }`, sin crear nada.
  2. Si coincide con una propuesta `pending` → agrega al usuario como interesado y responde
     `200 { outcome: 'joined', proposal }`.
  3. Si coincide con una propuesta `rejected` → `409 skill_rejected`, con el motivo.
  4. Si coincide con una propuesta `merged` o `approved` → `200 resolved` con el skill
     resultante.
  5. Si el usuario ya tiene 5 propuestas pendientes → `409 proposal_limit`.
  6. En cualquier otro caso → `201 { outcome: 'created', proposal }`.
- `GET /api/community/skill-proposals/mine`: las propuestas en las que el usuario es interesado,
  con estado, skill resultante y motivo.

La carrera entre dos personas que proponen el mismo texto al mismo tiempo la resuelve el
`UNIQUE (normalized_key)`: el `23505` se traduce en "joined". Es el mismo patrón que el
`23505` → 409 de 002.

El límite de 5 (FR-019) es de **backend**, porque depende de contar filas; la base de datos no
lo expresa con un `CHECK`.

**Rationale**: Proponer no requiere tocar el perfil. La propuesta es su propio recurso, y así
el onboarding no se bloquea (US2, escenario 2).

## R11 — Exámenes solo para candidatos (FR-008)

**Decision**: `requireAccountType('candidate')` se aplica a los cuatro endpoints de
`skill-exams.routes.ts` y responde `403 { error: 'candidates_only' }`. El middleware lee
`users.account_type` por `req.userId`, con el mismo patrón que `requireSuperadmin`.

**Rationale**: Hoy ninguna empresa inicia sesión, pero la parte 2 lo hará, y la regla tiene que
existir antes. Además cubre el borde de la spec: si una cuenta cambia de tipo con un examen en
curso, el intento deja de poder continuarse.

**Toca código de 002**; señalado.

## R12 — Verificación de perfil completo en todas las pantallas con sesión (FR-024 … FR-026, FR-009)

**Decision**: Función pura `profileGateReason(user, catalog)` en
`apps/community/lib/profile-gate.ts`. Devuelve `null` o el motivo:
- `missing_photo`,
- `missing_fields`,
- `unresolved_skills`.

Para `company` solo exige la foto; para `candidate`, la foto, los 6 campos y que todos los
skills estén aprobados.

Se usa desde el componente cliente `ProfileGate`, que se monta en:
- `CommunityShell`, en lugar de la condición inline de `shell.tsx:46`;
- `AccountLayout`, que cubre `/settings`, `/saved` y `/notifications`;
- `/create`.

Cuando hay que completar, redirige a `/onboarding`.

Onboarding **precarga todos los campos**. Hoy solo precarga la foto, lo que incumple FR-026.

FR-009 (empresa convertida en candidato) queda cubierto sin código extra: esa cuenta no tiene
los campos de candidato, así que el gate la manda a onboarding.

**Rationale**: `AccountLayout` es el único punto común de las pantallas que hoy quedan fuera
de `app/(main)`, y `/saved` y `/notifications` son server components. Montar ahí un componente
cliente pequeño evita convertir esas páginas.

## R13 — El scraper no usa cuentas de persona (FR-028 … FR-030)

**Decision**:
- Nueva columna `users.company_slug TEXT`, con índice único parcial
  `WHERE account_type = 'company'`. Backfill `company_slug = username` para las 12 empresas.
- `getOrCreateCompanyUser` busca por `company_slug` **y** `account_type = 'company'`, nunca por
  `username`.
- Si hay que crear la cuenta y el `username` natural ya lo usa otra cuenta, prueba
  `<slug>-empresa`, luego `<slug>-empresa-2`, y así sucesivamente.
- Como la búsqueda es por `company_slug`, las sincronizaciones posteriores reutilizan la misma
  cuenta (FR-029).
- La página `/empresas/[company]` pasa a llamar a un nuevo `GET /api/community/companies/:slug`
  (público, solo cuentas `company`), que devuelve el mismo formato que el perfil.
- `stats.routes.ts` devuelve `company_slug`, para que `hero-banner.tsx` enlace bien.

**Rationale**: Los enlaces a empresas se construyen como `/empresas/${companySlug(nombre)}` en
cuatro lugares:
- `community-hub.tsx:312`,
- `para-ti/page.tsx:118`,
- `vacantes/[slug]/page.tsx:316`,
- `hero-banner.tsx:53`.

Si una empresa recibe un `username` desambiguado y la página siguiera buscando por
`username`, esos enlaces romperían. Buscar por `company_slug` mantiene estables todas las URLs
existentes y evita tener que tocar esos enlaces.

**Fuera de alcance, señalado**: `backend/scripts/sync-to-community.ts:33` tiene una **copia** de
`getOrCreateCompanyUser` con el mismo error. Es un script manual de una sola ejecución. Se
propone que importe la función del servicio en lugar de mantener la copia; se hace solo si el
usuario lo aprueba en la fase de tareas.

## R14 — Estrategia de pruebas

**Decision**: Mismos seis niveles que 001 y 002.

1. **Base de datos**: un script de verificación
   `backend/scripts/test-account-foundation-bypass.ts` que prueba cada garantía con la llave de
   servicio:
   - bloqueo de cambio de tipo o superadmin sin función,
   - motivo obligatorio,
   - al menos un superadmin,
   - empresa sin superadmin,
   - skill inválido en perfil,
   - borrar un skill en uso,
   - vaciar un obligatorio,
   - estados inválidos de propuestas,
   - alias repetido.
2. **Unitarias**: `normalizeSkillKey`, `resolveSkill`, los schemas, `profileGateReason` y el
   desambiguador de slug.
3. **Integración**: catálogo, propuestas, `PUT` de perfil, exámenes solo para candidatos,
   `companies/:slug`, `getOrCreateCompanyUser` contra la base real con limpieza por id, y que
   ninguna ruta invoque las funciones privilegiadas.
4. **Componentes**: `SkillsInput` (alias y propuesta), precarga de onboarding y `ProfileGate`.
5. **E2E**:
   - candidato agrega un alias,
   - propone un skill y lo ve pendiente,
   - sin foto, `/settings` lo manda a onboarding.
6. **Verificación manual** en el navegador.

**Consideración operativa**: el trigger de R6 obliga a que los fixtures de integración y E2E
usen skills válidos. Los existentes ya usan `react`, `python` y `azure`.

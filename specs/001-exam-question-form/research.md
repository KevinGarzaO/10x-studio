# Phase 0 Research: Formulario de creación de pregunta para examen de skill

## R1 — Ubicación del schema compartido (`packages/schemas/`)

**Decision**: Crear `packages/schemas/` como un nuevo paquete de workspace pnpm
(`pnpm-workspace.yaml` amplía su patrón de `apps/*` + `backend` a incluir
`packages/*`), con `packages/schemas/examQuestion.ts` exportando el schema Zod
`examQuestionSchema` y el tipo inferido `ExamQuestionInput`. Tanto
`backend/src/routes/admin/exam-questions.routes.ts` como
`apps/community/components/admin/ExamQuestionForm.tsx` lo importan como
dependencia de workspace (`"@avocado/schemas": "workspace:*"` o equivalente).

**Rationale**: El repo no tiene hoy ningún paquete compartido entre frontend y
backend — cada duplicación previa de lógica (p. ej. `companySlug()` en
`apps/community/lib/company.ts` vs `backend/services/company.ts`) causó bugs
reales de divergencia. El principio II de la constitución exige explícitamente
esta ubicación; esta es la primera feature que la ejercita, así que el paquete
se crea desde cero en vez de asumir que ya existe.

**Alternatives considered**:
- Duplicar el schema Zod en ambos lados (rechazado — es exactamente el patrón
  que el principio II prohíbe y que ya causó bugs en este repo).
- Publicar el schema solo en `backend` y que el frontend valide con reglas HTML
  nativas (`maxLength`, `required`) sin Zod (rechazado — el AC2/AC3/AC4 piden
  mensajes de error específicos y deshabilitar el submit dinámicamente, que
  reglas nativas de HTML no expresan bien; además no cumpliría "mismo schema"
  del principio II).

## R2 — Verificación de rol admin en el backend

**Decision**: Crear `backend/src/middleware/require-role.middleware.ts`,
parametrizable (`requireRole('admin')`), que lee `req.user.roles` (poblado por
el middleware de auth de sesión ya existente que resuelve al usuario
autenticado) y responde `403` si `roles` no incluye el rol pedido, o `401` si
no hay usuario autenticado en absoluto. Se aplica a
`POST /api/admin/exam-questions` después del middleware de autenticación de
sesión existente.

**Rationale**: El ticket asume "ya existe el middleware de auth con roles,
solo aplicarlo" — la investigación del repo no encontró tal middleware.
Sí existe la columna `users.roles TEXT[]` (`backend/sql/scraper-migration.sql`)
y sí existe `adminAuthMiddleware`
(`backend/middleware/admin-auth.middleware.ts`), pero ese verifica un secreto
compartido de servidor a servidor (`x-admin-secret`) para los endpoints
internos del scraper — un modelo de amenaza distinto al de "¿este usuario
logueado tiene rol admin?" que pide AC6. Se documenta esta discrepancia en vez
de asumir en silencio que el middleware ya cubre el caso (principio VI:
señalar antes de tocar/asumir).

**Alternatives considered**:
- Reutilizar `adminAuthMiddleware` (secreto compartido) para este endpoint
  (rechazado — AC6 exige distinguir "no soy admin" de "no soy nadie", algo que
  un secreto de servidor no expresa; ese modelo es para llamadas
  servidor-a-servidor, no para un admin humano logueado en `apps/community`).
- Verificar el rol directamente en el handler de la ruta sin middleware
  dedicado (rechazado — el principio III exige que la auth/autorización sea
  explícita y reutilizable; un middleware separado también facilita el Nivel 6
  de pruebas de bypass).

## R3 — Test runner nuevo (no existe ninguno en el monorepo)

**Decision**: Introducir **Vitest** para los Niveles 2 (backend unitario), 3
(backend integración) y 4 (frontend componente, con `@testing-library/react`),
y **Playwright** para el Nivel 5 (E2E). El Nivel 1 (DB aislado) y el Nivel 6
(bypass directo al endpoint) se implementan como scripts `tsx` ejecutados
manualmente (mismo patrón ya usado en `backend/scripts/*.ts` para diagnósticos
uno-off), documentados en `quickstart.md`, ya que no requieren un framework de
test formal — son verificaciones puntuales contra una base de datos real.

**Rationale**: `CLAUDE.md` es explícito: "no configured test runner in any
package — do not assume npm test/vitest/jest exist". El principio V de la
constitución exige tests en el mismo PR sin excepción, así que introducir el
runner es parte del trabajo de esta feature, no una tarea que se pueda saltar.
Vitest se elige sobre Jest por configuración mínima en un monorepo TypeScript
ya usando `tsx`/`ts-node` (sin necesidad de transformadores adicionales de
Babel), y porque su API es compatible con `@testing-library/react` para el
Nivel 4.

**Alternatives considered**:
- Jest (rechazado — requiere más configuración adicional para ESM/TS en este
  repo que ya usa `tsx`; Vitest reutiliza la config de Vite/esbuild más
  directamente).
- Omitir el Nivel 5 (E2E) por no tener Playwright instalado aún (rechazado —
  el propio ticket lo exige como parte del Definition of Done; se instala como
  parte de esta feature).

## R4 — La tabla `skills` no existe; se crea como parte de esta feature

**Actualización (post-plan, confirmado por el usuario)**: se verificó
directamente contra `information_schema` en Supabase (incluyendo `ILIKE
'%skill%'`) — no existe ninguna tabla `skills`, bajo ese ni otro nombre. Una
búsqueda exhaustiva del repo confirmó además que el catálogo de skills **hoy
es puramente frontend**: `apps/community/lib/profile-options.ts:49-87` exporta
`CANONICAL_SKILLS: { value: string; label: string }[]`, un array TypeScript
hardcodeado de 36 pares `{value, label}` (`react`, `typescript`, `python`,
`aws`, `figma`, `seo`, `salesforce`, etc.). El comentario en ese archivo
(líneas 44-48) confirma que existe justamente para que el `skills TEXT[]` del
candidato (`users.skills`, sin FK) coincida con los mismos ~40 keywords que el
trigger de clasificación del scraper matchea por `ILIKE`
(`backend/sql/scraper-classification-migration.sql`) — es decir, el mismo
vocabulario vive duplicado en al menos dos lugares (el array TS y los
literales `ILIKE` del trigger SQL), sin una tabla que sea la fuente única de
verdad. El repo sí tiene un patrón normalizado equivalente para otro dominio
(`community_tags(id, name UNIQUE)` + `community_post_tags`, en
`backend/sql/community-hub-migration.sql:44-54`), que sirve de plantilla.

**Decision**: Crear una tabla `skills` real como parte de **esta** feature
(no asumirla preexistente), siguiendo el patrón de `community_tags`:

```sql
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Backfill de una sola vez con los 36 valores de `CANONICAL_SKILLS` (mismo
`value`→`name`, `label`→`label`), vía `INSERT ... ON CONFLICT (name) DO
NOTHING` para que la migración sea re-ejecutable. `exam_questions.skill_name`
pasa a ser `REFERENCES skills(name)` contra esta tabla nueva.

**Rationale**: Al usuario se le presentaron 3 opciones (crear tabla real
siguiendo el patrón `community_tags`; usar `CANONICAL_SKILLS` como enum sin
tabla, sacrificando la capa DB del principio I; o pausar la decisión) y eligió
explícitamente crear la tabla — es la única opción que cumple el principio I
(Three-Layer Validation) sin excepciones para el campo `skill_name`, y evita
que esta feature introduzca una tercera copia del mismo vocabulario de
skills. La migración de esta tabla vive en el mismo archivo SQL de esta
feature (`exam-questions-migration.sql`), no en un archivo separado, porque
existe únicamente para dar soporte al FK de `exam_questions` — no reemplaza ni
migra `users.skills`/`scraper_posts.skills` (esos siguen siendo `TEXT[]`/
`JSONB` libres, fuera de alcance; ver Assumptions en `spec.md`).

**Alternatives considered**:
- Enum Zod sin tabla de DB (rechazado por decisión explícita del usuario —
  perdería la capa DB del principio I para este campo).
- Reescribir `users.skills`/el trigger del scraper para usar la tabla nueva
  como fuente única (rechazado — es scope creep no pedido; el ticket dice
  explícitamente "No tocar: catálogo de skills existente [...] ni el flujo de
  examen del usuario final ya en producción", y el principio VI de la
  constitución exige señalar y no tocar lógica fuera del alcance de la
  tarea). Queda documentado aquí como una inconsistencia latente
  (vocabulario de skills duplicado en 3 lugares tras esta feature) para una
  futura feature de consolidación, no para esta.

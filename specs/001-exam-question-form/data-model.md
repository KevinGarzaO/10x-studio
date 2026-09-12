# Phase 1 Data Model: Formulario de creación de pregunta para examen de skill

## Entities

### `exam_questions` (NUEVA tabla)

| Column | Type | Rule | Layer |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` | DB |
| `question` | `varchar(500)` | `NOT NULL` | DB |
| `skill_name` | `varchar(50)` | `NOT NULL`, `REFERENCES skills(name)` | DB |
| `correct_answer_index` | `smallint` | `NOT NULL`, `CHECK (correct_answer_index >= 0)` + trigger diferido que cierra el límite superior (ver nota abajo) | DB (completo) + Backend + Frontend |
| `difficulty_level` | `varchar(12)` | `NOT NULL`, `CHECK (difficulty_level IN ('basico','intermedio','avanzado'))` | DB |
| `created_by` | `uuid` | `NOT NULL`, `REFERENCES users(id)` — admin que la creó | DB |
| `created_at` | `timestamptz` | `DEFAULT now()` | DB |

**Nota sobre `correct_answer_index`**: un `CHECK` de Postgres no puede
referenciar el conteo de filas de otra tabla (`question_options`) — la sintaxis
`CHECK` de una sola tabla no basta. En vez de dejar el límite superior
(`index < options.length`) solo en Zod (lo que habría diluido el principio I,
señalado como CRITICAL en `/speckit-analyze`), se cierra completamente a nivel
DB con un **`CONSTRAINT TRIGGER` diferido** — el mismo patrón de trigger que ya
usa este repo en `classify_scraper_post()`
(`backend/sql/scraper-classification-migration.sql`):

```sql
CREATE OR REPLACE FUNCTION validate_correct_answer_index()
RETURNS TRIGGER AS $$
DECLARE
  option_count INT;
BEGIN
  SELECT count(*) INTO option_count
  FROM question_options
  WHERE exam_question_id = NEW.id;

  IF NEW.correct_answer_index >= option_count THEN
    RAISE EXCEPTION
      'correct_answer_index (%) must be less than the number of options (%) for exam_question %',
      NEW.correct_answer_index, option_count, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_correct_answer_index_trigger ON exam_questions;
CREATE CONSTRAINT TRIGGER validate_correct_answer_index_trigger
AFTER INSERT ON exam_questions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_correct_answer_index();
```

`DEFERRABLE INITIALLY DEFERRED` es la pieza clave: el trigger no se evalúa en
el momento del `INSERT` de `exam_questions` (cuando `question_options` todavía
no tiene filas para esa pregunta — la pregunta se inserta antes que sus
opciones, en la misma transacción), sino al final de la transacción
(`COMMIT`), momento en el que las opciones ya existen y `option_count` refleja
el estado final. Si `correct_answer_index` queda fuera de rango, la
transacción completa se revierte (ni la pregunta ni sus opciones quedan
guardadas) — esto es ahora la última línea de defensa real incluso si algo
llega a la DB sin pasar por Zod. Con esto, el principio I queda satisfecho sin
excepciones para este campo: DB (CHECK ≥0 + trigger diferido <n_options) +
Backend (Zod `.refine()`) + Frontend (radio buttons, no permite un índice
fuera de rango por construcción de la UI).

**Nota de atomicidad**: `supabase-js` no tiene una API de transacciones
multi-statement — dos `INSERT` REST separados (pregunta, luego opciones)
serían dos transacciones distintas, y el trigger diferido validaría al final
de la *primera* (antes de que exista ninguna opción), fallando siempre. Por
eso la inserción real vive en una función `insert_exam_question_with_options()`
(PL/pgSQL, definida en la misma migración) que inserta la pregunta y sus
opciones dentro de una sola llamada — una sola transacción — invocada desde
el backend vía `supabase.rpc(...)`. El handler de la ruta (`POST
/api/admin/exam-questions`) no hace `INSERT` directo a ninguna de las dos
tablas.

**Validación por capa** (tal como especifica el ticket):
- DB: `NOT NULL`, `CHECK` de rango completo para `correct_answer_index` (`>=0` + trigger diferido `<n_options`) y de enum para `difficulty_level`, FK a `skills`.
- Backend (Zod, `packages/schemas/examQuestion.ts`): `z.string().trim().min(10).max(500)` para `question`; `z.enum(['basico','intermedio','avanzado'])` para `difficulty_level`; `z.number().int().min(0)` + `.refine()` cruzado contra `options.length` para `correct_answer_index`.
- Frontend: textarea con `maxLength=500`, trim en blur, primera letra mayúscula, select cerrado de dificultad sin opción "otro".

### `question_options` (NUEVA tabla)

| Column | Type | Rule | Layer |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` | DB |
| `exam_question_id` | `uuid` | `NOT NULL`, `REFERENCES exam_questions(id) ON DELETE CASCADE` | DB |
| `text` | `varchar(200)` | `NOT NULL` | DB |
| `order_index` | `smallint` | `NOT NULL` — posición de la opción (0-based), usada para que `correct_answer_index` de la pregunta apunte a una fila concreta | DB |

**Relación**: una `exam_questions` tiene entre 2 y 6 `question_options`
(`ON DELETE CASCADE` desde la pregunta). Esta cardinalidad (2-6) no se expresa
como `CHECK` de DB (requeriría un trigger de conteo; fuera de alcance dado que
Backend ya la garantiza de forma transaccional al insertar pregunta + opciones
juntas) — se aplica en Backend (`z.array(...).min(2).max(6)`) y Frontend
(inputs dinámicos con límite de agregar/quitar).

**Validación por capa**:
- DB: `NOT NULL`, `varchar(200)`, FK con cascada.
- Backend (Zod): `z.array(z.string().trim().min(1).max(200)).min(2).max(6).refine(opts => new Set(opts.map(o => o.toLowerCase())).size === opts.length, 'Las opciones no pueden repetirse')`.
- Frontend: inputs dinámicos (agregar/quitar), `maxLength=200` cada uno, trim en blur, bloquea agregar una opción vacía o duplicada antes de submit.

### `skills` (NUEVA tabla — creada por esta feature, ver `research.md` R4)

No existía ninguna tabla `skills` en Supabase (confirmado vía
`information_schema`, incluyendo `ILIKE '%skill%'`) ni en el repo. El catálogo
vivía solo como el array TypeScript `CANONICAL_SKILLS` en
`apps/community/lib/profile-options.ts:49-87`. Esta feature crea la tabla,
siguiendo el mismo patrón que `community_tags`:

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` |
| `name` | `text` | `UNIQUE NOT NULL` — mismo valor que `CANONICAL_SKILLS[].value` (ej. `'react'`, `'typescript'`) |
| `label` | `text` | `NOT NULL` — mismo valor que `CANONICAL_SKILLS[].label` (ej. `'React'`) |
| `created_at` | `timestamptz` | `DEFAULT now()` |

Backfill de una sola vez con los 36 pares de `CANONICAL_SKILLS`, vía
`INSERT ... ON CONFLICT (name) DO NOTHING` en la misma migración
(`exam-questions-migration.sql`). `exam_questions.skill_name` referencia
`skills(name)`.

**Fuera de alcance explícito** (no tocar en esta feature): `users.skills`
(`TEXT[]`), `scraper_posts.skills`/`community_posts.skills` (`JSONB`), y el
trigger `ILIKE` del scraper siguen exactamente como están — ninguno pasa a
usar esta tabla nueva como fuente. El vocabulario queda duplicado en 3 lugares
tras esta feature (`CANONICAL_SKILLS`, los literales `ILIKE` del trigger, y
ahora `skills`); consolidar eso es trabajo de una feature futura, no de esta
(principio VI de la constitución).

## State Transitions

Ninguna — `exam_questions` y `question_options` son de solo alta en esta
feature (sin edición ni eliminación, según Assumptions de `spec.md`). No hay
máquina de estados.

## Validation Summary (cross-reference to Acceptance Criteria)

| AC | Regla | Capa que la aplica primero | Capa que la re-valida |
|---|---|---|---|
| AC1 | `question` no vacío | Frontend (submit bloqueado, mensaje inline) | Backend (`min(10)` es más estricto que "no vacío" — ver nota) |
| AC2 | `options.length >= 2` | Frontend (botón deshabilitado) | Backend (`.min(2)`) |
| AC3 | alguna opción marcada correcta | Frontend (submit bloqueado) | Backend (`correct_answer_index` requerido, sin default) |
| AC4 | sin opciones duplicadas (case-insensitive) | Frontend (bloquea antes de submit) | Backend (`.refine()`) |
| AC5 | guardado + confirmación + limpieza | Backend (INSERT transaccional) | — |
| AC6 | solo admin | Frontend (oculta/redirige la página) | Backend (`require-role.middleware.ts`, ver research.md R2) — **autoridad final**, el frontend nunca es la única barrera |
| US2-S5 | `question` con texto pero `< 10` caracteres (spec.md, User Story 2, Acceptance Scenario 5 — no forma parte de la numeración AC1-AC6 del ticket original) | Backend (`min(10)` en `examQuestionSchema`) | Frontend (mismo schema compartido antes de enviar) |

**Nota AC1 vs. Backend `min(10)`**: el ticket especifica `min(10)` en el
schema Zod de `question` (bloque "Validaciones — por campo"), más estricto que
el mensaje de AC1 ("La pregunta es obligatoria", que solo cubre el caso vacío).
El Frontend muestra el mensaje de AC1 para el caso vacío específicamente;
si el backend rechaza por longitud insuficiente (texto no vacío pero < 10
caracteres), el error 400 devuelve el campo `question` y el frontend lo
mapea al mismo input con el mensaje que el backend indique — no se inventa un
segundo mensaje de frontend para ese caso, se usa el flujo de manejo de
errores 400 ya definido en el ticket.

# Phase 1 Data Model: Validación de nivel por skill mediante examen

Tres tablas nuevas. El banco existente (`exam_questions`, `question_options`, `skills`,
creado por la feature 001) se **lee sin modificarse**.

## Entities

### `skill_exam_attempts` (NUEVA tabla)

Un intento de examen: quién, de qué skill, cuándo, y cómo terminó.

| Column | Type | Rule | Layer |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` | DB |
| `user_id` | `uuid` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE` | DB |
| `skill_name` | `varchar(50)` | `NOT NULL`, `REFERENCES skills(name)` | DB |
| `status` | `varchar(12)` | `NOT NULL DEFAULT 'in_progress'`, `CHECK (status IN ('in_progress','completed'))` — **no existe el valor `expired`**, ver nota | DB |
| `started_at` | `timestamptz` | `NOT NULL DEFAULT now()` | DB |
| `expires_at` | `timestamptz` | `NOT NULL` — `started_at + 24h`, fijado al insertar | DB + Backend |
| `finished_at` | `timestamptz` | `NULL` hasta que se completa | DB |
| `correct_count` | `smallint` | `NULL` hasta completarse; `CHECK (correct_count >= 0)` | DB |
| `question_count` | `smallint` | `NOT NULL`, `CHECK (question_count > 0)` — cuántas preguntas se presentaron (10 hoy; se guarda por intento para que un cambio futuro no altere resultados viejos) | DB |
| `level` | `varchar(12)` | `NULL` hasta completarse; `CHECK (level IN ('basico','intermedio','avanzado'))` | DB + Backend |
| `created_at` | `timestamptz` | `DEFAULT now()` | DB |

**Índice único parcial (FR-017)**:
`CREATE UNIQUE INDEX ... ON skill_exam_attempts (user_id) WHERE status = 'in_progress'` —
un candidato no puede tener dos exámenes abiertos a la vez, ni siquiera con dos peticiones
simultáneas (ver `research.md` R7).

**Nota sobre el estado "expirado"**: es un estado **derivado, no almacenado** —
`status = 'in_progress' AND expires_at < now()`. Deliberadamente no hay un valor `'expired'`
en el `CHECK`: si existiera, habría que escribirlo desde algún lado (un cron o un camino de
lectura) y aparecería la ventana "ya venció pero nadie lo ha marcado". Ver `research.md` R2.

**Cuándo puede reintentar (FR-011)**: también derivado, no almacenado —
30 días después de `finished_at` (si se completó) o de `expires_at` (si expiró).

### `skill_exam_attempt_questions` (NUEVA tabla)

Las preguntas congeladas de un intento y lo que el candidato respondió. Es el registro
auditable que exige FR-012.

| Column | Type | Rule | Layer |
|---|---|---|---|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` | DB |
| `attempt_id` | `uuid` | `NOT NULL`, `REFERENCES skill_exam_attempts(id) ON DELETE CASCADE` | DB |
| `exam_question_id` | `uuid` | `NOT NULL`, `REFERENCES exam_questions(id) ON DELETE RESTRICT` — una pregunta ya presentada no se puede borrar (ver `research.md` R5) | DB |
| `position` | `smallint` | `NOT NULL`, `CHECK (position >= 0)` — orden dentro del examen, 0-based | DB |
| `selected_option_index` | `smallint` | `NULL` hasta responderse; `CHECK (selected_option_index >= 0)` | DB + Backend + Frontend |
| `is_correct` | `boolean` | `NULL` hasta responderse — calculado **solo** en el backend | Backend |
| `answered_at` | `timestamptz` | `NULL` hasta responderse | DB |

**Constraints de unicidad**: `UNIQUE (attempt_id, position)` y
`UNIQUE (attempt_id, exam_question_id)` — ni dos preguntas en la misma posición, ni la
misma pregunta dos veces en un intento.

**Validación por capa de `selected_option_index`** (el único dato que el candidato envía y
que se persiste):
- **DB**: `CHECK (selected_option_index >= 0)`. El límite superior real ("debe ser una de
  las opciones *de esa pregunta*") depende de cuántas filas tenga `question_options` para
  esa pregunta, así que no se puede expresar en un `CHECK` de una sola tabla.
- **Backend**: Zod acota `z.number().int().min(0).max(5)` (máximo 6 opciones por pregunta,
  regla heredada de 001) y, además, el handler verifica contra las opciones reales de esa
  pregunta antes de guardar. Esta verificación cruzada es la autoridad.
- **Frontend**: el candidato elige entre las opciones renderizadas, así que por construcción
  de la UI no puede enviar un índice inexistente; el mismo schema de `@avocado/schemas`
  valida el payload antes de enviarlo.

**Nota sobre `is_correct`**: no tiene capa de frontend a propósito. Es la única columna que
el dispositivo del candidato nunca debe poder influir ni leer antes de terminar el examen
(FR-005, FR-007).

### `user_skill_levels` (NUEVA tabla)

El mejor nivel alcanzado por candidato y skill. Es lo que lee el perfil público.

| Column | Type | Rule | Layer |
|---|---|---|---|
| `user_id` | `uuid` | `NOT NULL`, `REFERENCES users(id) ON DELETE CASCADE`, parte de la PK | DB |
| `skill_name` | `varchar(50)` | `NOT NULL`, `REFERENCES skills(name)`, parte de la PK | DB |
| `level` | `varchar(12)` | `NOT NULL`, `CHECK (level IN ('basico','intermedio','avanzado'))` | DB + Backend |
| `achieved_at` | `timestamptz` | `NOT NULL` — cuándo alcanzó **por primera vez** este nivel | DB |
| `source_attempt_id` | `uuid` | `NOT NULL`, `REFERENCES skill_exam_attempts(id)` — qué intento lo produjo | DB |
| `updated_at` | `timestamptz` | `DEFAULT now()` | DB |

**Clave primaria**: `(user_id, skill_name)` — un solo nivel vigente por skill.

**Regla de actualización (FR-021)**: al completarse un intento, esta fila se crea o se
**sube** solo si el nivel obtenido es mayor que el guardado, según el orden
`basico < intermedio < avanzado`. Un reintento peor no la toca — ni el nivel ni
`achieved_at`.

### Tablas existentes que se leen sin modificar

- **`exam_questions` / `question_options`**: el banco creado por 001. De aquí salen las 10
  preguntas de cada examen. `correct_answer_index` se lee **solo** dentro del backend al
  calificar y nunca se incluye en una respuesta HTTP (FR-005).
- **`skills`**: el catálogo (37 filas). Da el target del FK `skill_name`.
- **`users.skills`** (`TEXT[]`): los skills auto-declarados del candidato. Determina de qué
  se puede examinar (FR-002). Esta feature **no lo modifica** — validar un skill no lo
  agrega ni lo quita del perfil.

## State Transitions

Un intento tiene exactamente estas transiciones:

```
                     (POST /skill-exams)
                              │
                              ▼
                       ┌─────────────┐
                       │ in_progress │ ◄── se responde una pregunta (no es transición:
                       └─────────────┘      el intento sigue in_progress)
                          │        │
   se responde la última  │        │  pasan 24h sin terminar
   pregunta               │        │  (derivado, sin escritura)
                          ▼        ▼
                   ┌───────────┐  ┌──────────────────────┐
                   │ completed │  │ in_progress vencido  │
                   │ + level   │  │ (= "expirado")       │
                   └───────────┘  └──────────────────────┘
                          │                  │
                          └──────┬───────────┘
                                 ▼
                     periodo de espera de 30 días,
                     luego se puede iniciar otro intento
```

`completed` es terminal: un intento completado no se reabre, no se reenvía y no se
recalcula (FR-015, FR-016).

## Validation Summary (cross-reference to requirements)

| Regla | DB | Backend | Frontend |
|---|---|---|---|
| Solo skills declarados en el perfil (FR-002) | FK a `skills` (existe el skill) | Verifica contra `users.skills` del propio `req.userId` — **autoridad** | Solo lista los skills del perfil |
| Banco suficiente, mín. 20 preguntas (FR-003) | — | Cuenta el banco antes de iniciar — **autoridad** | Muestra "aún no disponible" |
| Un examen en curso a la vez (FR-017) | Índice único parcial — **autoridad** | Verifica antes de insertar (mensaje claro) | No ofrece iniciar otro |
| Un intento por skill / espera de 30 días (FR-011) | — | Derivado del último intento — **autoridad** | Muestra la fecha de reintento |
| No cambiar una respuesta ya enviada (FR-006) | — | Rechaza si `answered_at` no es nulo — **autoridad** | No permite volver atrás |
| Respuesta correcta nunca sale al cliente (FR-005) | — | `select()` explícito sin `correct_answer_index` — **autoridad** | No la recibe, no la puede mostrar |
| Nivel = mejor histórico (FR-021) | `CHECK` del enum de nivel | Compara contra el nivel guardado antes de subirlo — **autoridad** | Solo muestra |
| Examen expira a las 24h (FR-019) | `expires_at NOT NULL` | Derivado en cada lectura — **autoridad** | Muestra cuánto queda |

Patrón consistente con el principio I: la DB sostiene lo que puede expresar como constraint
(existencia, enums, unicidad, rangos simples), el backend es la autoridad de toda regla que
dependa de estado cruzado, y el frontend usa el mismo schema compartido para no dejar que el
usuario envíe algo que ya sabemos inválido.

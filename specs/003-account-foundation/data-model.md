# Phase 1 Data Model: Fundación de cuentas

Una migración, `backend/sql/account-foundation-migration.sql`, que el usuario aplica a mano en
el editor SQL de Supabase. Es idempotente (`IF NOT EXISTS`, `CREATE OR REPLACE`, backfills
re-ejecutables), igual que las migraciones de 001 y 002.

**Orden obligatorio dentro de la migración** (ver `research.md` R2 y R7):
1. Columnas nuevas en `users` y backfill de `account_type`, `is_superadmin` y `company_slug`.
2. Tablas de catálogo (`skill_aliases`, `skill_proposals`, `skill_proposal_supporters`) y
   siembra de alias.
3. Conversión de `users.skills` existentes.
4. **Recién entonces** los triggers de protección.

Si los triggers se crearan antes, bloquearían los propios backfills.

## Cambios en tablas existentes

### `users` (MODIFICADA)

| Columna | Tipo | Regla | Capa |
|---|---|---|---|
| `account_type` | `text` | **NUEVA**. `NOT NULL DEFAULT 'candidate'`, `CHECK (account_type IN ('candidate','company'))` | DB |
| `is_superadmin` | `boolean` | **NUEVA**. `NOT NULL DEFAULT false`, `CHECK (NOT (is_superadmin AND account_type = 'company'))` | DB + Backend |
| `company_slug` | `text` | **NUEVA**. `NULL` para candidatos; índice único parcial `ON users (company_slug) WHERE account_type = 'company'`; `CHECK (company_slug IS NULL OR company_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` | DB + Backend |
| `roles` | `text[]` | Existente. Deja de contener `'admin'`; queda solo para keywords del scraper | — |
| `skills` | `text[]` | Existente. Trigger `validate_candidate_skills` (ver abajo) | DB + Backend + Frontend |
| `photo_url`, `title`, `role_category`, `seniority`, `location`, `work_modality` | existentes | Trigger `prevent_clearing_required_profile_fields` (ver abajo) | DB + Backend + Frontend |

**Backfills**:

| Qué | Condición | Resultado |
|---|---|---|
| `account_type` | `scraper_source = 'company'` o `id = '00000000-0000-0000-0000-000000000001'` (bot) | `'company'` |
| `account_type` | resto | `'candidate'` (por defecto) |
| `is_superadmin` | `'admin' = ANY(roles)` | `true`, y `roles = array_remove(roles, 'admin')` |
| `company_slug` | `account_type = 'company'` y `username` válido como slug | `username` |
| `company_slug` | bot | `avocado-jobs-bot` |

**Triggers en `users`**:

1. **`guard_privileged_user_columns`** (`BEFORE INSERT OR UPDATE`). Aplica solo cuando
   `current_setting('avotalent.privileged_change', true)` no es `'on'`:
   - En `UPDATE`, lanza error si cambia `account_type` o `is_superadmin`.
   - En `INSERT`, lanza error solo si la fila trae `is_superadmin = true`. El `account_type` se
     elige libremente al crear, porque el registro crea `candidate` por defecto y el scraper
     crea `company`. Lo que no se puede es **cambiarlo** después.
2. **`guard_last_superadmin`** (`BEFORE UPDATE OR DELETE`): lanza error si la operación dejaría
   `count(*) WHERE is_superadmin = 0`.
3. **`validate_candidate_skills`** (`BEFORE INSERT OR UPDATE OF skills`): si
   `NEW.account_type = 'candidate' AND NOT coalesce(NEW.is_scraper_profile, false)`, entonces
   cada elemento de `NEW.skills` debe existir en `skills.name` y no puede haber repetidos.
   Mensaje: `skill_not_in_catalog: <nombre>`.
4. **`prevent_clearing_required_profile_fields`** (`BEFORE UPDATE`): para
   `account_type = 'candidate'`, si `OLD.<campo>` tenía valor y `NEW.<campo>` es `NULL` o texto
   en blanco (o `skills` vacío), lanza error `required_field_cleared: <campo>`. Solo mira los 7
   campos de la tabla de arriba. Los guardados con valores válidos pasan.

## Tablas nuevas

### `account_type_changes` (NUEVA)

Registro inmutable de cada cambio de tipo (FR-004).

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` | PK, `DEFAULT gen_random_uuid()` |
| `user_id` | `uuid` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` |
| `from_type` | `text` | `NOT NULL`, `CHECK IN ('candidate','company')` |
| `to_type` | `text` | `NOT NULL`, `CHECK IN ('candidate','company')`, `CHECK (from_type <> to_type)` |
| `reason` | `text` | `NOT NULL`, `CHECK (btrim(reason) <> '' AND reason = btrim(reason))` |
| `changed_by` | `uuid` | `NOT NULL REFERENCES users(id)`; debe ser superadmin (lo verifica la función) |
| `changed_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

### `superadmin_changes` (NUEVA)

Misma forma para las altas y bajas del permiso: `user_id`, `granted boolean`, `reason`,
`changed_by`, `changed_at`, con las mismas reglas de motivo.

### `skill_aliases` (NUEVA)

| Columna | Tipo | Regla |
|---|---|---|
| `alias_key` | `text` | **PK** (un alias pertenece a un solo skill); `CHECK (alias_key ~ '^[a-z0-9+#]+$')` |
| `skill_name` | `text` | `NOT NULL REFERENCES skills(name) ON UPDATE CASCADE ON DELETE RESTRICT` |
| `created_at` | `timestamptz` | `DEFAULT now()` |

Como `skills` solo contiene aprobados (`research.md` R4), un alias nunca apunta a un skill no
aprobado.

### `skill_proposals` (NUEVA)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | `uuid` | PK |
| `normalized_key` | `text` | `NOT NULL UNIQUE`, `CHECK (normalized_key ~ '^[a-z0-9+#]+$')` |
| `proposed_text` | `text` | `NOT NULL`, `CHECK (btrim(proposed_text) <> '' AND proposed_text = btrim(proposed_text) AND char_length(proposed_text) <= 50)`. Lo que escribió la primera persona; la etiqueta sugerida |
| `status` | `text` | `NOT NULL DEFAULT 'pending'`, `CHECK IN ('pending','approved','merged','rejected')` |
| `proposed_by` | `uuid` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` |
| `proposed_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `resulting_skill_name` | `text` | `REFERENCES skills(name) ON UPDATE CASCADE ON DELETE RESTRICT` |
| `rejection_reason` | `text` | `CHECK (rejection_reason IS NULL OR (btrim(rejection_reason) <> '' AND rejection_reason = btrim(rejection_reason)))` |
| `reviewed_by` | `uuid` | `REFERENCES users(id)` |
| `reviewed_at` | `timestamptz` | |

**Constraints de estado** (para que una edición a mano no deje estados inválidos, FR-020):
- `CHECK ((status IN ('approved','merged')) = (resulting_skill_name IS NOT NULL))`
- `CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL))`
- `CHECK ((status = 'pending') = (reviewed_by IS NULL AND reviewed_at IS NULL))`

Índice: `(status)`, para la vista de pendientes.

### `skill_proposal_supporters` (NUEVA)

| Columna | Tipo | Regla |
|---|---|---|
| `proposal_id` | `uuid` | `REFERENCES skill_proposals(id) ON DELETE CASCADE` |
| `user_id` | `uuid` | `REFERENCES users(id) ON DELETE CASCADE` |
| `joined_at` | `timestamptz` | `NOT NULL DEFAULT now()` |

PK compuesta `(proposal_id, user_id)`. Quien propone también se inserta como interesado, así
"mis propuestas" es una sola consulta y el conteo de interesados incluye al autor.

## Funciones y vistas para el superadmin (editor SQL)

Todas con `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` (ver R2 para el tradeoff con
`service_role`). Cada una valida sus argumentos, hace `btrim` de los textos y corre en una sola
transacción.

| Función | Qué hace |
|---|---|
| `change_account_type(p_user_id, p_new_type, p_reason, p_changed_by)` | Verifica que `p_changed_by` es superadmin y el motivo no está vacío; rechaza si la cuenta es superadmin y el destino es `company`; activa la bandera, actualiza y registra en `account_type_changes`. Al pasar a `company` asigna `company_slug`; al pasar a `candidate` lo pone en `NULL`. |
| `set_superadmin(p_user_id, p_value, p_reason, p_changed_by)` | Igual, sobre `is_superadmin`; registra en `superadmin_changes`. |
| `approve_skill_proposal(p_proposal_id, p_name, p_label, p_reviewed_by)` | Inserta en `skills` y marca la propuesta `approved`. `p_name` por omisión es `normalized_key`. |
| `merge_skill_proposal(p_proposal_id, p_skill_name, p_reviewed_by)` | Inserta `skill_aliases(normalized_key → p_skill_name)` y marca la propuesta `merged`. |
| `reject_skill_proposal(p_proposal_id, p_reason, p_reviewed_by)` | Marca `rejected` con motivo. |
| `normalize_skill_key(text)` | Equivalente SQL de `normalizeSkillKey` (R7). `IMMUTABLE`. |

**Vista `pending_skill_proposals`**: propuestas `pending` con `supporter_count` y
`proposed_at`, ordenadas por interés (FR-020, "el número de interesados MUST poder
consultarse").

## Estado de una propuesta

```
            (POST /skill-proposals, texto nuevo)
                          │
                          ▼
                    ┌──────────┐   otra persona propone lo mismo
                    │ pending  │ ◄── (se suma como interesado, no cambia de estado)
                    └──────────┘
          ┌──────────────┼───────────────┐
 approve_skill_   merge_skill_     reject_skill_
 proposal         proposal         proposal
          ▼              ▼               ▼
   ┌──────────┐   ┌──────────┐    ┌──────────┐
   │ approved │   │  merged  │    │ rejected │
   │ + skill  │   │ + alias  │    │ + motivo │
   └──────────┘   └──────────┘    └──────────┘
```

Los tres estados finales son terminales para la aplicación. Proponer de nuevo el mismo texto
devuelve el resultado (`resolved` o `skill_rejected`) y no crea otra propuesta.

## Resumen de validación (referencia cruzada con la spec)

| Regla | DB | Backend | Frontend |
|---|---|---|---|
| Tipo de cuenta válido (FR-001) | `CHECK` + `NOT NULL DEFAULT` — **autoridad** | No lo acepta en ningún body | No lo envía |
| Tipo/superadmin solo desde la DB (FR-004, FR-005) | Trigger con bandera + funciones con `EXECUTE` revocado — **autoridad** | Test: ninguna ruta invoca las funciones | — |
| Motivo obligatorio en cambios (FR-004, FR-023) | `CHECK btrim` en los registros — **autoridad** | — | — |
| Al menos un superadmin; empresa sin superadmin (FR-007) | Trigger + `CHECK` — **autoridad** | — | — |
| Exámenes solo para candidatos (FR-008) | — | `requireAccountType('candidate')` — **autoridad** | Sin cambios (las empresas no llegan) |
| Perfil solo con skills aprobados (FR-012) | Trigger `validate_candidate_skills` | Schema compartido con la lista de la DB — **autoridad** | Mismo schema + solo ofrece el catálogo |
| Alias → skill del catálogo (FR-013) | PK de alias + FK | `resolveSkill` compartido — **autoridad** | `resolveSkill` compartido |
| Al menos un skill (FR-014) | — (cuentas nuevas no tienen skills) | Schema `min(1)` — **autoridad** | Mismo schema |
| Propuesta sin duplicados (FR-017) | `UNIQUE (normalized_key)` — **autoridad** | Traduce `23505` a "joined" | — |
| Máximo 5 pendientes (FR-019) | — (depende de contar filas) | Cuenta antes de crear — **autoridad** | Muestra el límite |
| Decisiones válidas del superadmin (FR-020) | `CHECK` de estado + FK — **autoridad** | — | — |
| No borrar skill en uso (FR-021) | Trigger en `skills` + FK existentes — **autoridad** | — | — |
| Foto y obligatorios no se vacían (FR-024, FR-027) | Trigger `prevent_clearing_required_profile_fields` | Rechaza el guardado sin foto/obligatorios — **autoridad** | Mismo schema; error en el formulario |
| Scraper no usa cuentas de persona (FR-028, FR-029) | Índice único parcial en `company_slug` | Busca por `company_slug` + `account_type` — **autoridad** | — |
| Texto libre sin espacios sobrantes (FR-023) | `CHECK (x = btrim(x))` | `trim` en el schema | Mismo schema |

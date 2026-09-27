# Quickstart: Fundación de cuentas

Guía para validar la feature. El detalle de cada regla está en `data-model.md` y en
`contracts/`; aquí no se repite.

## Prerequisites

- `pnpm install` en la raíz. El `postinstall` compila `@avocado/schemas`, que ahora incluye
  `skills.ts` y `candidateProfile.ts`.
- Aplicar `backend/sql/account-foundation-migration.sql` a mano en el editor SQL de Supabase.
  Después, confirmar el backfill:
  ```sql
  SELECT account_type, is_superadmin, count(*) FROM users GROUP BY 1, 2;
  -- esperado: company/false = 13 (12 empresas + bot), candidate/true = 2, candidate/false = 2
  SELECT username FROM users WHERE 'admin' = ANY(roles);  -- esperado: 0 filas
  SELECT count(*) FROM skill_aliases;                     -- > 0 (alias sembrados)
  ```
- Backend en `pnpm dev:backend` (3001). ⚠️ Dispara los crons reales (`CLAUDE.md`).
- Community en `pnpm dev:community` (3002).
- Una cuenta de candidato de prueba con sesión y otra de superadmin (la de E2E de 001 ya lo es
  tras el backfill).

## Nivel 1 — DB (aislado, editor SQL)

1. `UPDATE users SET account_type = 'company' WHERE username = '<candidato>'` → **error**. Solo
   se puede con `change_account_type` (FR-004).
2. `SELECT change_account_type('<id>', 'company', '   ', '<superadmin>')` → **error**: falta el
   motivo.
3. Con un motivo válido → funciona, y queda una fila en `account_type_changes`. Revertir con la
   misma función.
4. `set_superadmin` para quitar el permiso a todos los superadmins, uno por uno → el último
   **falla** (FR-007).
5. `UPDATE users SET skills = ARRAY['rust'] WHERE id = '<candidato>'` → **error**
   `skill_not_in_catalog` (FR-012).
6. `UPDATE users SET photo_url = NULL WHERE id = '<candidato con foto>'` → **error**
   `required_field_cleared` (FR-027).
7. `DELETE FROM skills WHERE name = 'react'` (lo usa un perfil o el banco) → **error** (FR-021).
8. `UPDATE skill_proposals SET status = 'rejected' WHERE …` sin `rejection_reason` →
   **error** de `CHECK` (FR-020).
9. `INSERT INTO skill_aliases VALUES ('reactjs', 'vue')` → **error** de PK: el alias ya
   pertenece a `react`.

Estas mismas comprobaciones se automatizan en
`backend/scripts/test-account-foundation-bypass.ts`:

```bash
cd backend && npx vitest run scripts/test-account-foundation-bypass.ts
```

## Nivel 2 — Unitarias (sin DB)

```bash
cd backend && npx vitest run tests/unit
cd apps/community && npx vitest run
```

Cubren:
- `normalizeSkillKey`: `React.js`, `C#`, `C++`, acentos y espacios.
- `resolveSkill`: por nombre, etiqueta o alias, y sin coincidencia.
- `buildCandidateProfileSchema`: trim, mínimo 1 skill, enums y skill no aprobado.
- `profileGateReason`: sin foto, sin campos, skills sin resolver, y empresa (solo foto).
- El desambiguador de `username` de empresa.

## Nivel 3 — Integración (backend + DB real)

```bash
cd backend && npx vitest run tests/integration
```

Resultados esperados:

| Caso | Resultado |
|---|---|
| `GET /skills` | Solo aprobados, con alias |
| `POST /skill-proposals` con `"React.js"` | `resolved → react` |
| Proponer un texto nuevo | `created` |
| Otro usuario propone lo mismo | `joined` |
| 6.ª propuesta nueva del mismo usuario | `409 proposal_limit` |
| Proponer un texto rechazado | `409 skill_rejected` |
| Cuenta empresa en `/skill-proposals` o en `/skill-exams/*` | `403 candidates_only` |
| `PUT /users/:username` con skill no aprobado | `400 skill_not_in_catalog` |
| `PUT /users/:username` sin foto | `400 photo_required` |
| `PUT /users/:username` con `accountType: 'company'` | `200`, pero el tipo **no** cambia |
| `GET /companies/:slug` para un slug que solo existe como candidato | `404` |
| `getOrCreateCompanyUser('Acme')` con un candidato `acme` existente | Crea `acme-empresa` (empresa); una segunda llamada la reutiliza |
| Ninguna ruta del backend contiene `change_account_type` ni `set_superadmin` | Pasa |

Todos los datos de prueba se borran por id al terminar.

## Nivel 4 — Componentes

- `SkillsInput`: al escribir `reactjs` sugiere React; con un texto sin coincidencia muestra
  "Proponer «X»" y **no** lo agrega como chip; una propuesta pendiente aparece con su estado.
- `OnboardingPage`: precarga todos los campos del usuario, no solo la foto.
- `ProfileGate`: redirige a `/onboarding` según `profileGateReason`.

## Nivel 5 — E2E

```bash
pnpm test:e2e
```

1. Candidato completo en `/settings`: escribe `reactjs` → queda `React`; guarda → persiste.
2. Candidato propone `Rust` → ve "Pendiente"; Rust no aparece como chip ni en el catálogo.
3. Candidato sin foto abre `/settings` directo → termina en `/onboarding` con sus datos
   precargados.

## Nivel 6 — Manual en navegador

1. Aprobar a mano en SQL la propuesta del paso 2:
   `SELECT approve_skill_proposal('<id>', NULL, 'Rust', '<superadmin>')`.
2. Recargar `/settings` como el candidato → la propuesta aparece aprobada y `Rust` ya se puede
   agregar (SC-005).
3. Abrir `/empresas/twilio` y el banner de empresas del inicio → los enlaces siguen funcionando.
4. Iniciar sesión como superadmin → `/admin/exam-questions/new` sigue funcionando, y su lista de
   skills incluye `Rust`.

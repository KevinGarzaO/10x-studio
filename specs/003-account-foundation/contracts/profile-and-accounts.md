# Contract: perfil de candidato, empresas y cambios en endpoints existentes

## `PUT /api/community/users/:username` (MODIFICADO)

**Auth** (sin cambios): `communityAuthMiddleware`; solo el dueño del perfil
(`users.id === req.userId`), si no `403`.

**Autorización nueva**: la cuenta debe ser `candidate`; si no, `403 { "error":
"candidates_only" }`. Es la única edición de perfil que existe hoy; la de empresa llega en
una parte posterior.

### Request

Validado con `buildCandidateProfileSchema(approvedSkillNames)` de `@avocado/schemas`. La
lista `approvedSkillNames` se lee de `skills` en cada petición, igual que hace
`exam-questions.routes.ts`.

```jsonc
{
  // obligatorios (FR-014, FR-026, FR-027) — se les hace trim; vacíos tras trim → 400
  "title": "Backend Developer",
  "roleCategory": "backend",          // enum ROLE_CATEGORY (movido a @avocado/schemas)
  "seniority": "senior",              // enum SENIORITY
  "skills": ["nodejs", "postgresql"], // ≥1, sin repetidos, todos en skills.name
  "location": "Monterrey, MX",
  "workModality": "Remoto",           // enum WORK_MODALITY
  // opcionales — trim; "" se guarda como null
  "displayName": "Kevin",
  "bio": "…",
  "website": "https://…",
  "githubUrl": "github.com/…",
  // foto: una nueva (data URL) o nada si ya tiene
  "photoBase64": "data:image/png;base64,…"
}
```

`accountType`, `isSuperadmin`, `roles` y `companySlug` **no forman parte del schema**. Si
llegan, Zod los descarta (`strip`) y nunca llegan a la base de datos. El trigger de la base de
datos es la segunda barrera (FR-004).

### Responses

| Status | Body | Cuándo |
|---|---|---|
| `200` | `{ "user": User }` | Guardado |
| `400` | `{ "error": "validation_error", "field": "skills", "message": "…" }` | Falla el schema |
| `400` | `{ "error": "skill_not_in_catalog", "field": "skills", "skill": "rust" }` | Un skill no está aprobado (FR-012) |
| `400` | `{ "error": "photo_required", "field": "photo" }` | La cuenta quedaría sin foto (FR-024) |
| `403` | `{ "error": "forbidden" }` / `{ "error": "candidates_only" }` | Perfil ajeno / cuenta de empresa |
| `404` | `{ "error": "Usuario no encontrado" }` | Sin cambios |

Si el trigger de la base de datos rechaza (`skill_not_in_catalog` o
`required_field_cleared`), el handler lo traduce al `400` equivalente y nunca devuelve `500`.
Así queda cubierta la carrera "el skill fue borrado entre la lectura del catálogo y el guardado".

---

## `GET /api/community/auth/me` (sin cambios de contrato)

Ya hace `select('*')`, así que las columnas nuevas `account_type`, `is_superadmin` y
`company_slug` aparecen solas. El gate del frontend usa `account_type`. No se modifica el
endpoint.

---

## `GET /api/community/companies/:slug` (NUEVO)

**Auth**: **pública, a propósito**, igual que `GET /users/:username`, del que reutiliza la
lógica: un perfil de empresa es público.

- Busca `users` con `company_slug = :slug` **y** `account_type = 'company'`.
- `200 { "user": … }` con la misma forma que `GET /users/:username` (incluye
  `community_posts`).
- `404 { "error": "Empresa no encontrada" }` si no hay una cuenta de empresa con ese slug,
  **aunque exista un candidato con ese `username`** (FR-028).

`/empresas/[company]` pasa a llamar a este endpoint en lugar de `/users/:username`.

## `GET /api/community/stats/companies` (MODIFICADO)

Cada empresa devuelta agrega `companySlug`. `hero-banner.tsx` enlaza con
`/empresas/${companySlug}` en lugar de derivarlo de `username`.

---

## `/api/community/skill-exams/*` (MODIFICADO: los 4 endpoints)

Se agrega `requireAccountType('candidate')` después de `communityAuthMiddleware`:

- `403 { "error": "candidates_only", "message": "Los exámenes son solo para candidatos" }`

El resto del contrato de `specs/002-skill-level-exam/contracts/skill-exams.md` no cambia.

## `POST /api/admin/exam-questions` (MODIFICADO)

`requireRole('admin')` pasa a ser `requireSuperadmin`, que lee `users.is_superadmin`. Los
códigos no cambian: `401`, y `403 { "error": "forbidden", "message": "No tienes permisos para
esta acción" }`.

---

## Servicio interno: `getOrCreateCompanyUser(rawName, logo)` (MODIFICADO, sin endpoint)

1. `slug = companySlug(rawName)`; si queda vacío, devuelve `null` (sin cambios).
2. Busca `users` con `company_slug = slug AND account_type = 'company'`. Si existe, la reutiliza.
3. Si no existe, elige un `username` libre en este orden: `slug`, `slug-empresa`,
   `slug-empresa-2`, …
4. Inserta `account_type = 'company'`, `company_slug = slug` y `is_scraper_profile = true`.
5. Si dos sincronizaciones crean la misma empresa a la vez, el `23505` del índice parcial se
   resuelve releyendo por `company_slug`.

**Nunca** devuelve una cuenta `candidate`, aunque su `username` sea igual al slug.

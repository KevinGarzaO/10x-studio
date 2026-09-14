# Contract: catálogo de skills y propuestas

## `GET /api/community/skills`

**Auth**: **pública, a propósito** (principio III lo exige declarado). El catálogo no contiene
datos personales, y lo usan pantallas sin sesión completa (onboarding) y el formulario de
preguntas de 001. Solo lectura, sin parámetros.

### 200 OK

```jsonc
{
  "skills": [
    { "name": "react", "label": "React" },
    { "name": "nodejs", "label": "Node.js" }
    // … solo skills aprobados, ordenados por label
  ],
  "aliases": [
    { "alias": "reactjs", "skillName": "react" },
    { "alias": "node", "skillName": "nodejs" }
  ]
}
```

- Nunca incluye propuestas pendientes, unidas ni rechazadas.
- `500 { "error": "catalog_unavailable" }` si falla la lectura. El frontend muestra el error
  y **no** permite guardar skills mientras tanto; nunca trata el fallo como "catálogo vacío".

---

## `POST /api/community/skill-proposals`

**Auth**: `communityAuthMiddleware` → `requireAccountType('candidate')`. Opera solo sobre
`req.userId`; el body no acepta ningún id de usuario.

### Request

```json
{ "text": "Rust" }
```

Validado con `skillProposalSchema` de `@avocado/schemas`: `text` es string, se hace `trim`,
tiene entre 1 y 50 caracteres, y su clave normalizada no puede quedar vacía.

### Responses

| Status | Body | Cuándo |
|---|---|---|
| `201` | `{ "outcome": "created", "proposal": Proposal }` | Texto nuevo; queda `pending` con el usuario como interesado |
| `200` | `{ "outcome": "joined", "proposal": Proposal }` | Ya había una propuesta `pending` con esa clave; el usuario queda como interesado. Idempotente si ya lo era |
| `200` | `{ "outcome": "resolved", "skill": { "name", "label" } }` | La clave coincide con un skill aprobado, un alias, o una propuesta `approved`/`merged`. No se crea nada; el frontend agrega ese skill |
| `400` | `{ "error": "validation_error", "field": "text", "message": "…" }` | Falla el schema |
| `401` | `{ "error": "unauthorized" }` | Sin sesión |
| `403` | `{ "error": "candidates_only" }` | La cuenta es de tipo empresa |
| `409` | `{ "error": "skill_rejected", "reason": "…" }` | La clave coincide con una propuesta `rejected` (FR-017) |
| `409` | `{ "error": "proposal_limit", "limit": 5 }` | El usuario ya es interesado en 5 propuestas `pending` y esta crearía una nueva (FR-019). Sumarse a una existente (`joined`) **no** está limitado |

**Carrera**: si dos personas proponen la misma clave a la vez, el `UNIQUE (normalized_key)`
hace fallar a la segunda con `23505`. El handler relee la propuesta y responde `joined`. Nunca
devuelve `500` por esto.

### `Proposal`

```jsonc
{
  "id": "uuid",
  "text": "Rust",
  "status": "pending",            // pending | approved | merged | rejected
  "skill": null,                  // { name, label } cuando approved o merged
  "rejectionReason": null,        // string cuando rejected
  "proposedAt": "2026-09-13T20:00:00Z",
  "reviewedAt": null
}
```

---

## `GET /api/community/skill-proposals/mine`

**Auth**: `communityAuthMiddleware` → `requireAccountType('candidate')`. Solo propuestas en
las que `req.userId` es interesado.

### 200 OK

```jsonc
{ "proposals": [ /* Proposal[], más recientes primero */ ] }
```

El candidato ve aquí el resultado de las decisiones que el superadmin tomó a mano en la base
de datos (SC-005). No hay notificaciones en esta feature.

# Contract: `/api/community/skill-exams`

## Auth (aplica a los 4 endpoints)

- Todos van detrás de `communityAuthMiddleware` (sesión válida requerida).
- Todos operan **exclusivamente** sobre `req.userId`. Ningún endpoint acepta un id de
  usuario por body, query o URL — un candidato no puede iniciar, responder ni consultar el
  examen de otro.
- Sin sesión → `401 { "error": "unauthorized" }`.

## Regla transversal (FR-005)

**Ninguna respuesta de estos endpoints incluye `correct_answer_index`, `is_correct` por
pregunta, ni ningún dato del que se pueda deducir la respuesta correcta de una pregunta no
contestada.** El candidato solo conoce su desempeño agregado, y solo al terminar.

---

## `GET /api/community/skill-exams/eligibility`

Para cada skill declarado por el candidato: si ya lo validó, y si puede examinarse ahora.

### 200 OK

```jsonc
{
  "skills": [
    {
      "skillName": "react",
      "label": "React",
      "validatedLevel": "intermedio",        // null si nunca lo ha validado
      "achievedAt": "2026-09-01T18:30:00Z",  // null si validatedLevel es null
      "canStart": false,
      "reason": "waiting_period",            // null cuando canStart es true
      "retryAvailableAt": "2026-10-01T18:30:00Z"  // solo si reason es "waiting_period"
    },
    {
      "skillName": "azure",
      "label": "Azure",
      "validatedLevel": null,
      "achievedAt": null,
      "canStart": false,
      "reason": "insufficient_bank",         // el banco de ese skill no llega a 20 preguntas
      "retryAvailableAt": null
    }
  ],
  "inProgress": {                            // null si no hay examen abierto
    "attemptId": "uuid",
    "skillName": "postgresql",
    "expiresAt": "2026-09-14T02:10:00Z",
    "answered": 4,
    "total": 10
  }
}
```

Valores posibles de `reason`: `"waiting_period"`, `"insufficient_bank"`,
`"exam_in_progress"` (hay otro examen abierto, FR-017).

---

## `POST /api/community/skill-exams`

Inicia un intento. Congela las 10 preguntas del examen en ese momento (`research.md` R3).

### Request

```jsonc
{ "skillName": "react" }
```

Validado con `startSkillExamSchema` de `packages/schemas/src/skillExam.ts`.

### 201 Created

```jsonc
{
  "attemptId": "uuid",
  "skillName": "react",
  "expiresAt": "2026-09-14T02:10:00Z",
  "total": 10,
  "answered": 0,
  "question": {                    // solo la pregunta actual, nunca las 10 de golpe
    "position": 0,
    "text": "¿Cuál hook se usa para efectos secundarios?",
    "options": [
      { "index": 0, "text": "useEffect" },
      { "index": 1, "text": "useState" }
    ]
  }
}
```

### Errores

| Código | Cuándo | Cuerpo |
|---|---|---|
| `400` | `skillName` ausente o no existe en el catálogo | `{ "error": "validation_error", "field": "skillName", "message": "..." }` |
| `403` | El skill no está declarado en el perfil del candidato (FR-002) | `{ "error": "skill_not_declared", "message": "..." }` |
| `409` | Dentro del periodo de espera (FR-011) | `{ "error": "waiting_period", "retryAvailableAt": "..." }` |
| `409` | Ya tiene otro examen en curso (FR-017) | `{ "error": "exam_in_progress", "attemptId": "..." }` |
| `422` | El banco de ese skill no llega al mínimo de 20 (FR-003) | `{ "error": "insufficient_bank", "message": "..." }` |

---

## `GET /api/community/skill-exams/current`

Retoma el examen en curso: devuelve la primera pregunta sin responder (FR-018).

### 200 OK

Mismo cuerpo que el `201` de arriba, con `answered` reflejando el avance y `question`
apuntando a la primera pregunta sin contestar.

### Errores

| Código | Cuándo | Cuerpo |
|---|---|---|
| `404` | No hay examen en curso | `{ "error": "no_exam_in_progress" }` |
| `410` | El examen en curso ya venció (pasaron 24h, FR-019) | `{ "error": "exam_expired", "retryAvailableAt": "..." }` |

---

## `POST /api/community/skill-exams/:attemptId/answers`

Envía la respuesta de una pregunta. **Si es la última, el examen se cierra y se califica en
esta misma petición** (`research.md` R6) — no hay endpoint de "terminar".

### Request

```jsonc
{ "position": 0, "selectedOptionIndex": 1 }
```

Validado con `submitAnswerSchema` de `packages/schemas/src/skillExam.ts`. El backend además
verifica que `selectedOptionIndex` corresponda a una opción real de **esa** pregunta.

### 200 OK — quedan preguntas

```jsonc
{
  "completed": false,
  "answered": 5,
  "total": 10,
  "question": { "position": 5, "text": "...", "options": [ /* ... */ ] }
}
```

Nótese que **no** se devuelve si la respuesta fue correcta.

### 200 OK — era la última pregunta

```jsonc
{
  "completed": true,
  "level": "intermedio",          // todo examen terminado otorga al menos "basico" (FR-020)
  "correctCount": 8,
  "total": 10,
  "profileLevel": "avanzado",     // el nivel que queda visible en el perfil: el mejor histórico (FR-021)
  "improved": false,              // true si este intento subió el nivel del perfil
  "retryAvailableAt": "2026-10-13T02:10:00Z"
}
```

`profileLevel` puede ser **mayor** que `level` cuando un reintento resultó peor que un
intento anterior: el perfil conserva el mejor (FR-021), y `improved: false` se lo comunica
al candidato sin ambigüedad.

### Errores

| Código | Cuándo | Cuerpo |
|---|---|---|
| `400` | Payload inválido (índice fuera de rango, posición inexistente) | `{ "error": "validation_error", "field": "...", "message": "..." }` |
| `403` | El intento no pertenece al usuario de la sesión | `{ "error": "forbidden" }` |
| `404` | No existe el intento | `{ "error": "attempt_not_found" }` |
| `409` | Esa pregunta ya fue respondida (FR-006) | `{ "error": "already_answered" }` |
| `409` | El intento ya está completado (FR-015) | `{ "error": "attempt_completed" }` |
| `410` | El intento venció (FR-019) | `{ "error": "exam_expired", "retryAvailableAt": "..." }` |

---

## Cambio en un endpoint existente

### `GET /api/community/users/:username` (público, sin auth)

Se amplía para que el perfil incluya los niveles validados, que US2 necesita mostrar. Es
uno de los dos cambios fuera del alcance estricto declarados en el Constitution Check del
plan.

Se añade al cuerpo actual:

```jsonc
{
  "user": {
    /* ... campos existentes ... */
    "skillLevels": [
      { "skillName": "react", "level": "intermedio", "achievedAt": "2026-09-01T18:30:00Z" }
    ]
  }
}
```

Contiene **solo** skills validados. Un skill declarado sin validar simplemente no aparece
aquí; el frontend lo distingue cruzando contra `skills` (que ya venía en la respuesta).

## Side effects

- `POST /skill-exams` crea 1 fila en `skill_exam_attempts` y 10 en
  `skill_exam_attempt_questions` — deben crearse juntas o ninguna, para que no quede un
  intento sin preguntas bloqueando el índice único parcial de FR-017.
- La última respuesta de un examen actualiza el intento (`status`, `finished_at`,
  `correct_count`, `level`) y, **solo si mejora**, la fila de `user_skill_levels`.
- Ningún endpoint de esta feature escribe en `exam_questions`, `question_options`, `skills`
  ni `users`.

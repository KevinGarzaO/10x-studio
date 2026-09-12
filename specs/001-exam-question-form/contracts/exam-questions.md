# Contract: POST /api/admin/exam-questions

## Auth

- Requiere sesión autenticada (middleware de auth existente reutilizado —
  no se crea un mecanismo de auth nuevo, solo la verificación de rol).
- Requiere `roles` del usuario autenticado incluya `admin`
  (`require-role.middleware.ts`, ver `research.md` R2).
- Sin sesión válida → `401`. Con sesión válida pero sin rol admin → `403`
  con mensaje `"No tienes permisos para esta acción"` (tal como especifica el
  ticket).

## Request

```jsonc
POST /api/admin/exam-questions
Content-Type: application/json

{
  "question": "string, 10-500 chars, se trimea antes de validar longitud",
  "skillName": "string, debe existir en skills.name (tabla nueva, ver data-model.md — no confundir con users.skills/scraper skills, que son texto libre sin catálogo)",
  "options": ["string, 1-200 chars c/u", "..."],   // 2 a 6 elementos, sin duplicados case-insensitive
  "correctAnswerIndex": 0,                          // entero, 0 <= index < options.length
  "difficultyLevel": "basico" // | "intermedio" | "avanzado"
}
```

Body validado por `examQuestionSchema` de `packages/schemas/examQuestion.ts` —
el mismo schema que usa el formulario de `apps/community` antes de enviar.

## Responses

### 201 Created (AC5)

```jsonc
{
  "id": "uuid de exam_questions.id",
  "question": "...",
  "skillName": "...",
  "options": ["...", "..."],
  "correctAnswerIndex": 0,
  "difficultyLevel": "basico",
  "createdAt": "ISO-8601"
}
```

### 400 Bad Request (AC1–AC4, y cualquier regla del schema)

```jsonc
{
  "error": "validation_error",
  "field": "question",          // el campo específico que falló (FR-010)
  "message": "La pregunta es obligatoria"
}
```

El frontend usa `field` para resaltar el input correspondiente — nunca solo
muestra un error genérico a nivel de formulario cuando el backend puede
identificar el campo.

### 401 Unauthorized

Sin sesión válida.

```jsonc
{ "error": "unauthorized" }
```

### 403 Forbidden (AC6)

```jsonc
{ "error": "forbidden", "message": "No tienes permisos para esta acción" }
```

Nada se guarda en este caso — ni una fila parcial en `exam_questions` ni en
`question_options` (ver Nivel 6 de pruebas de bypass en `quickstart.md`).

### 500 Internal Server Error

```jsonc
{ "error": "internal_error", "message": "Ocurrió un error, intenta de nuevo" }
```

El frontend NO limpia el formulario en este caso (FR-011) — a diferencia del
flujo 201, donde sí se limpia.

## Idempotency / Side effects

- Cada request exitosa crea exactamente una fila en `exam_questions` y N filas
  en `question_options` (N = `options.length`), vía una única llamada
  `supabase.rpc('insert_exam_question_with_options', ...)` — no dos `INSERT`
  REST separados, porque eso serían dos transacciones distintas y rompería el
  trigger diferido de `correct_answer_index` (ver `data-model.md`, "Nota de
  atomicidad"). Si algo falla dentro de la función, ambas tablas se revierten
  (sin filas huérfanas).
- No hay endpoint de lectura/listado en el alcance de esta feature (fuera de
  alcance según Assumptions de `spec.md`) — este contrato cubre únicamente la
  operación de alta.

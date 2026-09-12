# Quickstart: Formulario de creación de pregunta para examen de skill

Guía de validación end-to-end de esta feature, organizada por los 6 niveles de
prueba definidos en el ticket. No repite código de implementación — referencia
`data-model.md` y `contracts/exam-questions.md` para el detalle de cada regla.

## Prerequisites

- `pnpm install` en la raíz (incluye el nuevo paquete `packages/schemas`).
- Migración `backend/sql/exam-questions-migration.sql` aplicada manualmente en
  Supabase (no hay migration runner en este repo — ver `CLAUDE.md`). Incluye
  la creación de `skills` (nueva) + backfill de los 36 valores de
  `CANONICAL_SKILLS` — confirmar tras aplicarla que `SELECT count(*) FROM
  skills` da 36.
- Un usuario de prueba con `roles` conteniendo `'admin'` y otro sin ese rol,
  ambos ya existentes en `users` (para Nivel 3, 5 y 6).
- Backend corriendo: `pnpm dev:backend` (puerto 3001).
- Community corriendo: `pnpm dev:community` (puerto 3002).

## Nivel 1 — DB (aislado)

Ejecutar directamente en el editor SQL de Supabase (o vía `psql`), sin pasar
por el backend:

1. Dentro de una transacción, `INSERT` una `exam_questions` con
   `correct_answer_index = 99` seguido de 2 `question_options` para esa misma
   pregunta, y `COMMIT` → esperar que el `COMMIT` falle (el `CONSTRAINT
   TRIGGER validate_correct_answer_index_trigger`, diferido a fin de
   transacción, rechaza `99 >= 2`; ver `data-model.md`, nota sobre
   `correct_answer_index`). Probar también `correct_answer_index = -1` en un
   `INSERT` simple → rechazo inmediato por el `CHECK (correct_answer_index >= 0)`.
2. `INSERT INTO exam_questions (..., skill_name) VALUES (..., 'skill-inexistente')`
   → esperar rechazo por violación de FK contra `skills.name`.
3. `INSERT INTO exam_questions (..., difficulty_level) VALUES (..., 'experto')`
   → esperar rechazo por el `CHECK` del enum.

## Nivel 2 — Backend unitario (`packages/schemas`, sin DB real)

Ejecutar: `pnpm --filter @avocado/schemas test` (Vitest).

Un caso que falla y uno que pasa por regla, cubriendo los 6 AC:
- `question` de 5 caracteres → falla; de 15 caracteres → pasa.
- `options` con 1 elemento → falla; con 2 → pasa.
- `options` con `["Sí", "sí"]` (duplicado case-insensitive) → falla; sin
  duplicados → pasa.
- `correctAnswerIndex: 5` con solo 3 `options` → falla (`.refine()`); `0` con
  3 `options` → pasa.
- `difficultyLevel: "experto"` → falla; `"basico"` → pasa.

## Nivel 3 — Backend integración (DB de test real)

Ejecutar: `pnpm --filter backend test:integration` (Vitest contra una base de
datos de test — misma instancia de Supabase, esquema aislado o prefijo de
tabla de test, a definir en tasks.md).

- POST completo válido → `201`, y una lectura directa a `exam_questions` +
  `question_options` confirma que lo guardado coincide exacto con el payload
  enviado (round-trip, ver contrato).
- POST con `question` vacío → `400`, `field: "question"`.
- POST con usuario sin rol admin → `403`, nada se guardó (confirmar con una
  lectura a `exam_questions` antes/después: mismo conteo de filas).

## Nivel 4 — Frontend componente (mockeando el backend)

Ejecutar: `pnpm --filter community test` (Vitest + Testing Library).

- Escribir en el campo pregunta, hacer blur con el campo vacío → ver
  "La pregunta es obligatoria" bajo el campo, sin llamada de red.
- Formulario con 1 sola opción capturada → botón submit `disabled`.
- Mock de `fetch` a `/api/admin/exam-questions` respondiendo `201` → verificar
  que se llamó con el payload exacto esperado (mismos nombres de campo que el
  contrato) y que el formulario se limpió después.

## Nivel 5 — E2E (UI real → API real → DB real, Playwright)

Ejecutar: `pnpm exec playwright test e2e/exam-question-form.spec.ts`.

Flujo único que recorre AC1→AC6 en una sola sesión de navegador:
1. Login como usuario sin rol admin → navegar a la URL del formulario → 403 o
   redirect (según se decida en tasks.md) — confirma AC6 desde la UI real.
2. Login como admin → dejar "pregunta" vacío → submit → ver error inline (AC1).
3. Completar pregunta, agregar 1 opción → botón deshabilitado (AC2).
4. Agregar 2ª opción, no marcar correcta → submit → ver error (AC3).
5. Marcar correcta, duplicar el texto de una opción → submit → ver error (AC4).
6. Corregir el duplicado → submit → ver confirmación y formulario limpio (AC5).
7. Confirmar contra Supabase (query directa o vía un endpoint de test) que la
   pregunta quedó guardada con los datos exactos capturados.

## Nivel 6 — Bypass directo al endpoint

Sin pasar por el formulario, con `curl`/Postman, usando datos que el frontend
nunca dejaría enviar:

```bash
# Sin rol admin (usar un token de sesión de un usuario no-admin)
curl -X POST http://localhost:3001/api/admin/exam-questions \
  -H "Content-Type: application/json" \
  -H "Cookie: <sesión de usuario no-admin>" \
  -d '{"question":"","skillName":"react","options":["a","a"],"correctAnswerIndex":9,"difficultyLevel":"experto"}'
# Esperado: 403 (el rol se verifica antes que el body, ver research.md R2) — nada se guarda.

# Con rol admin pero payload inválido en todos los campos a la vez
curl -X POST http://localhost:3001/api/admin/exam-questions \
  -H "Content-Type: application/json" \
  -H "Cookie: <sesión de usuario admin>" \
  -d '{"question":"","skillName":"skill-inexistente","options":["a","a"],"correctAnswerIndex":9,"difficultyLevel":"experto"}'
# Esperado: 400 con el primer campo inválido detectado por Zod — nada se guarda,
# confirmando que el backend re-valida todo independientemente del frontend
# (principio I de la constitución), aunque el frontend "nunca dejaría" este payload.
```

Después de cada intento, confirmar con una lectura directa a `exam_questions`
que el conteo de filas no cambió.

## Success check

Los 6 Acceptance Criteria de `spec.md` se consideran verificados cuando los 6
niveles anteriores pasan y, adicionalmente, se repite el flujo del Nivel 5
manualmente en un navegador real (no solo vía Playwright) — tal como pide el
Definition of Done del ticket original.

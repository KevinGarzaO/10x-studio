# Quickstart: Validación de nivel por skill mediante examen

Guía de validación de la feature. Referencia `data-model.md` y
`contracts/skill-exams.md` para el detalle de cada regla en vez de repetirlo.

## Prerequisites

- `pnpm install` en la raíz.
- Migración `backend/sql/skill-exams-migration.sql` aplicada manualmente en el editor SQL
  de Supabase (este repo no tiene migration runner — ver `CLAUDE.md`). Confirmar después
  que existen las 3 tablas y el índice único parcial:
  ```sql
  SELECT indexname FROM pg_indexes WHERE tablename = 'skill_exam_attempts';
  ```
- **Un banco de preguntas real.** Es el prerequisito que más fácil se olvida: hoy
  `exam_questions` está vacía. Se necesitan **al menos 20 preguntas de un mismo skill**
  (FR-003) capturadas con el formulario de 001 (`/admin/exam-questions/new`) antes de que
  ningún examen pueda iniciarse.
- Un usuario de prueba con ese skill declarado en `users.skills`, y otro sin declararlo
  (para el caso negativo de FR-002).
- Backend corriendo: `pnpm dev:backend` (3001). ⚠️ Arrancarlo dispara los crons reales del
  scraper y del orquestador de contenido (`CLAUDE.md`).
- Community corriendo: `pnpm dev:community` (3002).

## Nivel 1 — DB (aislado)

Directo en el editor SQL de Supabase, sin pasar por el backend:

1. Insertar dos `skill_exam_attempts` con `status = 'in_progress'` para el **mismo**
   `user_id` → el segundo debe ser rechazado por el índice único parcial (FR-017).
2. Insertar un intento con `level = 'experto'` → rechazo por el `CHECK` del enum.
3. Insertar un `skill_exam_attempt_questions` con `selected_option_index = -1` → rechazo
   por el `CHECK`.
4. Intentar `DELETE` de una `exam_questions` ya referenciada por un intento → rechazo por
   `ON DELETE RESTRICT` (FR-012, `research.md` R5).
5. Insertar dos filas en `user_skill_levels` con el mismo `(user_id, skill_name)` → rechazo
   por la PK compuesta.

## Nivel 2 — Backend unitario (sin DB)

`pnpm --filter backend test`

- **Schema compartido**: por cada regla de `skillExam.ts`, un caso que falla y uno que pasa
  (`selectedOptionIndex` negativo / fuera del máximo de 6, `position` negativa, `skillName`
  vacío).
- **Cálculo de nivel** (`skill-exam.service.ts`): 10/10 → avanzado; 9/10 (90%) → avanzado;
  7/10 (70%) → intermedio; 6/10 → básico; 0/10 → **básico**, no "sin nivel" (FR-020).
- **Mejor nivel histórico** (FR-021): guardado `intermedio` + nuevo `basico` → se conserva
  `intermedio` y `achieved_at` no cambia; guardado `basico` + nuevo `avanzado` → sube.
- **Selección de preguntas** (FR-014): con banco de 20 y un intento previo de 10, el nuevo
  conjunto no comparte ninguna pregunta; con banco de 12, comparte solo las necesarias para
  llegar a 10.
- **Expiración derivada** (FR-019): intento `in_progress` con `expires_at` en el pasado se
  reporta como vencido sin necesidad de escribir nada.

## Nivel 3 — Backend integración (DB real)

`pnpm --filter backend test:integration`

Mismo patrón que los tests de 001: mockear solo `communityAuthMiddleware` para inyectar el
`userId` de prueba (no tenemos contraseñas de esos usuarios), todo lo demás sin mocks
contra la base real, y **limpiar las filas creadas en `afterAll`**.

- Flujo completo: iniciar → responder las 10 → `201`/`200` con nivel, y lectura directa a
  la DB confirmando `status='completed'`, `correct_count`, `level`, y la fila de
  `user_skill_levels`.
- **FR-005 (el más importante)**: recorrer *todas* las respuestas HTTP del flujo completo y
  afirmar que en ninguna aparece `correct_answer_index` ni `is_correct`. Este test es la red
  de seguridad contra que alguien cambie el `select()` a `select('*')` en el futuro.
- Skill no declarado → `403`; banco insuficiente → `422`; segundo examen en curso → `409`;
  responder dos veces la misma posición → `409`; responder un intento de otro usuario →
  `403`.
- Reintento dentro del periodo de espera → `409` con `retryAvailableAt`.
- Reintento peor tras el periodo de espera → el intento nuevo guarda su `level` real, pero
  `user_skill_levels` conserva el mejor y la respuesta trae `improved: false`.

## Nivel 4 — Frontend componente (backend mockeado)

`pnpm --filter community test`

- `SkillExamRunner`: muestra una pregunta a la vez; tras responder, no hay forma de volver a
  la anterior (FR-006); al recibir `completed: true` muestra el resultado.
- `SkillExamResult`: muestra el nivel obtenido, y cuando `improved: false` y `profileLevel`
  es mayor, comunica que el perfil conserva el nivel anterior (evita el malentendido de
  "bajé de nivel").
- Lista de elegibilidad: un skill con `reason: "insufficient_bank"` se muestra como no
  disponible y **no** ofrece iniciar; uno con `waiting_period` muestra la fecha.

## Nivel 5 — E2E (Playwright, todo real)

`pnpm test:e2e` con los servidores arriba.

Mismo enfoque que 001: inyectar una sesión real en `localStorage` (generada server-side con
la Admin API de Supabase) en vez de teclear contraseña, y limpiar al final las filas
creadas.

1. Candidato con skill declarado y banco suficiente → inicia, responde las 10, ve su nivel.
2. Visitar su perfil público (incluso sin sesión) → el skill aparece con el nivel validado y
   se distingue de los no validados (US2).
3. Intentar iniciar otra vez el mismo skill → bloqueado, con la fecha de reintento (US3).
4. Interrumpir un examen a la mitad (recargar/cerrar) y volver → retoma donde iba, con las
   respuestas anteriores intactas (FR-018).

## Nivel 6 — Bypass directo al endpoint

Script manual, mismo patrón que `backend/scripts/test-exam-questions-bypass.ts` de 001.
Objetivo: confirmar que el backend se defiende solo, sin la UI.

- `POST` a `/answers` de un intento ajeno → `403`, y la respuesta no se guarda.
- `POST` con `selectedOptionIndex: 99` → `400`, sin fila escrita.
- Reenviar la respuesta de una posición ya contestada → `409`, y la respuesta original **no
  cambia** (FR-006).
- `POST` a `/skill-exams` con un `skillName` que el usuario no declaró → `403`, sin intento
  creado.
- Terminar un examen y volver a enviar una respuesta → `409` (FR-015), y `level` no se
  recalcula.

Después de cada caso, confirmar con lectura directa que el conteo de filas no cambió.

## Success check

Los 4 AC de la spec se consideran verificados cuando los 6 niveles pasan y, además, se
recorre el flujo del Nivel 5 a mano en un navegador real — igual que se pidió en 001.

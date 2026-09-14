# Requerimiento 001 — Formulario de creación de pregunta para examen de skill

| | |
|---|---|
| **Origen** | Ticket escrito por el equipo de producto |
| **Fecha** | 2026-09-12 |
| **Spec derivada** | [`specs/001-exam-question-form/`](../specs/001-exam-question-form/spec.md) |
| **Estado** | Implementado y mergeado a `master` |

El texto de abajo es el requerimiento original, sin modificar.

## Notas posteriores al requerimiento

Durante la especificación y la implementación se descubrieron dos cosas que el ticket daba por
hechas. Se dejan aquí para que quien lea el original no se confunda:

1. **La tabla `skills` no existía.** El ticket la describe como "tabla existente, no
   modificar". El catálogo solo vivía en el frontend, como `CANONICAL_SKILLS` en
   `apps/community/lib/profile-options.ts`. La feature creó la tabla `skills` con los **37**
   skills de esa lista.
2. **El `CHECK (correct_answer_index < n_options)` no se puede expresar como `CHECK`**, porque
   el número de opciones vive en otra tabla. Se implementó como un trigger diferido sobre
   `question_options`, y el guardado se hace en una sola transacción mediante una función RPC.
   Salió de `/speckit.analyze`, hallazgo C1.

---

## Title
Formulario de creación de pregunta para examen de skill

---

## Description
Como parte del sistema de evaluación de skills (release 1.1.0), se necesita un
formulario donde el admin capture preguntas de opción múltiple para poblar el
banco de 35 preguntas por skill. Actualmente no existe ningún mecanismo de
captura; las preguntas se han estado definiendo solo en documentos.

---

## Acceptance Criteria

AC1:
Dado que estoy en el formulario de nueva pregunta
Cuando dejo el campo "pregunta" vacío y doy submit
Entonces veo el error "La pregunta es obligatoria" bajo el campo, sin recargar la página

AC2:
Dado que capturo una pregunta válida
Cuando agrego menos de 2 opciones de respuesta
Entonces el botón submit permanece deshabilitado y veo "Se requieren al menos 2 opciones"

AC3:
Dado que tengo 2 o más opciones capturadas
Cuando no he marcado ninguna como correcta
Entonces submit muestra "Selecciona la respuesta correcta" y no envía el formulario

AC4:
Dado que capturo dos opciones con el mismo texto (sin importar mayúsculas/minúsculas)
Cuando intento hacer submit
Entonces veo el error "Las opciones no pueden repetirse"

AC5:
Dado que el formulario es válido
Cuando doy submit
Entonces se guarda en Supabase, veo confirmación, y el formulario se limpia

AC6:
Dado que no soy admin
Cuando intento acceder a este formulario o llamar al endpoint directamente
Entonces recibo 403 y no se guarda nada

---

## Contexto técnico
- Nuevo endpoint: POST /api/admin/exam-questions
- Tablas nuevas: exam_questions, question_options
- Tabla existente (FK, no modificar): skills
- Schema de validación en packages/schemas/examQuestion.ts (compartido
  monorepo) — frontend y backend usan el MISMO schema Zod
- No tocar: catálogo de skills existente, ni el flujo de examen del usuario
  final ya en producción — esta feature solo agrega captura de preguntas
- Requiere rol admin (ya existe el middleware de auth con roles, solo aplicarlo)

---

## Validaciones — por campo

### question
- DB: varchar(500) NOT NULL
- Backend: z.string().trim().min(10).max(500)
- Frontend: textarea, maxLength=500, trim automático en blur,
  primera letra en mayúscula, no permite string vacío/solo espacios

### skill_name
- DB: varchar(50) NOT NULL, FK a skills.name
- Backend: debe existir en catálogo de skills (no texto libre)
- Frontend: <select> con opciones del catálogo, no input libre

### options (array de 2 a 6)
- DB: tabla question_options, text varchar(200) por fila, FK a exam_questions.id
- Backend: z.array(z.string().trim().min(1).max(200)).min(2).max(6)
  .refine(sin duplicados case-insensitive)
- Frontend: inputs dinámicos (agregar/quitar), maxLength=200 c/u,
  trim en blur, no permite opción vacía ni duplicada

### correct_answer_index
- DB: smallint, CHECK (correct_answer_index >= 0 AND correct_answer_index < n_options)
- Backend: z.number().int().min(0).refine(index < options.length)
- Frontend: radio button por opción, ninguno seleccionado por default

### difficulty_level
- DB: varchar(12), CHECK IN ('basico','intermedio','avanzado')
- Backend: z.enum(['basico','intermedio','avanzado'])
- Frontend: select cerrado, sin opción "otro"

---

## Manejo de errores
- 400 → devuelve el campo específico que falló, frontend lo mapea al input correcto
- 403 → usuario no admin, mensaje "No tienes permisos para esta acción"
- 500/timeout → mensaje genérico, formulario conserva los datos capturados (no los borra)

---

## Estrategia de pruebas — completa, por capa

### Nivel 1 — DB (aislado)
- Intentar INSERT con correct_answer_index fuera de rango → debe rechazar (CHECK)
- Intentar INSERT sin skill_name válido → debe rechazar (FK)
- Intentar INSERT con difficulty_level fuera del enum → debe rechazar (CHECK)

### Nivel 2 — Backend unitario (aislado, sin DB real)
- Schema Zod: cada regla con 1 caso que falla y 1 que pasa
  (question corto, options duplicadas, index fuera de rango, etc — cubre los 6 AC)

### Nivel 3 — Backend integración (con DB de test real)
- POST completo: request → Zod → INSERT real → response
- Casos: éxito, 400 por campo inválido, 403 sin rol admin
- Verifica que lo guardado en DB coincide exacto con lo enviado (round-trip)

### Nivel 4 — Frontend componente (aislado, mockeando el backend)
- Input-level: escribir, hacer blur, ver el mensaje de error exacto
- Submit-level: formulario incompleto → botón deshabilitado
- Mock de submit exitoso → verificar que se llama con el payload correcto

### Nivel 5 — E2E (UI real → API real → DB real, sin mocks)
- Flujo completo AC1-AC6 navegando de verdad:
  llenar mal → ver error → corregir → submit → verificar que quedó en Supabase

### Nivel 6 — Prueba de "bypass"
- POST directo al endpoint (Postman/curl), sin pasar por el formulario,
  con datos que el frontend nunca dejaría enviar
- Objetivo: confirmar que el backend rechaza aunque el frontend no exista en ese momento

---

## Flujo de desarrollo (Spec Kit + Claude Code)

/speckit.constitution — ya definido a nivel proyecto (reglas de validación en
3 capas, schemas compartidos, tests obligatorios en el mismo PR), no se repite aquí

/speckit.specify — usar el bloque de Description + Acceptance Criteria de arriba

/speckit.plan — usar el bloque de Contexto técnico + Validaciones por campo +
Manejo de errores + Estrategia de pruebas de arriba

/speckit.tasks — se genera automático a partir del plan

/speckit.analyze — correr ANTES de implementar: valida que los 6 niveles de
prueba definidos en plan.md sigan cubriendo los 6 Acceptance Criteria de
spec.md, sin huecos ni contradicciones

/speckit.implement — ejecuta las tareas (código + tests) siguiendo tasks.md

---

## Definition of Done
- [ ] Schema Zod compartido creado en packages/schemas
- [ ] Endpoint valida rol admin (401/403 según corresponda)
- [ ] Backend re-valida todo con el mismo schema (no confía en frontend)
- [ ] Constraints de DB aplicados según tabla de validaciones
- [ ] /speckit.analyze corrido y sin inconsistencias antes de implementar
- [ ] Nivel 1 (DB) verificado
- [ ] Nivel 2 (backend unitario) verificado
- [ ] Nivel 3 (backend integración) verificado
- [ ] Nivel 4 (frontend componente) verificado
- [ ] Nivel 5 (E2E completo) verificado
- [ ] Nivel 6 (bypass directo al endpoint) verificado
- [ ] Los 6 Acceptance Criteria verificados manualmente en navegador
- [ ] Code review aprobado

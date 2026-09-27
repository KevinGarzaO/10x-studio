# Requerimientos

Aquí vive **el origen de cada feature**: el requerimiento tal como lo pidió producto, antes de
convertirse en spec. `specs/` dice *qué se construye y cómo*; `requirements/` guarda *qué se
pidió y por qué*.

Cada requerimiento conserva su texto original. Lo que cambió después (preguntas abiertas
resueltas, supuestos que resultaron falsos, decisiones de `/speckit.clarify`) va en una sección
de notas al inicio del archivo, nunca reescribiendo el texto original.

| # | Requerimiento | Spec | Estado |
|---|---|---|---|
| 001 | [Formulario de creación de pregunta para examen de skill](001-exam-question-form.md) | [specs/001-exam-question-form](../specs/001-exam-question-form/spec.md) | Implementado |
| 002 | [Validación de nivel por skill mediante examen](002-skill-level-exam.md) | [specs/002-skill-level-exam](../specs/002-skill-level-exam/spec.md) | Implementado, falta verificación manual |
| 003 | [Cuentas de candidato y empresa](003-candidate-and-company-accounts.md) | [specs/003-account-foundation](../specs/003-account-foundation/spec.md) (parte 1 de 7) | Parte 1 en planeación |

## Cómo agregar uno nuevo

1. Escribe el requerimiento con la plantilla (ver [002](002-skill-level-exam.md#plantilla-usada)).
2. Guárdalo aquí como `NNN-nombre-corto.md`, con el siguiente número disponible.
3. Úsalo como entrada de `/speckit-specify`.
4. Cuando exista la spec, enlázala en la tabla de arriba.

Si un requerimiento se divide en varias features (como el 003), el archivo se queda con un solo
número y la tabla indica qué parte cubre cada spec.

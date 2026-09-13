# Feature Specification: Formulario de creación de pregunta para examen de skill

**Feature Branch**: `001-exam-question-form`

**Created**: 2026-09-12

**Status**: Draft

**Input**: User description: "Formulario de creación de pregunta para examen de skill — Como parte del sistema de evaluación de skills (release 1.1.0), se necesita un formulario donde el admin capture preguntas de opción múltiple para poblar el banco de 35 preguntas por skill. Actualmente no existe ningún mecanismo de captura; las preguntas se han estado definiendo solo en documentos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Capturar una pregunta válida (Priority: P1)

Un administrador redacta una pregunta de opción múltiple para el banco de un skill,
la envía, y el sistema la guarda de forma permanente para su uso futuro en exámenes.

**Why this priority**: Es el valor central de la feature — sin esto no existe ningún
mecanismo de captura y el banco de 35 preguntas por skill sigue dependiendo de
documentos sueltos.

**Independent Test**: Se puede probar por completo llenando el formulario con una
pregunta, 2-6 opciones sin duplicados, una respuesta marcada como correcta y un
nivel de dificultad, enviando, y confirmando que la pregunta quedó disponible en el
banco (y que el formulario se limpia para capturar la siguiente).

**Acceptance Scenarios**:

1. **Given** el formulario es válido (pregunta, skill, 2-6 opciones sin duplicados,
   una respuesta correcta marcada, dificultad seleccionada), **When** el
   administrador da submit, **Then** la pregunta se guarda de forma permanente, se
   muestra confirmación al administrador, y el formulario se limpia listo para una
   nueva captura.

---

### User Story 2 - Recibir retroalimentación inmediata sobre datos inválidos (Priority: P2)

Un administrador comete un error al capturar una pregunta (campo vacío, menos de 2
opciones, ninguna respuesta correcta marcada, u opciones repetidas) y el sistema se
lo señala de inmediato, sin perder lo ya capturado ni recargar la página.

**Why this priority**: Protege la calidad del banco de preguntas — sin esta
retroalimentación, preguntas incompletas o ambiguas (sin respuesta correcta, con
opciones duplicadas) podrían colarse al banco usado en exámenes reales.

**Independent Test**: Se puede probar de forma independiente intentando enviar el
formulario con cada tipo de dato inválido por separado y confirmando que aparece el
mensaje de error correspondiente y que el envío no ocurre.

**Acceptance Scenarios**:

1. **Given** el campo "pregunta" está vacío, **When** el administrador da submit,
   **Then** ve el error "La pregunta es obligatoria" bajo el campo, sin recargar la
   página.
2. **Given** una pregunta válida capturada, **When** el administrador agrega menos
   de 2 opciones de respuesta, **Then** el botón de envío permanece deshabilitado y
   se muestra "Se requieren al menos 2 opciones".
3. **Given** 2 o más opciones capturadas, **When** el administrador no ha marcado
   ninguna como correcta, **Then** el submit muestra "Selecciona la respuesta
   correcta" y no envía el formulario.
4. **Given** dos opciones con el mismo texto (sin importar mayúsculas/minúsculas),
   **When** el administrador intenta hacer submit, **Then** ve el error "Las
   opciones no pueden repetirse" y el envío no ocurre.
5. **Given** el campo "pregunta" tiene texto pero menos de 10 caracteres,
   **When** el administrador intenta hacer submit, **Then** ve un error de
   longitud mínima asociado al campo y el envío no ocurre — una pregunta
   demasiado corta para ser útil en un examen no se considera válida aunque no
   esté vacía.

---

### User Story 3 - Restringir la captura de preguntas solo a administradores (Priority: P1)

Un usuario que no tiene rol de administrador intenta acceder al formulario o enviar
una pregunta directamente, y el sistema lo rechaza sin guardar nada.

**Why this priority**: El banco de preguntas alimenta exámenes reales de skills —
permitir que cualquier usuario inserte o modifique preguntas compromete la validez
de esos exámenes. Es un requisito de seguridad, no una mejora incremental.

**Independent Test**: Se puede probar de forma independiente intentando acceder al
formulario como usuario no-admin, y por separado enviando una solicitud directa
(sin pasar por la interfaz) con credenciales de un usuario no-admin.

**Acceptance Scenarios**:

1. **Given** un usuario sin rol de administrador, **When** intenta acceder a este
   formulario o invocar la operación de guardado directamente (sin pasar por la
   interfaz), **Then** recibe un rechazo de permisos y no se guarda nada.

---

### Edge Cases

- ¿Qué pasa si el guardado falla por un error inesperado del sistema (caída de
  conexión, timeout)? El administrador ve un mensaje genérico de error y el
  formulario conserva los datos ya capturados (no se borran).
- ¿Qué pasa si el servidor rechaza un campo específico que el formulario ya
  permitió enviar (validación redundante en el sistema central)? El error se
  asocia visualmente al campo específico que falló, no solo a un mensaje genérico
  a nivel de formulario.
- ¿Qué pasa si dos administradores capturan preguntas para el mismo skill al mismo
  tiempo? Cada envío se procesa de forma independiente; no hay bloqueo de
  concurrencia entre administradores (fuera de alcance).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST proveer un formulario para capturar una pregunta de
  opción múltiple: enunciado de la pregunta, skill al que pertenece, entre 2 y 6
  opciones de respuesta, cuál opción es la correcta, y un nivel de dificultad.
- **FR-002**: El sistema MUST impedir el envío del formulario cuando el enunciado
  de la pregunta está vacío o tiene menos de 10 caracteres, mostrando el error
  correspondiente junto al campo sin recargar la página.
- **FR-003**: El sistema MUST impedir el envío del formulario cuando hay menos de 2
  opciones de respuesta capturadas.
- **FR-004**: El sistema MUST impedir el envío del formulario cuando ninguna opción
  ha sido marcada como la respuesta correcta.
- **FR-005**: El sistema MUST impedir el envío del formulario cuando dos o más
  opciones tienen el mismo texto, sin importar mayúsculas o minúsculas.
- **FR-006**: El sistema MUST NOT permitir texto libre para el campo de skill —
  el skill capturable MUST limitarse a los que ya existen en el catálogo.
- **FR-007**: Al enviar un formulario válido, el sistema MUST guardar la pregunta
  de forma permanente, confirmar al administrador que se guardó, y limpiar el
  formulario para una nueva captura.
- **FR-008**: El sistema MUST re-validar toda la información recibida de forma
  independiente a la validación ya hecha en el formulario, y MUST rechazar
  cualquier dato que no cumpla las mismas reglas aunque provenga de un origen
  distinto al formulario.
- **FR-009**: El sistema MUST restringir la creación de preguntas exclusivamente a
  usuarios con rol de administrador, tanto en el acceso al formulario como en la
  operación de guardado subyacente.
- **FR-010**: Cuando un envío es rechazado por un dato inválido, el sistema MUST
  indicar cuál campo específico falló, de modo que el error se muestre junto a ese
  campo y no solo como un mensaje genérico.
- **FR-011**: Cuando el guardado falla por una causa inesperada del sistema (no por
  datos inválidos), el sistema MUST mostrar un mensaje genérico y MUST conservar
  los datos ya capturados en el formulario en vez de borrarlos.

### Key Entities

- **Pregunta de examen**: representa una pregunta de opción múltiple para el banco
  de un skill. Atributos clave: enunciado, skill asociado, nivel de dificultad,
  cuál de sus opciones es la correcta. Pertenece a un único skill del catálogo
  existente.
- **Opción de respuesta**: representa una posible respuesta asociada a una
  pregunta. Atributos clave: texto de la opción, si es o no la respuesta correcta.
  Una pregunta tiene entre 2 y 6 opciones, y ninguna puede repetir el texto de otra
  dentro de la misma pregunta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede capturar y guardar una pregunta válida en
  menos de 2 minutos sin necesitar ayuda externa.
- **SC-002**: El 100% de los intentos de envío con datos inválidos (pregunta vacía,
  menos de 2 opciones, sin respuesta correcta marcada, opciones duplicadas) son
  bloqueados con un mensaje de error específico, sin excepción.
- **SC-003**: El 100% de los intentos de creación de preguntas por usuarios sin rol
  de administrador son rechazados, sin importar si se intentan desde la interfaz o
  directamente contra el sistema.
- **SC-004**: Después de que esta feature esté disponible, el equipo puede poblar
  el banco de 35 preguntas por skill sin depender de documentos externos como
  fuente de captura.

## Assumptions

- El catálogo de skills no existía como una lista formal y consultable antes de
  esta feature (solo vivía como una lista fija dentro del código del formulario
  de perfil del candidato) — esta feature lo formaliza como una lista
  consultable, sin cambiar cuáles skills existen ni su significado; el
  formulario únicamente permite elegir entre los skills ya definidos ahí.
- El flujo de examen para el usuario final (quien resuelve el examen) ya está en
  producción y queda fuera de alcance — esta feature solo agrega la capacidad de
  captura de preguntas para el administrador.
- El sistema de sesión/login ya existe y esta feature lo reutiliza; lo que no
  existía todavía era la verificación específica de "¿este usuario tiene rol de
  administrador?" para un endpoint — esta feature la agrega, sin crear un
  sistema de autenticación nuevo.
- No hay requisito de edición ni eliminación de preguntas ya capturadas en esta
  feature — solo alta de preguntas nuevas.
- No hay requisito de bloqueo de concurrencia entre administradores capturando al
  mismo tiempo.

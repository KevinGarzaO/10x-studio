# Feature Specification: Validación de nivel por skill mediante examen

**Feature Branch**: `002-skill-level-exam`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Validación de nivel por skill mediante examen — El banco de preguntas ya existe y un admin puede llenarlo, pero hoy nadie puede responderlas. Un candidato presenta un examen de opción múltiple sobre un skill que ya declaró en su perfil, obtiene un nivel (básico/intermedio/avanzado) calculado automáticamente, y ese nivel queda visible públicamente en su perfil. Un intento por skill, con periodo de espera para reintentar."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Presentar el examen y obtener un nivel (Priority: P1)

Un candidato elige uno de los skills que ya declaró en su perfil, responde una serie de
preguntas de opción múltiple sobre ese skill, y al terminar el sistema le dice
automáticamente qué nivel alcanzó: básico, intermedio o avanzado.

**Why this priority**: Es el corazón de la feature. Sin esto, el banco de preguntas que ya
se puede llenar no tiene ningún consumidor y el trabajo de captura no produce valor.

**Independent Test**: Se puede probar por completo tomando una cuenta con un skill
declarado que tenga banco suficiente, iniciando el examen, respondiendo todas las
preguntas, y confirmando que se muestra un nivel coherente con las respuestas dadas.

**Acceptance Scenarios**:

1. **Given** un candidato con el skill "React" declarado en su perfil y banco suficiente
   de preguntas, **When** inicia el examen de ese skill, **Then** el sistema le presenta
   preguntas de opción múltiple de ese skill, una a la vez.
2. **Given** un candidato respondiendo el examen, **When** contesta una pregunta y avanza,
   **Then** no puede regresar a modificar esa respuesta.
3. **Given** un candidato que respondió todas las preguntas, **When** termina el examen,
   **Then** el sistema calcula el resultado y le muestra de inmediato el nivel obtenido
   (básico, intermedio o avanzado).
4. **Given** un candidato en cualquier punto del examen, **When** inspecciona toda la
   información que su dispositivo recibió, **Then** no puede determinar cuál es la
   respuesta correcta de una pregunta que aún no ha contestado.

---

### User Story 2 - El nivel validado se muestra en el perfil público (Priority: P1)

Cualquier persona que visite el perfil del candidato — una empresa evaluándolo, otro
miembro de la comunidad — ve qué skills tiene validados y con qué nivel, distinguiéndolos
de los que solo están declarados.

**Why this priority**: Es la razón de negocio de la feature. Un nivel validado que solo ve
el propio candidato no cambia nada para las empresas, que son quienes necesitan la señal.

**Independent Test**: Se puede probar de forma independiente partiendo de un resultado ya
existente: visitar el perfil público de ese candidato (incluso sin sesión iniciada) y
confirmar que el skill aparece marcado como validado con su nivel.

**Acceptance Scenarios**:

1. **Given** un candidato que validó "React" en nivel intermedio, **When** alguien visita
   su perfil público, **Then** ve "React" identificado como validado y con nivel
   intermedio.
2. **Given** un candidato con skills declarados sin validar, **When** alguien visita su
   perfil, **Then** esos skills se distinguen visiblemente de los validados.
3. **Given** un candidato que validó un skill, **When** él mismo entra a su perfil,
   **Then** ve el mismo nivel que ven los demás, y desde cuándo está validado.

---

### User Story 3 - Un intento por skill, con periodo de espera (Priority: P2)

Un candidato que ya presentó el examen de un skill no puede volver a presentarlo de
inmediato: debe esperar un periodo antes de poder intentar mejorar su nivel.

**Why this priority**: Protege la credibilidad del resultado, que es lo que hace que una
empresa le crea al badge. Sin este límite, cualquiera repite hasta acertar por
eliminación y el nivel deja de significar algo. No es P1 porque la feature entrega valor
sin él, pero se degrada rápido en producción.

**Independent Test**: Se puede probar de forma independiente presentando un examen y
luego intentando iniciarlo otra vez de inmediato, confirmando que el sistema lo impide y
comunica cuándo será posible.

**Acceptance Scenarios**:

1. **Given** un candidato que acaba de terminar el examen de "React", **When** intenta
   iniciarlo de nuevo, **Then** el sistema se lo impide y le indica la fecha a partir de
   la cual podrá reintentar.
2. **Given** un candidato cuyo periodo de espera ya transcurrió, **When** inicia el examen
   de ese mismo skill, **Then** el sistema se lo permite.
3. **Given** un candidato que reintenta un skill después del periodo de espera, **When**
   se le presentan las preguntas, **Then** no recibe exactamente el mismo conjunto de
   preguntas del intento anterior (en la medida en que el banco lo permita).
4. **Given** un candidato que ya tenía "React" validado en nivel intermedio, **When**
   reintenta y su desempeño solo alcanza para básico, **Then** su perfil sigue mostrando
   intermedio.
5. **Given** un candidato que inició un examen y lo interrumpió, **When** vuelve dentro de
   las 24 horas siguientes, **Then** retoma en la pregunta donde se quedó y sus respuestas
   anteriores siguen registradas sin poder modificarse.
6. **Given** un candidato que inició un examen y no lo terminó en 24 horas, **When** el
   plazo vence, **Then** el intento se consume sin otorgarle nivel y empieza su periodo de
   espera.

---

### User Story 4 - Solo se examinan skills elegibles (Priority: P2)

El sistema solo ofrece examen de skills que el candidato declaró en su perfil y que tienen
suficientes preguntas capturadas; en cualquier otro caso lo impide y explica por qué.

**Why this priority**: Hoy la mayoría de los skills del catálogo tienen cero preguntas
capturadas. Sin esta salvaguarda, un candidato puede quemar su único intento en un examen
de dos preguntas que no valida nada — un daño difícil de revertir dado el periodo de
espera.

**Independent Test**: Se puede probar de forma independiente intentando iniciar el examen
de (a) un skill no declarado en el perfil y (b) un skill declarado pero sin preguntas
suficientes, confirmando que ambos casos se bloquean con un mensaje que explica el motivo.

**Acceptance Scenarios**:

1. **Given** un skill que el candidato no declaró en su perfil, **When** intenta iniciar
   su examen, **Then** el sistema lo impide.
2. **Given** un skill declarado cuyo banco no alcanza el mínimo requerido, **When** el
   candidato lo consulta, **Then** el sistema lo muestra como "aún no disponible" en vez
   de ofrecerle iniciar el examen.
3. **Given** un skill que pasa a tener suficientes preguntas capturadas, **When** el
   candidato vuelve a consultar sus skills, **Then** ese examen ya aparece disponible.

---

### Edge Cases

- ¿Qué pasa si el candidato abandona el examen a la mitad (cierra el navegador, pierde
  conexión)? Puede retomarlo donde se quedó dentro de las **24 horas** siguientes a
  haberlo iniciado; las respuestas ya enviadas siguen siendo definitivas. Pasado ese
  plazo el examen expira: el intento se consume, no se otorga nivel para ese skill, y
  comienza el periodo de espera.
- ¿Qué pasa si el candidato obtiene un puntaje bajo? **Todo examen terminado otorga al
  menos el nivel básico**; no existe el resultado "terminé el examen y no validé nada".
- ¿Qué pasa si reintenta después del periodo de espera y le va peor que la vez anterior?
  **Se conserva el mejor nivel alcanzado**; un reintento de menor desempeño no baja lo
  que ya tenía validado.
- ¿Qué pasa si el admin edita o borra preguntas después de que alguien ya las respondió?
  Los resultados ya emitidos no cambian — quedan congelados tal como se calcularon.
- ¿Qué pasa si el candidato quita de su perfil un skill que ya había validado? El nivel
  deja de mostrarse (porque el skill ya no está en su perfil) pero el resultado se
  conserva; si vuelve a declarar ese skill, el nivel reaparece sin volver a examinarse.
- ¿Qué pasa si el candidato abre dos exámenes a la vez en dos pestañas? Solo puede tener
  un examen en curso a la vez; el sistema no inicia un segundo examen mientras haya uno
  abierto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST mostrarle al candidato, para cada skill declarado en su
  perfil, si está validado (con su nivel y fecha) o pendiente de validar.
- **FR-002**: El sistema MUST NOT permitir presentar examen de un skill que el candidato
  no tiene declarado en su perfil.
- **FR-003**: El sistema MUST NOT ofrecer ni permitir iniciar el examen de un skill cuyo
  banco de preguntas no alcance el mínimo requerido, y MUST comunicar que ese examen aún
  no está disponible.
- **FR-004**: El sistema MUST presentar preguntas de opción múltiple tomadas del banco
  correspondiente a ese skill.
- **FR-005**: El sistema MUST NOT revelarle al candidato cuál es la respuesta correcta de
  una pregunta antes de que la conteste, por ningún medio que llegue a su dispositivo.
- **FR-006**: El sistema MUST NOT permitir modificar una respuesta ya enviada dentro del
  mismo examen.
- **FR-007**: El sistema MUST calcular el resultado de forma independiente a cualquier
  cálculo o afirmación que provenga del dispositivo del candidato.
- **FR-008**: El sistema MUST traducir el desempeño del candidato a uno de tres niveles:
  básico, intermedio o avanzado.
- **FR-009**: Al terminar el examen, el sistema MUST mostrarle su resultado al candidato
  de inmediato.
- **FR-010**: El sistema MUST asociar el nivel obtenido al skill correspondiente en el
  perfil del candidato, y MUST hacerlo visible públicamente a cualquiera que vea ese
  perfil.
- **FR-011**: El sistema MUST NOT permitir un nuevo intento del mismo skill dentro del
  periodo de espera, y MUST informarle al candidato a partir de cuándo podrá reintentar.
- **FR-012**: El sistema MUST conservar, por cada intento terminado, qué preguntas se
  presentaron y qué respondió el candidato, de modo que el resultado pueda reconstruirse y
  auditarse después.
- **FR-013**: El sistema MUST NOT permitir que el candidato altere su propio resultado
  (nivel, puntaje o fecha de validación).
- **FR-014**: El sistema MUST NOT presentarle al candidato exactamente el mismo conjunto
  de preguntas que en su **intento inmediatamente anterior** del mismo skill, en la medida
  en que el tamaño del banco lo permita. No se exige memoria más allá de ese intento: un
  tercer intento **MAY** volver a coincidir con el primero, y eso no incumple este
  requisito.
- **FR-015**: El sistema MUST NOT permitir reenviar ni continuar un examen ya terminado.
- **FR-016**: El sistema MUST mantener sin cambios los niveles ya validados cuando el
  banco de preguntas se edite o se reduzca posteriormente.
- **FR-017**: El sistema MUST NOT permitir que un candidato tenga más de un examen en
  curso al mismo tiempo.
- **FR-018**: El sistema MUST permitir retomar un examen interrumpido en el punto donde se
  quedó, dentro de las 24 horas siguientes a haberlo iniciado, conservando como
  definitivas las respuestas ya enviadas.
- **FR-019**: El sistema MUST expirar un examen que no se termine dentro de esa ventana:
  el intento se consume, no se otorga nivel para ese skill, y comienza el periodo de
  espera.
- **FR-020**: El sistema MUST otorgar al menos el nivel básico a todo examen terminado,
  sin importar el desempeño.
- **FR-021**: El sistema MUST mostrar en el perfil el mejor nivel que el candidato haya
  alcanzado para ese skill, y MUST NOT reducirlo a partir de un reintento de menor
  desempeño.

### Key Entities

- **Intento de examen**: representa una presentación completa de un examen por parte de un
  candidato sobre un skill. Atributos clave: quién, qué skill, cuándo, qué preguntas se le
  presentaron, qué respondió, el desempeño obtenido y el nivel resultante. Es el registro
  auditable de lo que ocurrió.
- **Nivel validado**: el resultado vigente que se muestra en el perfil para un skill dado —
  el **mejor** nivel que el candidato haya alcanzado en ese skill, y desde cuándo lo tiene
  (la fecha del intento en que lo alcanzó por primera vez). Es lo que ven las empresas.
- **Elegibilidad de examen**: por cada skill declarado del candidato, si puede presentarlo
  ahora, y si no, por qué (no hay banco suficiente, o está dentro del periodo de espera y
  desde cuándo podrá).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un candidato puede pasar de su perfil a tener un nivel validado en menos de
  10 minutos, sin ayuda externa.
- **SC-002**: El 100% de los intentos de iniciar un segundo examen del mismo skill dentro
  del periodo de espera son bloqueados, informando la fecha de reintento.
- **SC-003**: Un candidato que inspeccione toda la información que recibe su dispositivo
  durante el examen no puede determinar la respuesta correcta de ninguna pregunta antes de
  contestarla.
- **SC-004**: El 100% de los intentos de examinar un skill no declarado o con banco
  insuficiente son bloqueados con un mensaje que explica el motivo.
- **SC-005**: El 100% de los intentos terminados pueden reconstruirse después (qué se
  preguntó y qué se respondió) para revisar o auditar un resultado en disputa.
- **SC-006**: Un nivel validado es visible en el perfil público inmediatamente después de
  terminar el examen, sin que el candidato tenga que hacer nada adicional.

## Assumptions

- Cada examen presenta **10 preguntas**, tomadas al azar del banco de ese skill, mezclando
  las distintas dificultades disponibles. Todas las preguntas pesan igual en el resultado
  (la dificultad etiquetada no pondera el puntaje).
- Los umbrales de nivel son: **90% o más → avanzado**, **70% o más → intermedio**,
  **por debajo de 70% → básico**. No hay umbral mínimo: todo examen terminado otorga al
  menos básico (FR-020).
- **Trade-off aceptado conscientemente**: la ventana de 24 horas para retomar un examen
  (FR-018) permite que un candidato lo interrumpa a propósito para investigar las
  preguntas que aún no ha contestado. Las ya contestadas no se pueden cambiar (FR-006), lo
  que acota el problema pero no lo elimina. Se eligió así para no castigar fallas técnicas
  reales, sabiendo el riesgo — no es un descuido que haya que "arreglar" después sin
  revisar esta decisión.
- El **periodo de espera** para reintentar un skill es de **30 días** desde el intento
  anterior.
- Un skill necesita al menos **20 preguntas** capturadas para habilitarse (el doble de un
  examen, para que un reintento pueda diferir del primer intento).
- El examen **no tiene límite de tiempo** en esta primera versión.
- El nivel validado por examen es **independiente** del campo de seniority auto-declarado
  del perfil (junior / semi senior / senior); ambos pueden coexistir y no se reconcilian
  entre sí.
- No hay vista administrativa para revisar, anular o exportar resultados en esta feature;
  la auditabilidad (FR-012) se refiere a que el dato quede conservado, no a que exista una
  pantalla para consultarlo.
- No hay notificaciones (correo o in-app) al validar un skill ni al cumplirse el periodo de
  espera.
- El banco de preguntas y el catálogo de skills ya existen (feature
  `001-exam-question-form`); esta feature los consume sin modificarlos.

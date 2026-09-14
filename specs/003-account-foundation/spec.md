# Feature Specification: Fundación de cuentas — tipo de cuenta, superadmin y catálogo de skills aprobado

**Feature Branch**: `003-account-foundation`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "Parte 1 (fundación) del requerimiento 'Cuentas de candidato y empresa': toda cuenta es candidato o empresa; el permiso de superadmin se separa de las keywords del scraper; los skills solo salen de un catálogo aprobado, con alias y conversión automática de los skills en texto libre, propuesta de skills nuevos que el superadmin aprueba o rechaza, y sin poder borrar skills en uso; la foto es obligatoria para toda cuenta; solo el superadmin cambia el tipo de una cuenta; las cuentas de empresa no presentan exámenes; y el scraper deja de asignar vacantes de una empresa a la cuenta de una persona con el mismo nombre."

## Clarifications

### Session 2026-09-13

- Q: ¿La pantalla del superadmin para cambiar el tipo de una cuenta se construye en esta feature? → A: No. Esa pantalla vivirá en la aplicación interna de AvoTalent (Avocado Studio), no en la comunidad, y no se trabaja ahora. En esta feature solo quedan la regla y el registro de cambios (cómo se ejecuta el cambio mientras tanto: ver la tercera pregunta).
- Q: ¿Dónde vive la pantalla donde el superadmin revisa las propuestas de skills? → A: En Avocado Studio, en una feature posterior. Mientras tanto, el superadmin aprueba, rechaza o une propuestas directamente en la base de datos.
- Q: ¿El cambio de tipo de cuenta también se hace a mano en la base de datos mientras no existe la pantalla en Avocado Studio? → A: Sí. No se construye operación de backend para cambiar el tipo; el superadmin lo hace en la base de datos, y la propia base de datos garantiza el registro del cambio y sus reglas.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El candidato solo elige skills del catálogo aprobado (Priority: P1)

Un candidato, al hacer su onboarding o al editar su perfil en ajustes, agrega sus skills
eligiéndolos de un catálogo de skills aprobados. Ya no puede escribir un skill libre que no
exista en el catálogo. Si escribe una variante conocida de un skill (por ejemplo "React.js"
o "reactjs"), el sistema la reconoce como el skill del catálogo correspondiente ("React").

**Why this priority**: Es la base de todo lo demás. Un skill que no está en el catálogo no
puede tener examen, no puede exigirse en una vacante y no sirve para que una empresa
busque candidatos. Mientras existan skills libres, el nivel validado no es comparable entre
personas.

**Independent Test**: Iniciar sesión como candidato, abrir onboarding o ajustes, intentar
guardar un skill que no está en el catálogo (debe rechazarse) y guardar uno escrito como
variante (debe quedar guardado como el skill del catálogo).

**Acceptance Scenarios**:

1. **Given** un candidato en onboarding, **When** busca un skill, **Then** solo se le
   ofrecen skills aprobados del catálogo.
2. **Given** un candidato que escribe "React.js", **When** lo agrega, **Then** queda
   guardado como el skill "React" del catálogo, sin duplicarse si ya lo tenía.
3. **Given** un candidato que intenta guardar su perfil con un skill que no existe en el
   catálogo aprobado (por ejemplo, manipulando la petición), **When** el sistema recibe los
   datos, **Then** los rechaza con un mensaje claro y no guarda nada.
4. **Given** un candidato ya registrado que tiene guardado un skill fuera del catálogo que
   coincide con un alias conocido, **When** se aplica la conversión, **Then** su perfil queda
   con el skill del catálogo y conserva todos sus demás datos.
5. **Given** un candidato ya registrado con un skill fuera del catálogo que no coincide con
   ningún alias, **When** entra a la aplicación, **Then** se le pide resolver solo ese skill
   (elegir uno del catálogo, proponerlo o quitarlo), con el resto de su perfil precargado.

---

### User Story 2 - Proponer un skill que falta y que el superadmin lo apruebe (Priority: P1)

Un candidato necesita un skill que no existe en el catálogo. Lo propone; el skill queda
pendiente y todavía no se puede usar. El superadmin revisa las propuestas pendientes y
decide: aprobarlo (queda disponible para todos), rechazarlo, o reconocerlo como otra forma
de escribir un skill que ya existe (se convierte en alias de ese skill). El candidato ve en
qué quedó su propuesta. La pantalla de revisión vivirá en Avocado Studio en una feature
posterior; mientras tanto, el superadmin toma estas decisiones directamente en la base de
datos, y el sistema debe reflejarlas correctamente.

**Why this priority**: Sin esta salida, restringir al catálogo (US1) deja atrapados a los
candidatos cuyo skill real no está en las 37 entradas actuales. Las dos historias juntas
forman el mínimo viable.

**Independent Test**: Como candidato, proponer un skill inexistente y comprobar que no
aparece como seleccionable; aprobarlo directamente en la base de datos; como candidato, comprobar que ya
se puede agregar.

**Acceptance Scenarios**:

1. **Given** un candidato que busca un skill que no existe, **When** lo propone, **Then**
   la propuesta queda como "pendiente", el candidato ve ese estado y el skill no se agrega a
   su perfil ni aparece en el catálogo seleccionable.
2. **Given** una propuesta pendiente, **When** el candidato continúa su onboarding, **Then**
   puede terminarlo con sus skills aprobados; la propuesta no lo bloquea.
3. **Given** una propuesta pendiente, **When** el superadmin la aprueba, **Then** el skill
   pasa a estar disponible para todos los candidatos y quien lo propuso puede agregarlo.
4. **Given** un superadmin frente a una propuesta que es otra forma de escribir un skill
   existente (por ejemplo "nodejs" frente a "Node.js"), **When** el superadmin la une a ese skill, **Then**
   el texto propuesto queda como alias del skill existente y no se crea un skill nuevo.
5. **Given** una propuesta, **When** el superadmin la rechaza con un motivo, **Then** el
   candidato ve que fue rechazada y el motivo, y el skill no queda disponible.
6. **Given** alguien que propone un skill que ya está pendiente por otra persona, **When**
   envía la propuesta, **Then** no se crea una propuesta duplicada: queda registrado como
   interesado en la misma.
7. **Given** un skill aprobado que ya usa al menos un candidato, un nivel validado o una
   pregunta de examen, **When** alguien intenta eliminarlo, **Then** el sistema lo impide.

---

### User Story 3 - Cada cuenta es candidato o empresa, y solo el superadmin la cambia (Priority: P1)

Toda cuenta de AvoTalent tiene un tipo: candidato o empresa. Las personas registradas hoy
son candidatos; los perfiles de empresa creados por el scraper son empresas. El tipo decide
qué puede hacer la cuenta: una cuenta de empresa no presenta exámenes de skills ni pasa por
el onboarding de candidato. Ningún usuario puede cambiar su propio tipo; solo el superadmin
puede hacerlo. La pantalla para hacerlo vivirá en la aplicación interna de AvoTalent
(Avocado Studio) y queda fuera de esta feature. Mientras tanto, el superadmin hace el cambio
directamente en la base de datos, que registra cada cambio y hace cumplir sus reglas. El permiso de superadmin es un permiso
propio, independiente de las palabras clave de puesto que guarda el scraper.

**Why this priority**: Todas las partes siguientes del requerimiento (registro de empresa,
miembros, búsqueda de candidatos) dependen de que el tipo de cuenta exista y sea confiable.

**Independent Test**: Verificar que las cuentas existentes quedaron con el tipo correcto;
intentar iniciar un examen con una cuenta de empresa (debe rechazarse); cambiar en la base
de datos el tipo de una cuenta de prueba y comprobar que queda registrado; como usuario
normal, intentar cambiar el propio tipo desde la aplicación, por ejemplo al editar su perfil
(no debe cambiar).

**Acceptance Scenarios**:

1. **Given** las cuentas existentes, **When** se introduce el tipo de cuenta, **Then** toda
   cuenta de persona queda como candidato y todo perfil de empresa del scraper queda como
   empresa, sin cuentas sin tipo.
2. **Given** una cuenta de empresa, **When** intenta iniciar un examen de skill o consultar
   su elegibilidad, **Then** el sistema lo rechaza indicando que los exámenes son solo para
   candidatos.
3. **Given** un usuario de la aplicación, **When** intenta cambiar el tipo de cualquier
   cuenta, incluida la suya (por ejemplo, enviándolo al editar su perfil), **Then** el tipo no
   cambia.
4. **Given** un superadmin trabajando en la base de datos, **When** cambia una cuenta de
   candidato a empresa indicando un motivo, **Then** el cambio queda aplicado y registrado
   (quién, cuándo, de qué tipo a qué tipo y por qué); sin motivo, el cambio no se aplica.
5. **Given** una cuenta que el superadmin convirtió de empresa a candidato, **When** esa
   persona entra, **Then** se le pide completar el onboarding de candidato.
6. **Given** las personas que hoy tienen permiso de administrador, **When** se separa el
   permiso de superadmin, **Then** conservan su acceso (incluido el formulario de captura de
   preguntas) y ninguna palabra clave del scraper otorga ni quita ese permiso.

---

### User Story 4 - La foto es obligatoria para toda cuenta (Priority: P2)

Ninguna cuenta con sesión iniciada puede usar la aplicación sin foto. Si le falta, se le
lleva a completar su perfil, igual que ya ocurre con los demás datos obligatorios. Esta
verificación de perfil completo aplica en todas las pantallas de la cuenta, incluidas
ajustes, guardados y notificaciones, que hoy quedan fuera.

**Why this priority**: Es una corrección de coherencia (onboarding exige foto pero la
verificación no) y cierra el hueco de pantallas no protegidas, pero no desbloquea por sí
misma nuevas capacidades.

**Independent Test**: Iniciar sesión con un candidato con todos sus datos menos la foto y
comprobar que se le lleva a completar su perfil tanto desde el feed como entrando directo a
ajustes, guardados o notificaciones.

**Acceptance Scenarios**:

1. **Given** un candidato con todos los datos obligatorios excepto la foto, **When** entra a
   cualquier pantalla de la aplicación que requiera sesión, **Then** se le lleva a completar
   su perfil con sus datos existentes precargados.
2. **Given** un candidato en ajustes, **When** intenta quitar su foto o dejar vacío otro dato
   obligatorio, **Then** ajustes se lo impide en ese mismo momento, sin expulsarlo después.
3. **Given** un candidato que vuelve a completar su perfil, **When** termina, **Then**
   ninguno de los datos que ya tenía se perdió.

---

### User Story 5 - El scraper nunca asigna vacantes a la cuenta de una persona (Priority: P2)

Cuando el scraper encuentra una vacante de una empresa, la asocia a la cuenta de esa
empresa. Si ya existe una cuenta de persona cuyo nombre de usuario coincide con el nombre
de la empresa, el scraper no usa esa cuenta: usa o crea una cuenta de empresa distinta.

**Why this priority**: Es un error vivo que puede publicar vacantes ajenas en el perfil de
una persona, pero hoy no ocurre en los datos existentes.

**Independent Test**: Crear un candidato de prueba con el nombre de usuario de una empresa,
sincronizar una vacante de esa empresa y comprobar que la vacante no queda en el perfil del
candidato.

**Acceptance Scenarios**:

1. **Given** un candidato con nombre de usuario "acme", **When** el scraper sincroniza una
   vacante de la empresa "Acme", **Then** la vacante queda asociada a una cuenta de tipo
   empresa y no al candidato.
2. **Given** una cuenta de empresa existente, **When** el scraper sincroniza otra vacante de
   la misma empresa, **Then** la asocia a esa misma cuenta de empresa sin crear duplicados.

---

### Edge Cases

- ¿Qué pasa si dos personas proponen el mismo skill escrito distinto ("Rust" y "rust-lang")?
  Se normaliza el texto al comparar; si igual quedan dos propuestas, el superadmin puede
  unir una como alias de la otra al aprobar.
- ¿Qué pasa si una propuesta coincide con un alias ya existente? No se crea propuesta: el
  candidato recibe directamente el skill del catálogo.
- ¿Qué pasa si se vuelve a proponer un skill ya rechazado? Se informa que ese skill fue
  rechazado y no se crea una propuesta nueva; el superadmin puede aprobarlo después si cambia
  de criterio.
- ¿Qué pasa si un candidato quita del perfil el único skill aprobado que tenía y solo le
  quedan propuestas pendientes? No puede guardar: se requiere al menos un skill aprobado.
- ¿Qué pasa con los niveles validados de un candidato que el superadmin convierte en
  empresa? Se conservan en su historial pero dejan de mostrarse y la cuenta ya no puede
  presentar exámenes.
- ¿Qué pasa si una cuenta de empresa tiene un examen en curso en el momento de la
  conversión? El intento deja de poder continuarse.
- ¿Qué pasa si se quita el permiso de superadmin a la última persona que lo tiene? El
  sistema lo impide: siempre debe quedar al menos un superadmin.
- ¿Qué pasa si el superadmin intenta cambiar su propia cuenta a empresa? Se permite solo si
  queda otro superadmin; una cuenta de empresa no conserva el permiso de superadmin.
- ¿Qué pasa si una persona sin foto está en medio de un examen? Al volver se le pide la
  foto antes de continuar; el tiempo del examen sigue corriendo como siempre.

## Requirements *(mandatory)*

### Functional Requirements

**Tipo de cuenta y superadmin**

- **FR-001**: Toda cuenta MUST tener exactamente un tipo: `candidato` o `empresa`.
- **FR-002**: Al introducir el tipo, las cuentas de persona existentes MUST quedar como
  candidato y los perfiles de empresa generados por el scraper MUST quedar como empresa.
- **FR-003**: Las cuentas creadas por el registro público actual MUST quedar como candidato.
- **FR-004**: Ninguna operación de la aplicación MUST permitir cambiar el tipo de una cuenta.
  En esta feature el cambio lo hace el superadmin directamente en la base de datos (la
  pantalla vivirá en Avocado Studio en una feature posterior), y la base de datos MUST exigir
  un motivo y MUST registrar cada cambio con autor, fecha, tipo anterior, tipo nuevo y motivo.
- **FR-005**: El permiso de superadmin MUST ser un atributo propio de la cuenta, separado de
  las palabras clave de puesto que guarda el scraper; ninguna palabra clave MUST otorgarlo.
- **FR-006**: Las cuentas que hoy tienen permiso de administrador MUST convertirse en
  superadmin y conservar el acceso a lo que hoy pueden hacer.
- **FR-007**: La base de datos MUST impedir que se quite el permiso de superadmin a la última
  cuenta que lo tiene, y MUST impedir que una cuenta de empresa tenga ese permiso.
- **FR-008**: Una cuenta de empresa MUST NOT poder consultar su elegibilidad, iniciar ni
  continuar un examen de skill.
- **FR-009**: Cuando una cuenta pasa de empresa a candidato, MUST pedírsele completar el
  onboarding de candidato antes de usar la aplicación.

**Catálogo de skills**

- **FR-010**: Cada skill del catálogo MUST tener un estado: `aprobado`, `pendiente` o
  `rechazado`. Los 37 skills actuales MUST quedar como aprobados.
- **FR-011**: Un skill MUST poder tener alias (formas alternativas de escribirlo); la
  comparación MUST ignorar mayúsculas, espacios sobrantes y signos de puntuación.
- **FR-012**: El perfil de un candidato MUST aceptar únicamente skills aprobados; el sistema
  MUST rechazar cualquier otro valor aunque llegue por fuera de la interfaz.
- **FR-013**: Al agregar un skill escrito como alias, el sistema MUST guardar el skill
  aprobado correspondiente.
- **FR-014**: Todo candidato MUST tener al menos un skill aprobado en su perfil.
- **FR-015**: Los skills fuera del catálogo que ya existan en perfiles MUST convertirse
  automáticamente cuando coincidan con un skill aprobado o un alias; los que no coincidan
  MUST presentarse al candidato para que los resuelva (elegir uno aprobado, proponerlo o
  quitarlo), sin modificar el resto de su perfil.
- **FR-016**: Un candidato MUST poder proponer un skill que no existe; la propuesta MUST
  quedar pendiente, con quién la propuso y cuándo, y MUST NOT poder usarse hasta aprobarse.
- **FR-017**: Una propuesta de un skill ya pendiente MUST sumar al proponente como
  interesado en lugar de crear un duplicado; una propuesta que coincide con un skill
  aprobado o un alias MUST resolverse directamente con ese skill; una propuesta de un skill
  rechazado MUST informarse como rechazada sin crear otra.
- **FR-018**: Un candidato MUST poder ver el estado de sus propuestas (pendiente, aprobada,
  unida a otro skill o rechazada con motivo).
- **FR-019**: Cada candidato MUST poder tener como máximo 5 propuestas pendientes a la vez.
- **FR-020**: El superadmin MUST poder aprobar una propuesta, rechazarla con motivo o unirla
  como alias de un skill aprobado existente, y cada decisión MUST registrar quién y cuándo. En
  esta feature no hay pantalla ni operación de aplicación para esto: las decisiones se toman
  directamente en la base de datos (la pantalla vivirá en Avocado Studio en una feature
  posterior). Por eso la base de datos MUST impedir por sí misma los estados inválidos: un
  rechazo sin motivo, un alias repetido entre skills o un alias apuntando a un skill no
  aprobado. El número de interesados de cada propuesta MUST poder consultarse.
- **FR-021**: El sistema MUST impedir eliminar un skill que esté en uso por algún perfil,
  nivel validado, intento de examen o pregunta del banco.
- **FR-022**: Un skill recién aprobado MUST aparecer como "aún no disponible" para examen
  hasta que su banco tenga el mínimo de preguntas ya definido por la feature de exámenes.
- **FR-023**: Todo texto libre de esta feature (nombre propuesto, alias, motivo de rechazo,
  motivo de cambio de tipo) MUST guardarse sin espacios sobrantes al inicio y al final, y
  MUST rechazarse si queda vacío.

**Foto y perfil completo**

- **FR-024**: La foto MUST ser un dato obligatorio para toda cuenta con sesión.
- **FR-025**: La verificación de perfil completo MUST incluir la foto y MUST aplicarse en
  todas las pantallas que requieren sesión, incluidas ajustes, guardados y notificaciones.
- **FR-026**: Al llevar a una persona a completar su perfil, MUST precargarse todo lo que ya
  tenga y MUST pedirse solo lo que falta; completar el perfil MUST NOT borrar datos.
- **FR-027**: Ajustes MUST impedir guardar un dato obligatorio vacío, incluida la foto,
  mostrando el error en el propio formulario.

**Scraper**

- **FR-028**: Al asociar una vacante a una empresa, el scraper MUST usar únicamente cuentas de
  tipo empresa y MUST NOT usar una cuenta de candidato aunque su nombre de usuario coincida.
- **FR-029**: Si el nombre de usuario natural de la empresa ya lo ocupa una cuenta de
  candidato, el scraper MUST crear o reutilizar una cuenta de empresa con un nombre de usuario
  distinto y estable, sin duplicar empresas en sincronizaciones posteriores.
- **FR-030**: Las cuentas creadas por el scraper MUST NOT recibir el permiso de superadmin.

### Key Entities

- **Cuenta**: una persona o una empresa en AvoTalent. Atributos nuevos: tipo (candidato o
  empresa) y si tiene permiso de superadmin.
- **Cambio de tipo de cuenta**: registro de cada cambio: cuenta, tipo anterior, tipo nuevo,
  motivo, superadmin que lo hizo y fecha.
- **Skill**: entrada del catálogo. Atributos: nombre, etiqueta visible, estado (aprobado,
  pendiente, rechazado), quién lo propuso, quién lo revisó, cuándo, y motivo si se rechazó.
- **Alias de skill**: forma alternativa de escribir un skill aprobado; pertenece a un solo
  skill y no puede repetirse entre skills.
- **Interesado en propuesta**: relación entre un candidato y un skill pendiente que propuso
  o al que se sumó; permite avisarle el resultado y contar el interés.
- **Perfil de candidato** (existente): su lista de skills pasa a contener solo skills
  aprobados del catálogo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Después de la conversión, el 100% de los skills en perfiles de candidatos
  pertenecen al catálogo aprobado o están pendientes de que su dueño los resuelva.
- **SC-002**: El 100% de las cuentas tienen tipo asignado; ninguna cuenta queda sin tipo.
- **SC-003**: El 0% de los intentos de guardar un skill no aprobado, de cambiar un tipo desde
  la aplicación, de cambiar un tipo sin motivo o de iniciar un examen con una cuenta de empresa tienen éxito.
- **SC-004**: Un candidato puede proponer un skill en menos de 30 segundos sin salir de la
  pantalla donde está editando sus skills.
- **SC-005**: El 100% de las decisiones del superadmin sobre propuestas (aprobar, unir o
  rechazar) se reflejan al candidato la siguiente vez que consulta sus skills, sin ningún paso
  adicional.
- **SC-006**: El 100% de las cuentas con sesión que no tienen foto son llevadas a completar su
  perfil, entren por la pantalla que entren.
- **SC-007**: Ninguna vacante sincronizada por el scraper queda asociada a una cuenta de
  candidato.

## Assumptions

- **Datos actuales** (consultados el 2026-09-13): 17 cuentas (5 personas, 12 empresas del
  scraper); ningún perfil tiene hoy skills fuera del catálogo; 3 personas no tienen foto y
  serán llevadas a completar su perfil al entrar; solo 2 cuentas tienen permiso de
  administrador. La conversión de skills (FR-015) se construye igual para los datos futuros,
  pero hoy no debería tocar ningún perfil.
- **"Superadmin"** es exclusivamente personal de AvoTalent: el mismo administrador de
  plataforma que hoy captura preguntas de examen. No es un rol de empresa. El "admin de
  empresa" (parte 3 del requerimiento) es un concepto distinto que solo administra su propia
  empresa y nunca tiene permisos de superadmin.
- **Notificaciones**: el sistema de notificaciones dentro de la app llega en una feature
  posterior. Mientras tanto, el superadmin consulta las propuestas pendientes directamente en
  la base de datos y el candidato ve el estado de sus propuestas junto a sus skills. Cuando exista
  el sistema de notificaciones, estos eventos se conectarán a él.
- **Área de administración**: las pantallas de superadmin (cambio de tipo de cuenta y revisión
  de propuestas de skills) vivirán en la aplicación interna de AvoTalent (Avocado Studio) y
  están fuera de alcance.
- **Alias iniciales**: el catálogo arranca con un conjunto de alias obvios para los 37 skills
  (por ejemplo "reactjs" y "react.js" para React, "nodejs" para Node.js); el superadmin agrega
  más al unir propuestas.
- **Solo candidatos proponen skills** en esta feature. Las empresas usarán el catálogo
  cuando existan vacantes con nivel mínimo (feature posterior).
- **Perfiles de persona del scraper**: el scraper puede generar perfiles de personas; hoy no
  hay ninguno en los datos. Si aparecen, se tratan como candidatos que no pueden iniciar
  sesión, y sus palabras clave de puesto no afectan permisos.
- **Fuera de alcance**: las pantallas de superadmin en Avocado Studio (cambio de tipo de
  cuenta y revisión de propuestas de skills). Y las partes
  posteriores del requerimiento: registro y verificación de
  empresas, miembros y roles de empresa, bloqueo de invitaciones por tipo de cuenta, ajustes
  y perfiles de empresa, guardados, seguir, notificaciones, búsqueda de candidatos, vacantes
  con nivel mínimo y postulaciones internas.
- **Dependencias**: se reutilizan el catálogo de skills y el banco de preguntas de la feature
  001, y la elegibilidad y los niveles validados de la feature 002.

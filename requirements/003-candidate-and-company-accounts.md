# Requerimiento 003 — Cuentas de candidato y empresa

| | |
|---|---|
| **Origen** | Plantilla de requerimiento, refinada con producto en tres rondas de preguntas y respuestas |
| **Fecha** | 2026-09-13 |
| **Spec derivada** | [`specs/003-account-foundation/`](../specs/003-account-foundation/spec.md), que cubre **solo la parte 1** (fundación) |
| **Estado** | Parte 1: plan terminado, **siguiente paso `/speckit-tasks`**; partes 2 a 7 pendientes (ver "Estado actual y cómo retomar") |

Este requerimiento es más grande que una feature. Al final propone siete partes, y cada una
tendrá su propia spec. El texto de abajo es la **versión final**, con las tres rondas de
respuestas ya integradas.

Petición original de producto: *"un requerimiento para todo el onboarding de un usuario nuevo o
empresa, tanto nuevos como registrados, para conectar todo pasando por /onboarding para los 2
tipos, por /settings para los 2 tipos, por profile mejorándolo para ambas, lo de saved para
ambas, y /notifications para ambas, todo esto conectándolo igual para lo del tema de
exámenes"*.

## Estado actual y cómo retomar

*Actualizado: 2026-09-13.* Actualiza esta sección cada vez que avance o se pause el trabajo.

### Dónde está el trabajo

| | |
|---|---|
| **Rama** | `003-account-foundation`, creada desde `master` en el commit `1751335`, que ya incluye las features 001 y 002. Subida a GitHub (`origin/003-account-foundation`) |
| **Carpeta de la spec** | `specs/003-account-foundation/`. `.specify/feature.json` apunta a ella, pero ese archivo **no se sube a git** (`.specify/.gitignore`). En otra máquina o en un clon nuevo hay que crearlo (ver "Cómo retomar", paso 2) |
| **Commits** | Dos commits de documentación: la carpeta `requirements/` y los artefactos de spec y plan de la parte 1. Todavía no hay código |

### Avance del flujo spec-kit (parte 1: fundación)

| Paso | Estado | Resultado |
|---|---|---|
| `/speckit-specify` | ✅ Hecho | `spec.md`: 5 historias, 30 requisitos, 7 criterios de éxito. Checklist de calidad 16/16 |
| `/speckit-clarify` | ✅ Hecho | 3 preguntas respondidas (ver "Cambios posteriores al requerimiento", abajo) |
| `/speckit-plan` | ✅ Hecho | `plan.md`, `research.md` (14 decisiones), `data-model.md`, `contracts/` (2), `quickstart.md`. Pasa los 6 principios de la constitución |
| `/speckit-tasks` | ⏳ **Siguiente paso** | Genera `tasks.md` |
| `/speckit-analyze` | Pendiente | Revisa que spec, plan y tareas sean consistentes, antes de implementar |
| `/speckit-implement` | Pendiente | Código y pruebas: un commit por tarea |
| Migración SQL | Pendiente | `backend/sql/account-foundation-migration.sql` se crea al implementar, y **la aplica una persona a mano** en el editor SQL de Supabase |
| Verificación manual | Pendiente | Nivel 6 de `quickstart.md` |

### Decisiones que faltan antes o durante `/speckit-tasks`

1. **`backend/scripts/sync-to-community.ts`** tiene una copia de `getOrCreateCompanyUser` con
   el mismo error de colisión de nombres. Hay que decidir si se corrige (que importe la función
   del servicio) o se deja fuera. Por defecto **no** está incluido.
2. **Cambios a código de features ya terminadas.** Están listados en `plan.md`, sección
   "Cambios a código existente". Hay que reconocerlos antes de implementar:
   - 001: `requireRole('admin')` pasa a `requireSuperadmin`, y el formulario toma los skills del
     catálogo.
   - 002: los exámenes quedan solo para candidatos.
   - `PUT /users/:username` pasa a validar el perfil completo.
   - Onboarding precarga todos los campos.
   - El `'admin'` sale de `users.roles`.

### Cómo retomar

1. `git fetch origin && git checkout 003-account-foundation`
2. Si no existe `.specify/feature.json` (clon nuevo u otra máquina), crearlo con este contenido.
   Sin él, `/speckit-tasks` falla con "Feature directory not found":
   ```json
   { "feature_directory": "specs/003-account-foundation" }
   ```
3. Leer, en este orden: este requerimiento → `specs/003-account-foundation/spec.md` (sección
   *Clarifications*) → `plan.md` (sección *Constitution Check* y la lista de cambios a código
   existente).
4. Resolver las dos decisiones de arriba.
5. Correr `/speckit-tasks`, luego `/speckit-analyze`, y después `/speckit-implement`.
6. Reglas de trabajo vigentes durante la implementación:
   - un commit por tarea, en formato Conventional Commits y en inglés;
   - correr las pruebas antes de cada commit;
   - la suite completa antes del PR;
   - no hacer push si algo falla.

### Después de la parte 1

Cada parte es su propia feature, con su propio `/speckit-specify` y su propia rama:

| Parte | Contenido | Estado |
|---|---|---|
| 1 | Fundación: tipo de cuenta, superadmin, catálogo de skills aprobado, foto obligatoria, colisión del scraper | En curso (`003-account-foundation`) |
| 2 | Registro de empresa y reclamo con documentos (México) | Pendiente |
| 3 | Miembros de empresa y catálogo global de roles | Pendiente |
| 4 | Settings y perfiles para ambos tipos de cuenta, y navegación a `/examenes` | Pendiente |
| 5 | Seguir, feed de seguidos y guardados personales | Pendiente |
| 6 | Notificaciones dentro de la app | Pendiente |
| 7 | Búsqueda de candidatos por nivel y vacantes con nivel mínimo | Pendiente |
| — | Pantallas de superadmin en Avocado Studio (cambio de tipo de cuenta, revisión de propuestas de skills) | Pendiente, sin fecha |
| — | Postulaciones internas | Fuera de alcance, se planea después |

### Pendientes relacionados, fuera de esta spec

- **Bug de elegibilidad de exámenes (002):** si falla la consulta que cuenta el banco de
  preguntas, el skill se muestra como "Aún no disponible" en vez de reportar un error. Está
  detectado, pero no corregido.
- **002:** falta la verificación manual en navegador de sus 4 historias (tarea T042).
- **001:** falta la verificación manual en navegador (tarea T035).
- **PRs:** están pendientes porque `gh` no está instalado. Los cambios de 001 y 002 se
  mergearon directo a `master`.

## Cambios posteriores al requerimiento

En `/speckit.clarify` de la parte 1 (2026-09-13), producto decidió lo siguiente. **Estas
decisiones cambian parte de lo que dice el texto original:**

1. **Las pantallas de superadmin viven en Avocado Studio (`apps/avocado`), no en la comunidad**,
   y no se construyen todavía. Afecta dos flujos:
   - **Cambio de tipo de cuenta (sección E):** mientras no exista la pantalla, el superadmin lo
     hace a mano en la base de datos.
   - **Revisión de skills propuestos (sección B.3):** también a mano en la base de datos.
2. **La base de datos tiene que hacer cumplir por sí misma las reglas de esas decisiones
   manuales**, porque no hay una pantalla que las valide:
   - motivo obligatorio,
   - registro de quién hizo cada cambio,
   - al menos un superadmin,
   - alias sin duplicar.
3. **El superadmin es exclusivamente personal de AvoTalent.** El admin de empresa (sección D) es
   otro concepto y nunca tiene permisos de superadmin.

---

## Feature name
Cuentas de candidato y empresa: onboarding, perfil, guardados, seguir y notificaciones, conectados a exámenes

## Business context
AvoTalent solo tiene cuentas de candidato. Las "empresas" son perfiles que crea el scraper y nadie puede entrar como una. Los exámenes de skills existen para ayudar a las empresas a elegir talento, pero hoy ninguna empresa puede buscar candidatos por nivel, pedir un nivel mínimo en una vacante ni guardar perfiles. Esta feature abre el lado empresa del marketplace con empresas mexicanas verificadas, pone a candidatos y empresas en el mismo recorrido de cuenta y hace que el nivel validado sirva para contratar.

## Who uses it
- **Candidato nuevo o ya registrado**: busca trabajo, valida sus skills y sigue a empresas y personas.
- **Solicitante de empresa**: la primera persona que reclama o crea una empresa mexicana. Al aprobarse, se convierte en su primer admin.
- **Admin de empresa** (máximo 5 por empresa): gestiona la empresa, sus vacantes y a sus miembros.
- **Miembro de empresa**: persona dada de alta por un admin con un rol del catálogo global de AvoTalent. Sus permisos dependen de ese rol.
- **Superadmin** (AvoTalent):
  - Revisa reclamos de empresa.
  - Cambia el tipo de una cuenta.
  - Aprueba o rechaza skills propuestos.
  - Administra el catálogo de roles.
- **Visitantes**: ven perfiles públicos.

## What should happen (expected flow)

**A. Registro**
1. Al registrarse, la persona elige "Busco trabajo" o "Registrar mi empresa".
2. Confirma su correo y entra directo a `/onboarding` del tipo que eligió.
3. Los miembros de empresa no se registran por su cuenta: entran por invitación (ver D).

**B. Onboarding de candidato** (nuevo, o registrado con datos faltantes)
1. Datos obligatorios: foto, título, categoría de rol, nivel, skills, ubicación y modalidad.
2. Solo se pueden elegir skills **aprobados** del catálogo.
3. **Si el skill que necesita no existe**, la persona lo propone:
   - El skill queda "pendiente" y no se puede usar todavía.
   - El superadmin recibe una notificación para aprobarlo o rechazarlo.
   - La persona recibe una notificación con el resultado. Si se aprueba, ya puede agregarlo.
   - Proponer un skill no bloquea el onboarding: la persona termina con los skills aprobados que sí tiene.
4. **Candidatos ya registrados con skills en texto libre**:
   - Los que coinciden de forma obvia con un skill aprobado (`React.js` → `react`) se convierten solos.
   - Onboarding solo pide resolver los que no coincidieron: elegir uno aprobado, proponerlo o quitarlo.
5. Lo que ya existe aparece precargado; volver a onboarding nunca borra datos.
6. Al terminar, se le invita a validar los skills que tengan examen disponible.

**C. Onboarding y verificación de empresa** (solo empresas mexicanas)
1. El solicitante captura su foto y los datos de la empresa: nombre, RFC, logo, sitio web, descripción, tamaño, industria y ubicación.
2. El sistema busca si la empresa ya existe (perfil del scraper):
   - Si existe y no tiene dueño, la reclama.
   - Si no existe, la crea.
   - Si ya tiene dueño, no puede reclamarla y se le indica pedir acceso a un admin de esa empresa.
3. Sube documentos legales:

   | Qué prueba | Documento |
   |---|---|
   | Que la empresa existe | Acta constitutiva **o** Constancia de Situación Fiscal (SAT) con RFC vigente |
   | Quién la representa | Poder notarial del representante legal, o el acta constitutiva si ahí aparece como socio o administrador |
   | Que el solicitante es esa persona | Identificación oficial vigente (INE o pasaporte) |
   | Si el solicitante no es el representante legal | Carta poder firmada por el representante legal que lo autoriza, más la identificación de quien firma |

   **Mínimo para aprobar**: prueba de que la empresa existe, más la identificación del solicitante, más su vínculo con la empresa.
   **Persona física con actividad empresarial**: basta su Constancia de Situación Fiscal más su INE.
4. Mientras el reclamo está pendiente, la persona ve "En revisión" y no puede actuar en nombre de la empresa.
5. El superadmin revisa y aprueba o rechaza, con motivo:
   - Si aprueba, el solicitante queda como primer admin de la empresa.
   - Si rechaza, recibe el motivo y, si quiere reintentar, sube todo de nuevo.
6. **Los documentos se eliminan en cuanto se aprueba o se rechaza el reclamo**, sin excepción. Solo queda constancia de qué tipos de documento se revisaron, quién revisó, cuándo y el resultado, sin los archivos.
7. Una empresa se reclama una sola vez; los demás accesos se dan desde dentro.

**D. Miembros y roles de empresa**
1. **Catálogo global de roles** que administra el superadmin, igual para todas las empresas; por ejemplo RRHH, Reclutador, Hiring manager.
   - Cada rol define sus permisos: publicar vacantes, buscar candidatos, guardar candidatos.
   - **RRHH** puede publicar vacantes y buscar candidatos.
   - Las empresas no crean roles propios.
2. **Acceso de admin**: incluye todos los permisos, más gestionar miembros y editar la empresa.
3. **Alta**: un admin da de alta a un compañero con correo, rol y tipo de acceso (admin o miembro).
4. **Aceptación**: la persona recibe la invitación, crea su contraseña y completa un onboarding corto con foto, nombre y puesto.
5. **Límites**: máximo 5 admins, miembros sin límite. Una empresa nunca se queda sin admin.
6. **Cambios**: un admin puede cambiar el rol de alguien, hacerlo admin (respetando el máximo) o darlo de baja.
7. **Si el correo invitado ya es una cuenta de candidato**:
   - La invitación queda bloqueada con el estado "Requiere cambio de tipo de cuenta".
   - El superadmin recibe la solicitud.
   - La invitación se completa cuando el superadmin convierte la cuenta.

**E. Cambio de tipo de cuenta**
Solo el superadmin convierte una cuenta de candidato a empresa, o al revés.

**F. Empresas registradas y el scraper**
1. Al aprobarse el reclamo, las vacantes que el scraper ya había publicado para esa empresa **pasan a ser de la empresa**, para que después pueda editarlas.
2. Desde ese momento, el scraper deja de crear, actualizar y sincronizar vacantes de esa empresa.
3. El scraper nunca asocia vacantes a una cuenta de persona por coincidencia de nombre.

**G. Vacantes con nivel mínimo**
1. Quien tenga permiso de publicar (admin o RRHH) puede exigir un nivel mínimo (básico, intermedio o avanzado) por skill aprobado.
2. La vacante muestra los requisitos.
3. Cada candidato ve cuáles cumple, según su nivel validado.

**H. `/settings`**
1. **Candidato**: datos obligatorios y opcionales. No puede dejar vacío un obligatorio. Puede proponer skills y tiene acceso a validar los suyos.
2. **Miembro de empresa**: su perfil personal.
3. **Admin de empresa**: además, los datos de la empresa y la gestión de miembros.

**I. `/profile` y perfiles públicos**
1. **Candidato**: identidad, categoría de rol, skills con nivel validado y fecha, seguidores y seguidos, y sus publicaciones. En su propio perfil ve además la invitación a validar los skills pendientes.
2. **Empresa**: logo, datos, sello de "Empresa verificada", vacantes activas, seguidores y miembros visibles.
3. Cada perfil se muestra según el tipo real de la cuenta, sin importar la URL.

**J. Búsqueda de candidatos** (empresas registradas, solo roles con permiso)
1. Filtros:
   - Skill y nivel validado mínimo.
   - Categoría de rol.
   - Nivel de experiencia.
   - Ubicación.
   - Modalidad.
2. **Todos los candidatos aparecen** en la búsqueda; no hay opción de ocultarse.

**K. `/saved`** (cada persona tiene los suyos)
1. **Candidato**: vacantes y publicaciones guardadas.
2. **Persona de empresa**: sus candidatos guardados, con nivel validado.
3. El candidato no se entera de quién lo guardó.

**L. Seguir**
1. Cualquier cuenta sigue a candidatos y a empresas, y puede dejar de seguir.
2. Lo que publica quien sigues (publicaciones, vacantes, etc.) aparece en tu feed.
3. Seguir a una empresa además notifica sus vacantes nuevas.

**M. `/notifications`** (solo dentro de la app, con contador en la campana y opción de marcar como leídas)
1. **Candidato**:
   - Resultado de un examen.
   - Examen por vencer.
   - Reintento disponible.
   - Vacante nueva de alguien que sigue.
   - Vacante nueva cuyos requisitos cumple.
   - Nuevo seguidor.
   - Skill propuesto aprobado o rechazado.
2. **Solicitante de empresa**: reclamo aprobado o rechazado, con motivo.
3. **Personas de empresa**:
   - Invitación recibida.
   - Alta, baja o cambio de rol.
   - Candidato que cumple los requisitos de una vacante (solo roles con permiso).
   - Nuevo seguidor.
4. **Superadmin**:
   - Reclamo pendiente.
   - Skill propuesto pendiente.
   - Invitación bloqueada que requiere cambio de tipo.

**N. Conexión con exámenes (transversal)**
1. `/examenes` se alcanza desde la navegación, el perfil propio, settings, el cierre de onboarding y las notificaciones.
2. Las cuentas de empresa no presentan exámenes.
3. Un skill recién aprobado no tiene examen hasta que se capturen al menos 20 preguntas para él.
4. El nivel validado alimenta la búsqueda de candidatos, los requisitos de vacante, los guardados de empresa y las notificaciones de coincidencia.

## What should NOT happen (known constraints)
**Empresas y verificación**
- Nadie actúa en nombre de una empresa antes de que se apruebe su reclamo.
- Una empresa no se reclama dos veces, ni por dos personas al mismo tiempo.
- No se aceptan empresas de fuera de México, por ahora.
- Los documentos no son públicos (solo los ven el solicitante y el superadmin) y **no sobreviven a la decisión**: se borran al aprobar y al rechazar.
- Una empresa no tiene más de 5 admins ni se queda sin ninguno.
- Las empresas no crean roles propios.
- Un miembro sin permiso no publica vacantes ni busca candidatos.
- Ningún usuario cambia su propio tipo de cuenta.
- Las cuentas de empresa no presentan exámenes.

**Skills y scraper**
- No hay skills en texto libre, y un skill pendiente o rechazado no se usa en perfiles ni en vacantes.
- **No se borra un skill que ya está en uso** por un candidato, una vacante, un nivel validado o una pregunta de examen.
- El scraper no toca empresas registradas ni asigna vacantes a personas.
- `users.roles` no mezcla permisos con keywords del scraper.

**Privacidad y notificaciones**
- El candidato no ve quién lo guardó.
- No hay notificaciones por correo, por ahora.
- No se duplican notificaciones por el mismo evento.

**Calidad de lo que ya existe**
- Ninguna cuenta queda sin foto.
- Volver a onboarding nunca borra datos.
- No quedan pantallas de muestra en guardados y notificaciones.
- Un fallo técnico momentáneo no muestra un examen como "no disponible".

## Data likely involved
- **Cuenta**: tipo (candidato o empresa) y permiso de superadmin, separado de las keywords del scraper.
- **Empresa**: datos del perfil, RFC, estado (listada por scraper o registrada).
- **Reclamo**: solicitante, empresa, documentos temporales, estado, motivo, revisor y fechas, más la constancia que queda sin archivos.
- **Catálogo de roles**: nombre y permisos, global.
- **Membresía**: usuario, empresa, acceso (admin o miembro), rol, quién invitó, estado (pendiente, bloqueada por tipo, aceptada, dada de baja).
- **Catálogo de skills**: estado (aprobado, pendiente, rechazado), quién lo propuso y quién lo revisó.
- **Alias de skills** para el mapeo automático.
- **Requisitos de vacante**: skill aprobado y nivel mínimo.
- **Dueño de la vacante**: empresa registrada, o scraper si no tiene dueño.
- **Guardados**: persona y lo guardado (vacante, publicación o candidato).
- **Seguimientos**: quién sigue a quién.
- **Notificaciones**: destinatario, tipo, referencia, leída y fecha.
- **Ya existen**: niveles validados, intentos de examen, banco de preguntas.

## Relationship to what already exists
- **Empresas**: filas de `users` con `is_scraper_profile` y `scraper_source = 'company'`, creadas por `getOrCreateCompanyUser` en `backend/services/scraper/sync.ts`, sin usuario de login. Esa función es la que hoy puede pegarle vacantes a una persona.
- **`users.roles`**: guarda tanto `'admin'` (feature 001, `requireRole`) como las keywords del scraper.
- **Onboarding**: `components/onboarding.tsx` y el guard de `components/shell.tsx`. El guard no revisa la foto y no corre fuera de `app/(main)`.
- **Settings**: `SettingsPage` en `components/account-pages.tsx`.
- **Skills**: `SkillsInput` (texto libre) en `components/profile-form-fields.tsx`. El catálogo es la tabla `skills` de la feature 001: 37 filas, sin columna de estado, y hoy solo se modifica por migración. `exam_questions`, `skill_exam_attempts` y `user_skill_levels` ya tienen FK a `skills`, así que la base de datos ya impide borrar esos skills. `users.skills` es `TEXT[]` sin FK, y ahí es donde falta la protección.
- **Guardados**: `user_vacancy_history.is_saved` (el que se usa, solo vacantes) y `community_saved_posts` (sin uso). `/saved` es una muestra fija.
- **Notificaciones**: la tabla `community_notifications` existe sin rutas. `/notifications` es una muestra fija.
- **Seguir**: botones sin handler y sin tabla. El feed no tiene vista de seguidos.
- **Perfiles**: `public-profile-view.tsx` y `empresas/[company]/page.tsx` usan el mismo endpoint y ya muestran niveles validados.
- **Vacantes**: las del scraper viven en `community_posts` tipo job con autor empresa. Las nativas se crean desde `/create`, sin requisitos estructurados.
- **Exámenes**: feature `002-skill-level-exam` completa, sin enlaces hacia `/examenes`.
- **Almacenamiento**: Supabase Storage ya se usa (`services/avatar.ts`). Los documentos requieren un bucket privado con borrado al decidir el reclamo.

## Open questions
Ninguna bloqueante. Quedan dos supuestos para confirmar dentro de cada spec:
1. Un reclamo que se abandona sin enviarse completo también borra sus documentos después de un plazo (propuesta: 7 días).
2. Los roles iniciales del catálogo son RRHH, Reclutador y Hiring manager; solo RRHH trae permisos de publicar y buscar.

## Priority / urgency
**Fuera de alcance, para planearse después:** postulaciones internas y la vista de "vacantes donde participo".

Recomiendo estas features, en orden. Cada una pasa por su propio `/speckit-specify`:

1. **Fundación**:
   - Tipo de cuenta y permiso de superadmin separados de `users.roles`.
   - Catálogo de skills con estados, alias, mapeo automático, propuesta y aprobación, y protección contra borrado.
   - Foto obligatoria en el guard.
   - Que el scraper deje de asignar vacantes a personas.
2. **Registro de empresa y reclamo documental (México)**: cola del superadmin, borrado de documentos al decidir, traspaso de vacantes y salida de la empresa del scraper.
3. **Miembros y catálogo global de roles**: invitaciones, 5 admins, bloqueo por cambio de tipo.
4. **Settings y perfiles para ambos tipos**, más navegación a `/examenes`.
5. **Seguir con feed de seguidos**, y **guardados personales** para ambos tipos.
6. **Notificaciones dentro de la app.**
7. **Búsqueda de candidatos por nivel y vacantes con nivel mínimo.**

Dos correcciones cortas conviene hacerlas antes, porque son bugs vivos:
- La elegibilidad que muestra "Aún no disponible" cuando falla una consulta.
- La colisión de nombres en `getOrCreateCompanyUser`.

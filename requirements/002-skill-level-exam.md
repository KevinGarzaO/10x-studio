# Requerimiento 002 — Validación de nivel por skill mediante examen

| | |
|---|---|
| **Origen** | Plantilla de requerimiento llenada en conversación con el equipo de producto |
| **Fecha** | 2026-09-13 |
| **Spec derivada** | [`specs/002-skill-level-exam/`](../specs/002-skill-level-exam/spec.md) |
| **Estado** | Implementado y mergeado a `master` (falta la verificación manual en navegador) |

Antes de escribir el requerimiento, producto definió cuatro puntos:
- los niveles son básico, intermedio y avanzado;
- hay un intento por skill, con periodo de espera;
- el nivel es público en el perfil;
- solo se examinan los skills declarados.

El texto de abajo es el requerimiento original, sin modificar.

## Cómo se resolvieron las preguntas abiertas

Se decidieron en `/speckit.specify` y quedaron en la sección *Assumptions* de la spec:

| Pregunta abierta | Decisión |
|---|---|
| ¿Cuántas preguntas y cuánto dura? | 10 preguntas al azar del banco, sin límite de tiempo |
| ¿Umbrales de nivel? | 90% o más: avanzado; 70% o más: intermedio; menos: básico. Todo examen terminado otorga al menos básico |
| ¿Periodo de espera? | 30 días |
| ¿Pesa la dificultad de cada pregunta? | No, todas pesan igual |
| ¿Examen abandonado a la mitad? | Se puede retomar dentro de 24 horas; después expira y cuenta como intento (riesgo aceptado conscientemente) |
| ¿Si reintenta y le va peor? | Se conserva el mejor nivel histórico |
| ¿Mínimo de preguntas en el banco? | 20 por skill |
| ¿Qué pasa si se editan o borran preguntas? | Una pregunta ya presentada en un intento no se puede borrar, y el nivel ya validado nunca se recalcula |

## Plantilla usada

Esta es la plantilla con la que se escribieron los requerimientos 002 y 003:

```
## Feature name
[Short title, 5-8 words]

## Business context
Why is this needed now? What problem does it solve or what
opportunity does it open? (1-3 lines, no jargon)

## Who uses it
What role/type of user interacts with this? (admin, end user,
external system, etc.)

## What should happen (expected flow)
Describe it as a story, in plain language, step by step.

## What should NOT happen (known constraints)
Things that should be blocked or prevented; business limits.

## Data likely involved
WHAT information is needed, not HOW it's stored.

## Relationship to what already exists
Does this depend on, modify, or connect to something already built?

## Open questions
Things not decided yet — better to say so explicitly.

## Priority / urgency
Is this part of a specific release? Does it block anything else?
```

---

## Feature name
Validación de nivel por skill mediante examen

## Business context
El banco de preguntas ya existe y un admin puede llenarlo, pero hoy nadie puede responderlas — las preguntas se quedan guardadas sin uso. Sin esta pieza, un candidato sigue solo *declarando* que sabe React sin nada que lo respalde, y las empresas no tienen forma de distinguir entre quien lo declara y quien lo demuestra. Esta feature cierra ese ciclo y es lo que le da valor real al trabajo de capturar preguntas.

## Who uses it
El **candidato** (usuario final ya registrado y con perfil completo). El admin no participa en este flujo más allá de haber capturado las preguntas previamente. Las empresas y otros miembros de la comunidad son consumidores pasivos del resultado (lo ven en el perfil, no interactúan con el examen).

## What should happen (expected flow)

1. El candidato entra a su perfil y ve sus skills declarados; cada uno muestra si ya está validado (con su nivel) o si está pendiente de validar.
2. Elige un skill pendiente y comienza el examen de ese skill.
3. El sistema le presenta preguntas de opción múltiple de ese skill, una por una, tomadas del banco capturado por el admin.
4. El candidato selecciona una respuesta por pregunta y avanza; no puede regresar a cambiar respuestas anteriores.
5. Al terminar, el sistema califica automáticamente y le muestra su resultado: **básico**, **intermedio** o **avanzado**.
6. Ese nivel queda asociado a ese skill en su perfil y pasa a ser **visible públicamente** para empresas y otros miembros.
7. Si quiere mejorar su nivel, el sistema le indica a partir de cuándo puede volver a intentarlo (hay un periodo de espera).
8. Si intenta iniciar el examen de un skill que ya validó y aún está dentro del periodo de espera, el sistema se lo impide y le dice cuándo podrá.

## What should NOT happen (known constraints)

- **La respuesta correcta nunca debe llegar al navegador antes de que el candidato responda.** Las preguntas ya guardan cuál opción es la correcta; si eso se envía junto con la pregunta, cualquiera lo ve en las herramientas de desarrollador y el examen deja de significar nada. La calificación tiene que ocurrir del lado del servidor.
- Un candidato no debe poder presentar examen de un skill que **no declaró en su perfil**.
- No debe poder hacer **más de un intento por skill** dentro del periodo de espera.
- No debe poder **modificar ni reenviar** las respuestas de un examen ya terminado.
- No debe poder iniciar un examen de un skill cuyo **banco de preguntas sea insuficiente** (hoy varios skills tienen cero preguntas capturadas; presentar un examen de 2 preguntas no valida nada y quema el intento del usuario).
- El resultado no debe poder ser alterado por el propio candidato (ni el nivel, ni el puntaje, ni la fecha).

## Data likely involved

- Qué candidato presentó examen de qué skill, y cuándo.
- **Qué preguntas específicas se le presentaron en ese intento** — para que el resultado sea auditable después y para no repetirle exactamente las mismas si vuelve a intentar.
- Las respuestas que dio.
- El resultado: el nivel obtenido y el puntaje que lo sustenta.
- A partir de cuándo puede volver a intentar ese skill.
- El banco de preguntas existente y los skills declarados del candidato (ambos ya existen).

## Relationship to what already exists

- **Depende directamente** de `exam_questions` y `question_options` (el banco) y de la tabla `skills`, todo construido en `specs/001-exam-question-form/`. Sin preguntas capturadas, esta feature no tiene de dónde tomar contenido.
- **Lee** `users.skills` (los skills que el candidato declaró en onboarding) para saber de qué se puede examinar.
- **Escribe/muestra** en el perfil: `PublicProfileView` (`/users/[username]`) y la vista propia (`/profile`) tendrán que mostrar el nivel validado junto a cada skill.
- Convive con el campo `seniority` del perfil (junior/semi senior/senior), que es auto-declarado y **no** es lo mismo que el nivel validado por examen — hay que decidir cómo se ven juntos sin confundir.
- Posible conexión futura (fuera de alcance aquí): el feed "Para ti" ya empata vacantes por skills; un nivel validado podría mejorar ese emparejamiento.

## Open questions

- **¿Cuántas preguntas tiene un examen y cuánto dura?** El banco objetivo era de 35 por skill; falta decidir si se presentan todas o un subconjunto aleatorio (ej. 10), y si hay límite de tiempo.
- **¿Qué umbrales definen cada nivel?** Ej. ¿60% → básico, 80% → intermedio, 95% → avanzado? No está decidido.
- **¿Cuánto dura el periodo de espera para reintentar?** (¿30 días? ¿90?)
- **¿Debe influir la dificultad de cada pregunta en el nivel resultante?** Las preguntas ya se capturan etiquetadas como básico/intermedio/avanzado — se puede mezclar dificultades y usar eso para calibrar, o ignorarlo y solo contar aciertos.
- **¿Qué pasa si el candidato abandona el examen a la mitad** (cierra el navegador, se le va el internet)? ¿Cuenta como intento consumido, se puede retomar, o se descarta?
- **Si reintenta y le va peor, ¿qué nivel queda?** ¿El más reciente o el mejor histórico?
- **¿Cuál es el mínimo de preguntas en el banco para habilitar el examen de un skill?**
- **¿Qué pasa con un nivel ya validado si el admin edita o borra preguntas después?** (probablemente nada, pero conviene decirlo explícitamente)

## Priority / urgency
Parte del sistema de evaluación de skills (release 1.1.0), del cual el formulario admin de captura ya está construido. **No bloquea nada técnicamente**, pero el valor de la feature ya entregada (el banco de preguntas) permanece sin realizar hasta que esto exista: hoy se capturan preguntas que nadie puede responder.

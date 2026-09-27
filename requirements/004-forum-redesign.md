# Requerimiento 004 — Rediseño del foro (apps/community)

| | |
|---|---|
| **Origen** | Handoff de diseño (`design_handoff_foro_redesign`), con prototipo HTML de 4 pantallas |
| **Fecha** | 2026-09-26 |
| **Spec derivada** | Ninguna: por decisión del 2026-09-27 se implementa directo, con tests, sin pasar por spec-kit |
| **Rama** | `004-forum-redesign`, desde `master` (que ya incluye 001, 002 y 003) |
| **Estado** | Partes 1 (feed) y 2 (detalle) implementadas; faltan perfil y crear |

El prototipo `AvoTalent Foro.dc.html` es **referencia de diseño**, no código para copiar: el
rediseño se recrea dentro del Next.js existente, reutilizando sus componentes y rutas.

## Entrega por partes

| Parte | Contenido | Estado |
|---|---|---|
| 1 | Tokens de color, tipografía Inter, topbar, sidebars y tarjetas del feed | Hecha |
| 2 | Detalle de post y de vacante | Hecha |
| 3 | Perfil público | Pendiente |
| 4 | Crear publicación | Pendiente |

## Diferencias con el handoff, y por qué

- **"N postulantes" en la tarjeta de vacante**: no se implementó. AvoTalent no tiene
  postulaciones propias (el botón "Postularse" abre el enlace externo de la vacante), así que
  ese número no existe. La tarjeta muestra los comentarios y, como pide el diseño, ya no
  muestra votos. Las postulaciones internas son parte del requerimiento 003 y están aplazadas.
- **Chip "nivel · tipo de contrato"**: se arma con `seniority_level` y la modalidad. El nivel lo
  escribe el clasificador del scraper y en algunas vacantes está vacío; el chip se adapta y
  muestra solo lo que hay. También se omite "No especificado", que es el relleno del scraper.
- **Placeholder de imagen**: solo en artículos y showcase. En una discusión, que es texto, un
  placeholder rayado sería ruido.
- **Detalle de vacante sin conversación ni votos** (parte 2): el diseño lo define así, y
  ninguna vacante del scraper tiene comentarios. El estado que las manejaba se eliminó.
- **"Seguir" en el detalle de un artículo** (parte 2): se renderiza como en el diseño pero
  deshabilitado, con su razón visible. No existe en el backend; es la parte 5 del requerimiento
  de cuentas. Mostrarlo apagado deja claro que falta, en vez de fingir que funciona.
- **El detalle pierde los sidebars**: el diseño lo pide en una sola columna, así que esas dos
  rutas se renderizan fuera de la rejilla de tres columnas del feed.
- **Cambio de paleta global**: el handoff pide reemplazar los valores de `:root`, pero los
  colores viejos estaban escritos a mano en ~1700 lugares del CSS y de estilos inline. Se
  reemplazaron todos, así que la piel nueva alcanza también a las pantallas que aún no se
  rediseñan (ajustes, onboarding, guardados) y no queda media app con el look anterior.

---

# Handoff: Rediseño del foro AvoTalent (apps/community)

## Overview
Rediseño visual del foro/comunidad de AvoTalent: modo oscuro más cálido (menos "GitHub dark"), tarjetas más espaciosas y con avatares circulares, tipografía Inter en vez de mono, tabs tipo pill, y vacantes con más información (nivel, tipo de contrato, postulantes, beneficios) e imágenes placeholder en posts editoriales/showcase.

## Sobre los archivos de diseño
El archivo `AvoTalent Foro.dc.html` en este paquete es una **referencia de diseño hecha en HTML**, no código de producción para copiar tal cual. La tarea es **recrear este diseño dentro del código Next.js/React ya existente** en `apps/community`, reutilizando sus componentes, rutas y convenciones actuales — no reemplazar archivos con HTML crudo.

## Fidelidad
**Alta fidelidad (hifi)**: colores, tipografía, espaciado e interacciones están definidos y listos para implementar tal cual.

## Mapeo a archivos existentes
| Pantalla del diseño | Archivo(s) actuales a modificar |
|---|---|
| Header / topbar | `apps/community/components/shell.tsx` (`<header className="topbar">`) |
| Sidebar izquierdo (nav + tags + CTA) | `apps/community/components/community-hub.tsx` → `LeftSidebar` |
| Feed + tarjetas de post | `apps/community/components/community-hub.tsx` → `Feed`, `PostCard` |
| Sidebar derecho (trending, oportunidades, comunidad) | `apps/community/components/community-hub.tsx` → `RightSidebar` |
| Detalle de post / vacante | `apps/community/app/(main)/post/[...]`, `app/(main)/vacantes/[...]` (revisar rutas exactas) |
| Perfil público | `apps/community/components/public-profile-view.tsx` |
| Crear publicación | `apps/community/app/create/page.tsx` |
| Estilos globales / tokens | `apps/community/app/globals.css` |

## Design Tokens

**Colores** (reemplazan los valores actuales en `:root` de `globals.css`):
- Fondo base: `#18161a` (antes `#0d1117`)
- Superficie/tarjetas: `#221f1b` (antes `#161b22`)
- Borde: `#322f29` (antes `#30363d`)
- Texto primario: `#f3efe9` (antes `#e6edf3`)
- Texto secundario: `#b3aba1` (antes `#8b949e`)
- Texto muted: `#7d766c`
- Acento (primary): `#00A86B` — se mantiene igual
- Acento sobre superficie oscura: `#4fd39a` (texto/iconos activos)
- Fondo de acento suave: `rgba(0,168,107,0.14)`
- Ámbar (showcase/terciario): `#d4b85a` con fondo `#3a3320`
- Azul (avatares tipo "info"): `#a5b4fc` con fondo `#242b52`

**Tipografía**: Inter en todo (400/500/600/700/800). Se elimina el uso de `JetBrains Mono` para metadata/tags — antes en mono, ahora en Inter regular/medium. Tamaños: H1 detalle 36px/800, H1 feed 30px/800, título de card 19px/700, cuerpo 14-17px/1.65-1.85 line-height.

**Espaciado**: cards con `padding: 26px 28px` (antes ~19px), `border-radius: 18px` (antes 8px), `gap: 20px` entre cards (antes 11px). Grid del layout: `minmax(0,220px) minmax(0,1fr) minmax(0,280px)` con `gap: 32px` (fluido, no columnas fijas).

**Bordes/radios**: contenedores generales `16px`, chips/pills `8-10px` o `999px` para pills de navegación y tags.

## Componentes clave

### PostCard (feed)
- Avatar circular 44px con iniciales (gradiente por tipo de autor) en vez del avatar cuadrado de 8px radius actual.
- Badge de tipo (VACANTE / SHOWCASE / ARTÍCULO / DISCUSIÓN / DEBATE) como pill a la derecha del autor, no como texto plano encima del título.
- Vacantes: chips con icono (empresa, ubicación, nivel · tipo de contrato, salario) + fila de beneficios con check verde, en vez de un bloque de texto denso.
- Posts editoriales/showcase: placeholder de imagen (rayado diagonal `repeating-linear-gradient(45deg,#221f1b,#221f1b 12px,#28241f 12px,#28241f 24px)` + etiqueta monoespaciada) — reemplazar por la imagen real cuando el post la tenga.
- Footer: vacantes muestran "N postulantes" en vez de botón de voto (los votos no aplican a vacantes).

### Detalle de post
- Se separa visualmente en dos variantes: vacante (empresa/ubicación/nivel/salario/postulantes, descripción, requisitos, beneficios, botón "Postularse") vs artículo/discusión (cuerpo en párrafos, cita destacada opcional, comentarios/respuestas).

### Tabs de navegación (sidebar y feed)
- Se convierten de subrayado a **pills**: activo = fondo `#00A86B`, texto `#0d1f16`; inactivo = transparente, texto `#b3aba1`.

### Logo
- Se reemplaza el emoji 🥑 por un monograma "A" en cuadrado `#00A86B` con texto `#0d1f16` — evitar emoji en la marca.

## Interacciones
- Click en tarjeta → detalle del post/vacante correspondiente.
- Click en avatar/nombre de autor o empresa → perfil público (evento independiente del click de la tarjeta, con `stopPropagation`).
- Tabs de feed filtran la lista: "Vacantes & Freelance" solo `type === 'job'`; "Showcase Projects" solo `type === 'showcase'`.
- Guardar (bookmark) y votar mantienen el mismo comportamiento optimista que ya existe en `PostCard`.

## Assets
No se usan imágenes reales — los placeholders de imagen y los logos de empresa siguen el patrón de iniciales+color ya usado en `CompanyAvatar`/`Avatar` del código actual. Ningún ícono es de una librería de terceros nueva: son SVGs inline equivalentes a los que ya usa `lucide-react` en el código actual (mismo stroke-width 1.8-2).

## Archivos incluidos
- `AvoTalent Foro.dc.html` — prototipo interactivo con las 4 pantallas (Feed, Publicación, Perfil, Crear), navegable con el switcher en la parte superior del header.

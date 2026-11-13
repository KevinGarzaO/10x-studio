# Estudio de contenido viejo (archivado el 13 de noviembre de 2026)

Aquí vive el estudio de contenido original de `apps/avocado`: calendario, redactor con IA, temas, Substack, blog, LinkedIn y configuración (las pantallas del grupo de rutas `(dashboard)` y sus componentes). Ya no estaba en la navegación del panel y nada lo llamaba, así que se sacó de la aplicación y se dejó aquí **sin borrar nada** (se movió con `git mv`: el historial de cada archivo se conserva).

- **No se compila ni se despliega.** Esta carpeta está fuera de `apps/*` y de `packages/*`.
- **El panel de telemetría (`apps/avocado`) no depende de nada de aquí.** Se comprobó con el grafo de importaciones: lo único compartido eran `lib/admin-auth.ts` y `lib/api.ts`, que se quedaron en el panel.
- **Las rutas del backend que usaba** (`crud`, `ai`, `substack`, `users`, `blog`, `linkedin`, `scraper`) siguen en `backend/routes` y se sirven desde `api-telemetry`. Son candidatas a retiro cuando se confirme que nadie las usa; hoy están protegidas con sesión de superadmin.
- Se quitaron del panel 15 dependencias que solo usaba el estudio (editor de texto Tiptap, `docx`, `jspdf`, `lucide-react`, `swr`, `date-fns`, `clsx`, `sweetalert2`).

## Cómo restaurarlo (si algún día hace falta)

1. Mover `archive/studio-legacy/apps-avocado/src/*` de vuelta a `apps/avocado/src/` (mismas rutas).
2. Volver a agregar las dependencias de `package.json` (ver el historial de git antes del commit que lo archivó).
3. Revisar que el backend siga exponiendo las rutas que usa.

Si dentro de unos meses nadie lo echó de menos, se puede borrar esta carpeta: el historial de git la conserva.

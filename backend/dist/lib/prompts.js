"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPrompt = buildPrompt;
exports.buildSuggestTopicsPrompt = buildSuggestTopicsPrompt;
const KEVIN_VOICE_RULES = `
GUÍA DE ESTILO "NANO BANANA STUDIO" (Noticiero Fresh & Tech de IA):
- Escribe con un tono ágil, hiper-moderno, fresco y llamativo. Eres un noticiero estrella reportando las últimas y más calientes tendencias tecnológicas del momento.
- Olvida el estilo dramático/vulnerable. Ve al grano, usa analogías poderosas y mantén al lector pegado de la pantalla sintiendo que está leyendo el Newsletter más TOP de Silicon Valley (pero en lenguaje digerible y asertivo).
- CRÍTICO: Usa el "Material base" como tu Biblia. Extrae las métricas reales, las empresas y los hechos del contexto de internet brindado, NO ALUCINES información que no esté en la base. Si el usuario te da un resumen, respétalo 100%.
- Estructura ideal: Gancho explosivo -> Contexto Duro (la noticia) -> Implicaciones (por qué importa) -> Cierre y llamado de acción.
- CIERRE: WhatsApp Transformateck (invitación directa, somos 600+, vamos por 1000). Hashtags (máx 5).
`;
const NANO_BANANA_META_PROMPT = `
ESTILO VISUAL: NANO BANANA v5 (INFOGRAFÍA NARRATIVA MAESTRA)
Genera un prompt narrativo ULTRA CONCISO y potente (máximo 80 a 100 palabras) para una ESCENA INFOGRÁFICA COMPLEJA:

1. LAYOUT DE HISTORIA (CRÍTICO): 
No hagas un retrato simple. Diseña una composición de "Storytelling Visual":
- Escena de "Antes vs Después", "Caos vs Sistema", o "Batalla Épica".
- Incluye cuadros de texto, flechas de flujo, porcentajes (ej: "3hs -> 30 seg", "84% satisfacción").
- Pantallas holográficas que muestren dashboards reales del tema del artículo.

2. ELEMENTOS DE BRANDING (ESCENARIO):
- Fondo oscuro, iluminación neón turquesa (evita escribir el código hex, solo el color).
- Letrero neón "TRANSFORMATECK" claro.
- Pared con póster enmarcado "The Beatles - A Hard Day's Night".
- Mesa con máscara de luchador (DESCANZANDO, NUNCA puesta).
- Taza "CONTRIBUTOR IA MUG" o "IA".
- Reloj "3:00 AM", Letrero "Build in Public".

3. PERSONAJES DINÁMICOS:
- JERSEY: Variedad deportiva global e internacional. (Preferencia #1: Rayados de Monterrey). Alternar con: Red Bull F1/Checo Pérez, Boxeo Canelo Álvarez, Dallas Cowboys, Astros de Houston, Sultanes, Tomateros. Fútbol Internacional: Juventus, Real Madrid, Liverpool FC, Boca Juniors, Flamengo, etc. 
- PROHIBICIÓN ESTRICTA: NUNCA usar jerseys de Tigres u Club América.
- GORRA: Kevin siempre lleva una gorra deportiva en la cabeza (que combine con el jersey).
- AGUACATE: Aguacate antropomorfizado 🥑 con brazos/piernas. Es un personaje analista/ayudante (sosteniendo letreros de "This Works", analizando datos con Kevin).

4. AMBIENTE: Cinematográfico, tech futurista de alto detalle, neones turquesa vibrantes.

PROMPT FINAL: (Genera el prompt narrativo de forma hiper-compacta, en inglés, en un párrafo de máximo 80 a 100 palabras para inyectarlo en DALL-E)
`;
function buildPrompt(p) {
    const isArticle = p.platform === 'substack-article' || p.platform === 'blog' || p.platform === 'article';
    if (isArticle) {
        return `
Escribe un ARTÍCULO newsletter de Substack sobre: "${p.topic}"
- Longitud: ~${p.length} palabras. Tono: ${p.tone}.
${p.audience ? `- Audiencia: ${p.audience}` : ''}
${p.keywords ? `- Palabras clave: ${p.keywords}` : ''}
${p.extract ? `\nMaterial base (ESTA ES TU FUENTE PRIMARIA, RESPÉTALA):\n${p.extract}` : '\nNO hay material base provisto. Utiliza tu vasto conocimiento en IA, datos reales de 2024 y tu estilo de noticiero para crear un artículo profundamente preciso, sin inventar términos vagos.'}

${KEVIN_VOICE_RULES}
${NANO_BANANA_META_PROMPT}

RESPUESTA (Solo JSON):
{
  "titulo": "...",
  "subtitulo": "...",
  "contenido": "...",
  "image_prompt": "Dejalo completamente VACÍO (un string vacío \"\"). El sistema generará la infografía en el Paso 2."
}
`;
    }
    if (p.platform === 'substack-note') {
        return `Escribe una NOTA de Substack sobre: "${p.topic}". ${KEVIN_VOICE_RULES} Máx 300 palabras, sin título.`;
    }
    return `Escribe un post de ${p.platform} sobre ${p.topic}. Tono: ${p.tone}.`;
}
function buildSuggestTopicsPrompt(niche, audience, existing) {
    return `Sugiere 8 temas para blog sobre ${niche || 'IA'}. Audiencia: ${audience}. JSON: {"topics":[{"title":"...","tags":["..."],"notes":"..."}]}`;
}

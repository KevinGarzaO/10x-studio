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
- JERSEY: Variedad deportiva global e internacional. ES CRÍTICO VARIAR EL EQUIPO EN CADA GENERACIÓN. Elige al azar entre: Rayados de Monterrey, Selección Mexicana, Red Bull F1 (Pérez), Dallas Cowboys, Astros de Houston, Sultanes, Real Madrid, Liverpool FC, Juventus. 
- PROHIBICIÓN ESTRICTA: NUNCA usar jerseys de Tigres u Club América.
- GORRA: Kevin siempre lleva una gorra deportiva. LA GORRA DEBE SER DEL MISMO EQUIPO Y COLOR QUE EL JERSEY ELEGIDO (Uniforme completo y coherente).
- AGUACATE: Aguacate antropomorfizado 🥑 con brazos/piernas. Es un personaje analista/ayudante (sosteniendo letreros de "This Works", analizando datos con Kevin).

4. AMBIENTE: Cinematográfico, tech futurista de alto detalle, neones turquesa vibrantes.

PROMPT FINAL: (Genera el prompt narrativo de forma hiper-compacta, en inglés, en un párrafo de máximo 80 a 100 palabras para inyectarlo en DALL-E)
ESTILO OBLIGATORIO: vibrant cartoon illustration, comic book art style, bold outlines, cel-shading, NOT photorealistic, NOT 3D render. Colorful and expressive.
`;
function buildPrompt(p) {
    const isLI = p.platform.startsWith('linkedin');
    const isArticle = p.platform === 'substack-article' || p.platform === 'blog' || p.platform === 'article' || p.platform === 'linkedin-article';
    const isShort = p.platform === 'linkedin-post' || p.platform === 'substack-note';
    let platformGoal = '';
    if (isArticle)
        platformGoal = `un ARTÍCULO largo y detallado para ${p.platform}`;
    else if (isShort)
        platformGoal = `un POST corto y viral para ${p.platform}`;
    else
        platformGoal = `un contenido para ${p.platform}`;
    // Formato especial para LinkedIn: Texto "Puro" sin Markdown
    const liFormatting = isLI ? `
REGLA DE FORMATO CRÍTICA PARA LINKEDIN:
- NO usar Markdown. Prohibido usar asteriscos (**) para negritas.
- NO usar almohadillas (#) para títulos o encabezados.
- Usa texto plano limpio y EMOJIS para resaltar puntos o separar secciones.
- Sé extremadamente breve y directo. Aunque se pida "Largo", no superes los 2,600 caracteres (aprox 400 palabras) para asegurar que quepa en LinkedIn sin cortes.
` : '';
    return `
Escribe ${platformGoal} sobre: "${p.topic}"
- Longitud sugerida: ~${p.length} palabras. 
- Tono: ${p.tone}.
${p.audience ? `- Audiencia: ${p.audience}` : ''}
${p.keywords ? `- Palabras clave: ${p.keywords}` : ''}
${p.extract ? `\nMaterial base (FUENTE PRIMARIA):\n${p.extract}` : '\nSin material base. Usa datos reales de finales de 2024/2025 y tendencias actuales.'}

${KEVIN_VOICE_RULES}
${liFormatting}

${(isArticle || isLI) ? NANO_BANANA_META_PROMPT : ''}

RESPUESTA (JSON PURO):
{
  "titulo": "Titular gancho",
  "subtitulo": "${isArticle ? 'Subtítulo descriptivo' : ''}",
  "contenido": "Contenido en texto plano (EMOJIS permitidos, Markdown PROHIBIDO si es LinkedIn)",
  "image_prompt": "${(isArticle || isLI) ? 'Prompt para DALL-E (Paso 2)' : ''}"
}
`;
}
function buildSuggestTopicsPrompt(niche, audience, existing) {
    return `Sugiere 8 temas para blog sobre ${niche || 'IA'}. Audiencia: ${audience}. JSON: {"topics":[{"title":"...","tags":["..."],"notes":"..."}]}`;
}

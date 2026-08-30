export type Platform =
  | 'blog'
  | 'linkedin-post'
  | 'linkedin-article'
  | 'substack-article'
  | 'substack-note'
  | 'article'

interface PromptParams {
  topic: string
  platform: Platform
  length: string
  tone: string
  audience?: string
  keywords?: string
  extract?: string
  language?: 'es' | 'en'
}

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

const KEVIN_VOICE_RULES_EN = `
STYLE GUIDE "NANO BANANA STUDIO" (Fresh & Tech AI News):
- Write with an agile, hyper-modern, fresh and catchy tone. You are a star reporter covering the latest and hottest tech trends.
- Skip the dramatic/vulnerable style. Get straight to the point, use powerful analogies and keep the reader glued to the screen feeling like they're reading the TOP Newsletter from Silicon Valley (but in digestible, assertive language).
- CRITICAL: Use the "Source material" as your Bible. Extract real metrics, companies and facts from the provided internet context. DO NOT make up information not in the source.
- Ideal structure: Explosive Hook -> Hard Context (the news) -> Implications (why it matters) → Closing and call to action.
- CLOSING: WhatsApp Transformateck (direct invitation, 600+ members, aiming for 1000). Hashtags (max 5).
`;

export function buildPrompt(p: PromptParams): string {
  const isLI      = p.platform.startsWith('linkedin');
  const isArticle = p.platform === 'substack-article' || p.platform === 'blog' || p.platform === 'article' || p.platform === 'linkedin-article';
  const isShort   = p.platform === 'linkedin-post' || p.platform === 'substack-note';
  const isEN      = p.language === 'en';

  let platformGoal = '';
  if (isArticle) platformGoal = isEN ? `a long and detailed ARTICLE for ${p.platform}` : `un ARTÍCULO largo y detallado para ${p.platform}`;
  else if (isShort) platformGoal = isEN ? `a short viral POST for ${p.platform}` : `un POST corto y viral para ${p.platform}`;
  else platformGoal = isEN ? `content for ${p.platform}` : `un contenido para ${p.platform}`;

  // LinkedIn formatting rules
  const liFormatting = isLI ? (isEN ? `
CRITICAL FORMAT RULE FOR LINKEDIN:
- NO Markdown. No asterisks (**) for bold.
- NO hashtags (#) for titles or headings.
- Use clean plain text and EMOJIS to highlight points or separate sections.
- Be extremely brief and direct. Even if "Long" is requested, do not exceed 2,600 characters (approx 400 words) to ensure it fits on LinkedIn without cuts.
` : `
REGLA DE FORMATO CRÍTICA PARA LINKEDIN:
- NO usar Markdown. Prohibido usar asteriscos (**) para negritas.
- NO usar almohadillas (#) para títulos o encabezados.
- Usa texto plano limpio y EMOJIS para resaltar puntos o separar secciones.
- Sé extremadamente breve y directo. Aunque se pida "Largo", no superes los 2,600 caracteres (aprox 400 palabras) para asegurar que quepa en LinkedIn sin cortes.
`) : '';

  const langInstruction = isEN ? 'Write ALL content in ENGLISH.' : 'Escribe TODO el contenido en ESPAÑOL.';
  const responseLang = isEN ? 'Title in English' : 'Titular gancho';
  const subtitleLang = isEN ? 'Descriptive subtitle' : 'Subtítulo descriptivo';
  const contentLang = isEN ? 'Plain text content (EMOJIS allowed, Markdown PROHIBITED for LinkedIn)' : 'Contenido en texto plano (EMOJIS permitidos, Markdown PROHIBIDO si es LinkedIn)';

  return `
Write ${platformGoal} about: "${p.topic}"
- Suggested length: ~${p.length} words.
- Tone: ${p.tone}.
- Language: ${langInstruction}
${p.audience ? `- Audience: ${p.audience}` : ''}
${p.keywords ? `- Keywords: ${p.keywords}` : ''}
${p.extract ? `\nSource material:\n${p.extract}` : '\nNo source material. Use real data from late 2024/2025 and current trends.'}

${isEN ? KEVIN_VOICE_RULES_EN : KEVIN_VOICE_RULES}
${liFormatting}

${(isArticle || isLI) ? NANO_BANANA_META_PROMPT : ''}

RESPONSE (PURE JSON):
{
  "titulo": "${responseLang}",
  "subtitulo": "${isArticle ? subtitleLang : ''}",
  "contenido": "${contentLang}",
  "image_prompt": "${(isArticle || isLI) ? 'Prompt for DALL-E (Step 2)' : ''}"
}
`;
}

export function buildSuggestTopicsPrompt(niche: string, audience: string, existing: string[]): string {
  return `Sugiere 8 temas para blog sobre ${niche || 'IA'}. Audiencia: ${audience}. JSON: {"topics":[{"title":"...","tags":["..."],"notes":"..."}]}`
}

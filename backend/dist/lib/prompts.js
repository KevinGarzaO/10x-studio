"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPrompt = buildPrompt;
exports.buildSuggestTopicsPrompt = buildSuggestTopicsPrompt;
function buildPrompt(p) {
    const au = p.audience ? `\n- Audiencia: ${p.audience}` : '';
    const kw = p.keywords ? `\n- Palabras clave: ${p.keywords}` : '';
    const ex = p.extract
        ? `\n\nMaterial base del autor (úsalo como fundamento, respeta sus ideas y voz):\n---\n${p.extract}\n---`
        : '';
    const map = {
        blog: `Eres redactor experto de blogs. Escribe un artículo completo:
- Tema: ${p.topic}
- Longitud: ~${p.length} palabras
- Tono: ${p.tone}${au}${kw}${ex}
Estructura: título (# título), introducción que enganche, subtítulos (##), ejemplos concretos, conclusión con CTA. Solo el artículo.`,
        'linkedin-post': `Eres experto en LinkedIn. Escribe un POST sobre: ${p.topic}
Tono: ${p.tone}${au}${kw}${ex}
REGLAS: máx 1,300 caracteres · gancho en primera línea · párrafos cortos · emojis estratégicos · sin ## · CTA al final · máx 5 hashtags. Solo el post.`,
        'linkedin-article': `Eres experto en thought leadership en LinkedIn. Escribe un ARTÍCULO sobre: ${p.topic}
- Longitud: ~${p.length} palabras
- Tono: ${p.tone}${au}${kw}${ex}
Estructura: título (# título), intro con historia o dato, subtítulos (##), perspectiva única, CTA. Solo el artículo.`,
        'substack-article': `Eres escritor de newsletters en Substack. Escribe un ARTÍCULO newsletter sobre: ${p.topic}
- Longitud: ~${p.length} palabras
- Tono: ${p.tone}${au}${kw}${ex}
Estilo: voz personal, narrativa fluida. Título (# título), apertura memorable, desarrollo, cierre poderoso. Solo el artículo.`,
        'substack-note': `Eres escritor en Substack. Escribe una NOTA corta sobre: ${p.topic}
Tono: ${p.tone}${au}${ex}
REGLAS: máx 300 palabras · sin título ni ## · tono íntimo y directo · prosa natural. Solo la nota.`,
    };
    return map[p.platform];
}
function buildSuggestTopicsPrompt(niche, audience, existing) {
    return `Eres estratega de contenido. Sugiere 8 temas originales para artículos de blog.
Nicho: ${niche || 'contenido general'}
Audiencia: ${audience || 'audiencia general'}
${existing.length ? `Temas ya escritos (NO repetir): ${existing.join(', ')}` : ''}
Busca ángulos frescos, preguntas frecuentes, tendencias actuales.
Responde SOLO con JSON sin markdown: {"topics":[{"title":"...","tags":["tag1","tag2"],"notes":"por qué es valioso"}]}`;
}

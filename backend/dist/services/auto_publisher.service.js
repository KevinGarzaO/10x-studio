"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoPublisherService = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const prompts_1 = require("../lib/prompts");
const image_service_1 = require("./image.service");
const substack_service_1 = require("./substack.service");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Helper to reliably parse JSON coming from Claude
function parseClaudeJson(rawText) {
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json'))
        cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    else if (cleaned.startsWith('```'))
        cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
    try {
        return JSON.parse(cleaned);
    }
    catch (e) {
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            try {
                return JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
            }
            catch (innerE) {
                throw new Error('Could not parse JSON from Claude response');
            }
        }
        throw e;
    }
}
// Reuse logic from controller for HTML formatting
function mdToHtml(md) {
    const blocks = md.split('\n\n').filter(b => b.trim());
    const total = blocks.length;
    const firstThird = Math.max(1, Math.floor(total * 0.25));
    const middle = Math.max(2, Math.floor(total * 0.55));
    const end = total - 1;
    let html = '';
    let inList = false;
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.trim().startsWith('- ')) {
            if (!inList) {
                html += '<ul>\n';
                inList = true;
            }
            const items = block.split('\n').filter(l => l.trim().startsWith('- '));
            for (const item of items) {
                const itemText = item.replace(/^- /, '')
                    .replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/(?<!\*)\*(?!\*)([\s\S]*?)\*/g, '<em>$1</em>');
                html += `<li><p>${itemText}</p></li>\n`;
            }
            continue;
        }
        if (inList) {
            html += '</ul>\n';
            inList = false;
        }
        let parsed = block.replace(/\*\*([\s\S]*?)\*\*/g, '<strong>$1</strong>')
            .replace(/(?<!\*)\*(?!\*)([\s\S]*?)\*/g, '<em>$1</em>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
            .replace(/\n/g, '<br>');
        if (parsed.startsWith('# '))
            html += `<h1>${parsed.replace(/^#\s/, '')}</h1>\n`;
        else if (parsed.startsWith('## '))
            html += `<h2>${parsed.replace(/^##\s/, '')}</h2>\n`;
        else if (parsed.startsWith('### '))
            html += `<h3>${parsed.replace(/^###\s/, '')}</h3>\n`;
        else
            html += `<p>${parsed}</p>\n`;
        if (i === firstThird || i === middle || i === end) {
            html += '<div data-type="subscribe-widget"></div>\n';
        }
    }
    if (inList)
        html += '</ul>\n';
    html += `
<br>
<p><strong>¿Ya eres parte de nuestra comunidad de WhatsApp?</strong></p>
<p>Mira, somos más de 600 personas construyendo la comunidad de IA más grande en español y Latinoamérica. Tenemos un grupo activo en WhatsApp donde compartimos noticias como esta en tiempo real, discutimos las implicaciones para nuestros negocios y nos ayudamos entre todos.</p>
<p>Vamos por 1,000 miembros. Si esto que leíste te resonó, deberías estar ahí.</p>
<p><a href="https://chat.whatsapp.com/CQsp63vm1oW3QNS3Q87gZA">Únete al grupo de WhatsApp</a></p>
<p>Nos vemos del otro lado.</p>
<p>Kevin Garza<br>Fundador, Transformateck</p>
`;
    return html;
}
class AutoPublisherService {
    /**
     * 1. Usa Claude con Tools para buscar noticias recientes de IA y seleccionar un tema ganador.
     */
    static async findTrendingTopicForToday() {
        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey)
            throw new Error('CLAUDE_API_KEY no configurada.');
        console.log('[AutoPublisher] Búsqueda interactiva web con Claude...');
        const prompt = `
Eres un analista de tendencias tech de alto nivel para Transformateck.
Busca y encuentra la noticia más importante, disruptiva y actual sobre Inteligencia Artificial (AI) que haya sucedido en las últimas 72 horas.
Enfócate en herramientas, nuevas versiones (Anthropic, OpenAI, Meta, Google, Windows 11 AI, etc.), o casos de impacto para el negocio.
Una vez encuentres los resultados, elige la MEJOR noticia e incluye en tu JSON:
1. topic: Un titular sobre la noticia (ej: "Anthropic lanza Mythos y rompe el internet").
2. extract: Un resumen crudo de 3-4 párrafos con los datos reales, porcentajes y explicaciones técnicas/de impacto de la noticia, para ser usado como base para un artículo completo.

RESPUESTA ESTRICTA EN EL SIGUIENTE FORMATO JSON:
{
  "topic": "...",
  "extract": "..."
}`;
        const res = await (0, node_fetch_1.default)('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 2000,
                tools: [{ type: 'web_search_20250305', name: 'web_search' }],
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await res.json();
        if (!data.content)
            throw new Error(`[AutoPublisher] Claude error: ${data.error?.message}`);
        // Extraer del bloque JSON de Claude
        const textBlock = data.content.find((b) => b.type === 'text');
        if (!textBlock)
            throw new Error('[AutoPublisher] Claude no retornó texto.');
        const result = parseClaudeJson(textBlock.text);
        return { topic: result.topic, extract: result.extract };
    }
    /**
     * 2. Escribe el artículo con la base de datos usando buildPrompt.
     */
    static async writeArticle(topic, extract) {
        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey)
            throw new Error('CLAUDE_API_KEY missing.');
        console.log(`[AutoPublisher] Redactando artículo sobre: ${topic}...`);
        const prompt = (0, prompts_1.buildPrompt)({
            topic,
            platform: 'substack-article',
            length: '1000',
            tone: 'conversacional, persuasivo y experto',
            extract
        });
        const res = await (0, node_fetch_1.default)('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4000,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await res.json();
        let parsed = parseClaudeJson(data.content[0].text);
        // Robustez de imagen
        if (!parsed.image_prompt || parsed.image_prompt.length < 500) {
            console.log('[AutoPublisher] Mejorando infografía (Nano Banana) a 1200 palabras...');
            const refineReq = await (0, node_fetch_1.default)('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({
                    model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
                    messages: [
                        { role: 'user', content: prompt },
                        { role: 'assistant', content: data.content[0].text },
                        { role: 'user', content: "Ahora, genera EXCLUSIVAMENTE el image_prompt de 1000 palabras siguiendo todas las reglas visuales de Nano Banana v5. Recrea una INFOGRAFÍA NARRATIVA altamente compleja y detallada." }
                    ]
                })
            });
            const refineData = await refineReq.json();
            if (refineData.content) {
                parsed.image_prompt = refineData.content[0].text;
            }
        }
        return parsed;
    }
    /**
     * 3. Genera la imagen y arma todo, luego crea un DRAFT en Substack.
     */
    static async publishFlowForUser(userId) {
        try {
            console.log('================ AUTO PUBLISHER START ================');
            console.log(`[AutoPublisher] Iniciando flujo para el usuario ${userId}`);
            // 1. Obtener Trending Topic
            const { topic, extract } = await this.findTrendingTopicForToday();
            console.log(`[AutoPublisher] Información curada. Titular detectado: ${topic}`);
            // 2. Redactar el contenido
            const articleObj = await this.writeArticle(topic, extract);
            console.log(`[AutoPublisher] Artículo redactado (Título sugerido: ${articleObj.titulo})`);
            // 3. Generar Imagen Nano Banana v5
            let imageUrl = null;
            if (articleObj.image_prompt && process.env.GEMINI_API_KEY) {
                console.log(`[AutoPublisher] Dibujando infografía Nano Banana v5...`);
                const refImages = [];
                const refPaths = [path_1.default.join(__dirname, '../assets/references/ref1.jpg'), path_1.default.join(__dirname, '../assets/references/ref2.jpg')];
                for (const p of refPaths) {
                    if (fs_1.default.existsSync(p)) {
                        refImages.push({ data: fs_1.default.readFileSync(p).toString('base64'), mimeType: 'image/jpeg' });
                    }
                }
                const finalImgPrompt = `
INSTRUCCIONES DE IDENTIDAD (PARA GEMINI):
Kevin Garza: Basar rostro y físico en fotos adjuntas. Gorra deportiva siempre puesta. Jersey México/Latam.
NUNCA poner máscara en la cara. NUNCA escribir códigos hexadecimales.

PROMPT ARTÍSTICO (CREA UNA INFOGRAFÍA VISUAL!):
${articleObj.image_prompt}
`;
                const imgRes = await image_service_1.ImageService.generate(finalImgPrompt, refImages);
                if (imgRes?.base64) {
                    imageUrl = await image_service_1.ImageService.uploadToSupabase(imgRes.base64, userId);
                }
            }
            // 4. Formatear
            const htmlContent = mdToHtml(articleObj.contenido || '');
            const finalHtml = imageUrl ? `<p><img src="${imageUrl}" alt="Nano Banana v5"></p>\n` + htmlContent : htmlContent;
            // 5. Crear DRAFT en Substack (estado Draft = revisión de usuario manual primero)
            console.log('[AutoPublisher] Iniciando carga a Substack como DRAFT...');
            const draft = await substack_service_1.SubstackService.createDraft(userId, {
                draft_title: articleObj.titulo.trim(),
                draft_subtitle: articleObj.subtitulo.trim()
            });
            // Actualizar borrador
            await substack_service_1.SubstackService.updateDraft(userId, String(draft.id), {
                draft_title: articleObj.titulo.trim(),
                draft_subtitle: articleObj.subtitulo.trim(),
                draft_podcast_url: null,
                draft_podcast_duration: null,
                draft_body: finalHtml,
                section_chosen: false,
                draft_section_id: null,
                audience: 'everyone',
                type: 'newsletter'
            });
            console.log(`[AutoPublisher] ✅ ÉXITO: Borrador guardado en Substack con ID ${draft.id}`);
            console.log('================ AUTO PUBLISHER END ==================');
        }
        catch (e) {
            console.error('[AutoPublisher] FALLO GENERAL:', e);
        }
    }
}
exports.AutoPublisherService = AutoPublisherService;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggestWeb = exports.generateSubstack = exports.suggest = exports.generate = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const prompts_1 = require("../lib/prompts");
const generate = async (req, res) => {
    const { topic, platform, length, tone, audience, keywords, extract, apiKey, customPrompt, mode, targetLang } = req.body;
    if (!apiKey)
        return res.status(400).json({ error: 'API key requerida' });
    let prompt;
    if (mode === 'revise') {
        prompt = `Eres editor experto. Mejora el siguiente texto manteniendo la voz del autor.
Objetivo: mejorar claridad, fluidez, estructura y engagement. NO cambies el tema ni el mensaje central.
${audience ? `Audiencia: ${audience}` : ''}
Texto original:
---
${extract}
---
Devuelve solo el texto mejorado, sin comentarios ni explicaciones.`;
    }
    else if (mode === 'translate') {
        prompt = `Traduce el siguiente texto al ${targetLang || 'inglés'}.
Mantén el tono, estilo, formato markdown y estructura exactos del original.
Texto:
---
${extract}
---
Devuelve solo el texto traducido.`;
    }
    else if (customPrompt) {
        prompt = customPrompt
            .replace(/\{\{topic\}\}/g, topic)
            .replace(/\{\{length\}\}/g, length)
            .replace(/\{\{tone\}\}/g, tone)
            .replace(/\{\{audience\}\}/g, audience || '')
            .replace(/\{\{keywords\}\}/g, keywords || '')
            .replace(/\{\{extract\}\}/g, extract || '');
    }
    else {
        prompt = (0, prompts_1.buildPrompt)({ topic, platform: platform, length, tone, audience, keywords, extract });
    }
    try {
        const aiRes = await (0, node_fetch_1.default)('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 4000,
                messages: [{ role: 'user', content: prompt }]
            }),
        });
        const data = await aiRes.json();
        if (data.error)
            return res.status(400).json({ error: data.error.message });
        res.json({ text: data.content[0].text, usage: data.usage });
    }
    catch {
        res.status(500).json({ error: 'Error calling AI API' });
    }
};
exports.generate = generate;
const suggest = async (req, res) => {
    const { niche, audience, existing, apiKey } = req.body;
    if (!apiKey)
        return res.status(400).json({ error: 'API key requerida' });
    const prompt = (0, prompts_1.buildSuggestTopicsPrompt)(niche, audience, existing || []);
    try {
        const aiRes = await (0, node_fetch_1.default)('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 2000,
                messages: [{ role: 'user', content: prompt }]
            }),
        });
        const data = await aiRes.json();
        if (data.error)
            return res.status(400).json({ error: data.error.message });
        // Parse the inner JSON from text response
        try {
            const result = JSON.parse(data.content[0].text);
            res.json(result);
        }
        catch {
            res.status(500).json({ error: 'Failed to parse AI response' });
        }
    }
    catch {
        res.status(500).json({ error: 'Error calling AI API' });
    }
};
exports.suggest = suggest;
const generateSubstack = async (req, res) => {
    const { topic, platform, length, tone } = req.body;
    const apiKey = process.env.CLAUDE_API_KEY || req.body.apiKey; // Fallback to body apiKey if env not set for some reason
    if (!apiKey) {
        return res.status(400).json({ error: 'API key requerida. Configura CLAUDE_API_KEY en las variables de entorno.' });
    }
    const prompt = `
Eres un ghostwriter experto que escribe en el estilo de Kevin Garza — fundador de Transformateck.

Estilo de escritura:
- Español mexicano conversacional
- Narrativa personal con historias reales
- Honesto sobre limitaciones y fracasos
- Directo, sin rodeos
- Párrafos cortos
- Enfocado en emprendedores y creadores latinos

Escribe un ${platform === 'article' ? 'artículo de newsletter' : 'nota corta'} sobre: "${topic}"

Extensión: ${length} palabras aproximadamente
Tono: ${tone}

${platform === 'article' ?
        'Incluye: título atractivo, introducción con historia personal, desarrollo con puntos prácticos, cierre con llamada a la acción.' :
        'Es una nota corta y directa — máximo 300 palabras, sin título.'}

Responde SOLO con el contenido, sin explicaciones adicionales.
`;
    try {
        const aiRes = await (0, node_fetch_1.default)('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-7-sonnet-20250219',
                max_tokens: 4000,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await aiRes.json();
        if (data.error)
            return res.status(400).json({ error: data.error.message });
        res.json({ text: data.content[0].text, usage: data.usage });
    }
    catch (error) {
        console.error('Error in generateSubstack:', error);
        res.status(500).json({ error: 'Error calling Anthropic API' });
    }
};
exports.generateSubstack = generateSubstack;
const suggestWeb = async (req, res) => {
    const { userInput, apiKey: bodyApiKey } = req.body;
    const apiKey = process.env.CLAUDE_API_KEY || bodyApiKey;
    if (!apiKey) {
        return res.status(400).json({ error: 'API key requerida. Configura CLAUDE_API_KEY en las variables de entorno.' });
    }
    const prompt = `
Eres un experto en contenido para emprendedores latinos.

El usuario quiere publicar contenido sobre: "${userInput}"

Busca en internet las tendencias más recientes sobre este tema y sugiere exactamente 3 títulos de artículos o posts que serían muy relevantes y atractivos para emprendedores latinos en 2026.

Responde SOLO en este formato JSON sin nada más:
{
  "temas": [
    {
      "titulo": "título del artículo",
      "descripcion": "descripción breve de 1 oración de qué trataría",
      "por_que": "por qué este tema es relevante ahorita"
    },
    {
      "titulo": "...",
      "descripcion": "...",
      "por_que": "..."
    },
    {
      "titulo": "...",
      "descripcion": "...",
      "por_que": "..."
    }
  ]
}
`;
    try {
        const aiRes = await (0, node_fetch_1.default)('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-7-sonnet-20250219',
                max_tokens: 1500,
                tools: [{ type: 'web_search_20250305', name: 'web_search' }],
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await aiRes.json();
        if (data.error)
            return res.status(400).json({ error: data.error.message });
        // Parse JSON
        try {
            const resultObj = JSON.parse(data.content[0].text);
            res.json(resultObj);
        }
        catch (parseError) {
            console.error('Failed to parse web suggest JSON:', data.content[0].text);
            res.status(500).json({ error: 'Claude returned invalid JSON' });
        }
    }
    catch (error) {
        console.error('Error in suggestWeb:', error);
        res.status(500).json({ error: 'Error calling Anthropic API' });
    }
};
exports.suggestWeb = suggestWeb;

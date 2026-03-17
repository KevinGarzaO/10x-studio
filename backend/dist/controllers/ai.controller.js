"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.suggest = exports.generate = void 0;
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

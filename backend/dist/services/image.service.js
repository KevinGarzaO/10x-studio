"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageService = void 0;
const genai_1 = require("@google/genai");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class ImageService {
    static client = null;
    static getClient() {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            console.warn("[ImageService] GEMINI_API_KEY no configurada.");
            return null;
        }
        if (!this.client) {
            // @ts-ignore - SDK initialization
            this.client = new genai_1.GoogleGenAI({ apiKey });
        }
        return this.client;
    }
    static async generate(prompt, referenceImages = []) {
        const client = this.getClient();
        if (!client)
            return null;
        try {
            console.log("[ImageService] Generando imagen multimodal con Nano Banana...");
            const parts = referenceImages.map(img => ({
                inlineData: {
                    data: img.data,
                    mimeType: img.mimeType
                }
            }));
            // El prompt se agrega como la última parte
            parts.push({ text: prompt });
            const response = await client.models.generateContent({
                model: "gemini-3.1-flash-image-preview",
                contents: [{ role: 'user', parts }]
            });
            const candidate = response.candidates?.[0];
            const part = candidate?.content?.parts?.[0];
            if (part?.inlineData?.data) {
                return { base64: part.inlineData.data };
            }
            console.error("[ImageService] No image data in response. FinishReason:", candidate?.finishReason);
            return null;
        }
        catch (error) {
            console.error("[ImageService] Error in ImageService.generate:", error);
            return null;
        }
    }
    /**
     * Guarda la imagen localmente en la carpeta /uploads y devuelve la URL.
     */
    static async saveLocal(base64, userId) {
        try {
            const fileName = `art-${userId}-${Date.now()}.png`;
            const uploadDir = path_1.default.join(__dirname, '../uploads');
            // Asegurar que el directorio existe
            if (!fs_1.default.existsSync(uploadDir)) {
                fs_1.default.mkdirSync(uploadDir, { recursive: true });
            }
            const filePath = path_1.default.join(uploadDir, fileName);
            const buffer = Buffer.from(base64, 'base64');
            fs_1.default.writeFileSync(filePath, buffer);
            // URL relativa para que el frontend la use (el servidor sirve /uploads)
            // En desarrollo local será http://localhost:3001/uploads/..., en prod la URL de Railway.
            const port = process.env.PORT || 3001;
            const baseUrl = process.env.BACKEND_URL || `http://localhost:${port}`;
            return `${baseUrl}/uploads/${fileName}`;
        }
        catch (error) {
            console.error("[ImageService] Error saving local image:", error);
            return null;
        }
    }
    // Mantenemos este alias por compatibilidad inmediata con el controlador si no lo hemos actualizado
    static async uploadToSupabase(base64, userId) {
        return this.saveLocal(base64, userId);
    }
}
exports.ImageService = ImageService;

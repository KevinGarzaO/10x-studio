
import fs from 'fs';
import path from 'path';
import { supabase } from './supabase.service';
import { putFile, publicFileUrl } from './storage';

export class ImageService {
  private static client: any = null;

  private static async getClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("[ImageService] GEMINI_API_KEY no configurada.");
      return null;
    }
    if (!this.client) {
      const { GoogleGenAI } = await import("@google/genai");
      // @ts-ignore - SDK initialization
      this.client = new GoogleGenAI({ apiKey });
    }
    return this.client;
  }

  static async generate(prompt: string, referenceImages: { data: string, mimeType: string }[] = []): Promise<{ base64: string } | null> {
    const client = await this.getClient();
    if (!client) return null;

    try {
      console.log("[ImageService] Generando imagen multimodal con Nano Banana...");
      
      const parts: any[] = referenceImages.map(img => ({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType
        }
      }));

      parts.push({ text: prompt });

      const response = await client.models.generateContent({
        model: "gemini-3.1-flash-image-preview",
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      });

      const candidate = response.candidates?.[0];
      const part = candidate?.content?.parts?.[0];
      if (part?.inlineData?.data) {
        return { base64: part.inlineData.data };
      }

      console.error("[ImageService] No image data in response. FinishReason:", candidate?.finishReason);
      return null;
    } catch (error) {
      console.error("[ImageService] Error in ImageService.generate:", error);
      return null;
    }
  }

  /**
   * Upload image to Supabase Storage and return public URL.
   */
  static async uploadToSupabase(base64: string, userId: string): Promise<string | null> {
    try {
      const fileName = `art-${userId}-${Date.now()}.png`;
      const filePath = `generated/${fileName}`;
      
      const buffer = Buffer.from(base64, 'base64');
      
      const uploaded = await putFile('images', filePath, buffer, { contentType: 'image/png', upsert: false });

      if (!uploaded.ok) {
        console.error("[ImageService] Error uploading to storage:", uploaded.error);
        return null;
      }

      console.log(`[ImageService] Imagen subida al almacenamiento: ${filePath}`);
      return publicFileUrl('images', filePath);
    } catch (error) {
      console.error("[ImageService] Error in uploadToSupabase:", error);
      return null;
    }
  }

  /**
   * Save image locally as fallback.
   */
  static async saveLocal(base64: string, userId: string): Promise<string | null> {
    try {
      const fileName = `art-${userId}-${Date.now()}.png`;
      const uploadDir = path.join(process.cwd(), 'uploads');
      
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = path.join(uploadDir, fileName);
      const buffer = Buffer.from(base64, 'base64');
      
      fs.writeFileSync(filePath, buffer);

      const port = process.env.PORT || 3001;
      const baseUrl = process.env.BACKEND_URL || `http://localhost:${port}`;
      
      console.log(`[ImageService] Imagen guardada localmente: ${filePath}`);
      return `${baseUrl}/uploads/${fileName}`;
    } catch (error) {
      console.error("[ImageService] Error saving local image:", error);
      return null;
    }
  }
}

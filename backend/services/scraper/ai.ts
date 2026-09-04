async function callClaude(prompt: string, maxTokens: number = 500, temperature: number = 0.1): Promise<string | null> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.warn("[ScraperAI] CLAUDE_API_KEY no configurada.");
    return null;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-20250414",
        max_tokens: maxTokens,
        temperature,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data: any = await res.json();
    if (data.error) {
      console.error("[Claude] Error:", data.error.message);
      return null;
    }
    return data.content?.[0]?.text ?? null;
  } catch (err) {
    console.error("[Claude] Error llamando API:", (err as Error).message);
    return null;
  }
}

export async function classifyPostWithAI(
  text: string,
  platform: string,
  source: string
): Promise<{
  postType: "vacancy" | "profile" | "unknown";
  workModality: "remote" | "onsite" | "hybrid" | "unknown";
  location: string | null;
  qualityScore: number;
  summary: string;
} | null> {
  try {
    const truncated = text.substring(0, 1500);
    const prompt = [
      "Analiza el siguiente post de " + platform + "/" + source + " y clasificalo.",
      "",
      "TEXTO:",
      truncated,
      "",
      'Responde SOLO con un JSON valido (sin markdown, sin backticks):',
      "{",
      '  "postType": "vacancy" | "profile" | "unknown",',
      '  "workModality": "remote" | "onsite" | "hybrid" | "unknown",',
      '  "location": "ciudad, pais" o null si no se detecta,',
      '  "qualityScore": 0.0 a 1.0 (que tan util es para alguien buscando trabajo/contacto en LatAm),',
      '  "summary": "resumen en 1-2 lineas del post"',
      "}",
      "",
      "Reglas:",
      "- vacancy = alguien CONTRATA (busca personal, publica vacante, ofrece trabajo)",
      "- profile = alguien se OFRECE (busca empleo, se presenta como freelancer)",
      "- unknown = no se puede determinar",
      "- qualityScore alto = tiene contacto directo (email, whatsapp), es reciente, es especifico",
      "- qualityScore bajo = generico, sin contacto, spam, o texto muy corto",
    ].join("\n");

    const textResponse = await callClaude(prompt, 500, 0.1);
    if (!textResponse) return null;

    const cleaned = textResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[ScraperAI] Error clasificando post:", (err as Error).message);
    return null;
  }
}

export async function evaluateSourceWithAI(
  sourceId: string,
  platform: string,
  samplePosts: string[]
): Promise<{
  isRelevant: boolean;
  qualityScore: number;
  categories: string[];
  reason: string;
} | null> {
  try {
    const samples = samplePosts.map((p, i) => (i + 1) + ". " + p.substring(0, 300)).join("\n\n");
    const prompt = [
      "Evalua si este canal/fuente de " + platform + " es relevante para encontrar vacantes de empleo y perfiles de freelancers en espanol para LatAm.",
      "",
      "FUENTE: " + sourceId,
      "MUESTRA DE POSTS (ultimos 5):",
      samples,
      "",
      'Responde SOLO con un JSON valido (sin markdown, sin backticks):',
      "{",
      '  "isRelevant": true/false,',
      '  "qualityScore": 0.0 a 1.0,',
      '  "categories": ["empleo-tech", "freelance", "remoto", etc.],',
      '  "reason": "breve explicacion"',
      "}",
      "",
      "Reglas:",
      "- Relevante si publica vacantes de empleo, ofertas freelance, o perfiles de profesionales en espanol",
      "- No relevante si es spam, contenido general, o solo en ingles",
      "- qualityScore = proporcion de posts que son vacantes/perfiles utiles con contacto",
    ].join("\n");

    const textResponse = await callClaude(prompt, 500, 0.1);
    if (!textResponse) return null;

    const cleaned = textResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[ScraperAI] Error evaluando fuente:", (err as Error).message);
    return null;
  }
}

export async function generateDiscoveryQueries(
  profile: string
): Promise<string[]> {
  try {
    const prompt = [
      "Genera 5-8 queries de busqueda para encontrar canales de Telegram, subforos de Forobeta, o subreddits donde se publiquen vacantes de empleo y perfiles de freelancers en espanol para LatAm.",
      "",
      "Perfil de busqueda: " + profile,
      "",
      'Responde SOLO con un JSON valido (sin markdown, sin backticks):',
      '["query1", "query2", "query3", ...]',
      "",
      "Ejemples de queries buenas:",
      "- empleos remotos react",
      "- freelancers latin america",
      "- vacantes programadores",
      "- dev jobs LATAM",
    ].join("\n");

    const textResponse = await callClaude(prompt, 300, 0.7);
    if (!textResponse) return [];

    const cleaned = textResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[ScraperAI] Error generando queries:", (err as Error).message);
    return [];
  }
}

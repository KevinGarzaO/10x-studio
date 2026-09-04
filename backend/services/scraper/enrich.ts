let genAI: any = null;

async function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAI) {
    const { GoogleGenAI } = await import("@google/genai");
    genAI = new GoogleGenAI({ apiKey });
  }
  return genAI;
}

export interface EnrichedVacancy {
  title: string;
  company: string | null;
  role: string | null;
  location: string | null;
  workModality: "remote" | "onsite" | "hybrid" | "unknown";
  salary: string | null;
  requirements: string[];
  benefits: string[];
  description: string;
  contacts: {
    emails: string[];
    whatsapp: string[];
    telegramLinks: string[];
    applyUrl: string | null;
  };
  qualityScore: number;
  summary: string;
}

export async function enrichVacancyWithAI(
  rawText: string,
  platform: string,
  source: string,
  existingContacts: {
    emails?: string[];
    whatsapp?: string[];
    telegramLinks?: string[];
  } = {}
): Promise<EnrichedVacancy | null> {
  const client = await getClient();
  if (!client) return null;

  try {
    const truncated = rawText.substring(0, 2000);
    const existingContactsStr = JSON.stringify(existingContacts);

    const prompt = [
      "Eres un experto en reclutamiento tech. Analiza este post de " + platform + "/" + source + " y extrae/genera información estructurada de la vacante.",
      "",
      "TEXTO ORIGINAL:",
      truncated,
      "",
      "CONTACTOS YA DETECTADOS:",
      existingContactsStr,
      "",
      'Responde SOLO con un JSON válido (sin markdown, sin backticks):',
      "{",
      '  "title": "título conciso de la vacante (ej: Frontend Developer React)",',
      '  "company": "nombre de la empresa o null",',
      '  "role": "rol específico (ej: Senior Frontend Developer)",',
      '  "location": "ubicación (ej: Ciudad de México, Remoto Global, España)",',
      '  "workModality": "remote" | "onsite" | "hybrid" | "unknown",',
      '  "salary": "rango salarial si se menciona (ej: $3000-5000 USD/mes) o null",',
      '  "requirements": ["requisito 1", "requisito 2", ...],',
      '  "benefits": ["beneficio 1", "beneficio 2", ...],',
      '  "description": "descripción profesional de 2-4 oraciones de la vacante, bien formateada",',
      '  "contacts": {',
      '    "emails": ["email encontrado"],',
      '    "whatsapp": ["link whatsapp encontrado"],',
      '    "telegramLinks": ["link telegram encontrado"],',
      '    "applyUrl": "link de aplicación si existe o null"',
      '  },',
      '  "qualityScore": 0.0 a 1.0,',
      '  "summary": "resumen en 1 línea"',
      "}",
      "",
      "Reglas:",
      "- Si el texto es muy corto o genérico, devuelve qualityScore bajo",
      "- Extrae TODOS los contactos posibles (email, whatsapp, telegram, links)",
      "- Si hay un link de postulación, inclúyelo en applyUrl",
      "- La description debe ser profesional y atractiva",
      "- Si no hay información suficiente para un campo, usa null o array vacío",
    ].join("\n");

    const response = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1000,
      },
    });

    const textResponse = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) return null;

    const cleaned = textResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      title: parsed.title || "Vacante sin título",
      company: parsed.company || null,
      role: parsed.role || null,
      location: parsed.location || null,
      workModality: parsed.workModality || "unknown",
      salary: parsed.salary || null,
      requirements: parsed.requirements || [],
      benefits: parsed.benefits || [],
      description: parsed.description || rawText.substring(0, 500),
      contacts: {
        emails: parsed.contacts?.emails || existingContacts.emails || [],
        whatsapp: parsed.contacts?.whatsapp || existingContacts.whatsapp || [],
        telegramLinks: parsed.contacts?.telegramLinks || existingContacts.telegramLinks || [],
        applyUrl: parsed.contacts?.applyUrl || null,
      },
      qualityScore: parsed.qualityScore ?? 0.5,
      summary: parsed.summary || "",
    };
  } catch (err) {
    console.error("[Enrich] Error enriqueciendo vacante:", (err as Error).message);
    return null;
  }
}

export function buildEnrichedContent(vacancy: EnrichedVacancy): string {
  const lines: string[] = [];

  lines.push(`## ${vacancy.title}`);
  lines.push("");

  if (vacancy.company) lines.push(`**Empresa:** ${vacancy.company}`);
  if (vacancy.role) lines.push(`**Rol:** ${vacancy.role}`);
  if (vacancy.location) lines.push(`**Ubicación:** ${vacancy.location}`);
  if (vacancy.salary) lines.push(`**Presupuesto:** ${vacancy.salary}`);
  if (vacancy.workModality !== "unknown") {
    const modalityMap: Record<string, string> = {
      remote: "Remoto",
      onsite: "Presencial",
      hybrid: "Híbrido",
    };
    lines.push(`**Modalidad:** ${modalityMap[vacancy.workModality] || vacancy.workModality}`);
  }

  lines.push("");
  lines.push("### Descripción");
  lines.push(vacancy.description);

  if (vacancy.requirements.length > 0) {
    lines.push("");
    lines.push("### Requisitos");
    vacancy.requirements.forEach((r) => lines.push(`- ${r}`));
  }

  if (vacancy.benefits.length > 0) {
    lines.push("");
    lines.push("### Beneficios");
    vacancy.benefits.forEach((b) => lines.push(`- ${b}`));
  }

  const contactLines: string[] = [];
  if (vacancy.contacts.emails.length > 0) {
    contactLines.push(`📧 ${vacancy.contacts.emails.join(", ")}`);
  }
  if (vacancy.contacts.whatsapp.length > 0) {
    contactLines.push(`💬 WhatsApp: ${vacancy.contacts.whatsapp.join(", ")}`);
  }
  if (vacancy.contacts.telegramLinks.length > 0) {
    contactLines.push(`📱 Telegram: ${vacancy.contacts.telegramLinks.join(", ")}`);
  }
  if (vacancy.contacts.applyUrl) {
    contactLines.push(`🔗 Postularse: ${vacancy.contacts.applyUrl}`);
  }

  if (contactLines.length > 0) {
    lines.push("");
    lines.push("### Contacto");
    lines.push(contactLines.join("\n"));
  }

  return lines.join("\n");
}

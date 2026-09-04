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
    phones: string[];
    applyUrl: string | null;
  };
  qualityScore: number;
  summary: string;
}

async function callClaude(prompt: string, maxTokens: number = 1000, temperature: number = 0.2): Promise<string | null> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return null;

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
  try {
    const truncated = rawText.substring(0, 2000);
    const existingContactsStr = JSON.stringify(existingContacts);

    const prompt = [
      "Eres un experto en reclutamiento tech y extracción de información. Analiza este post de " + platform + "/" + source + " y extrae TODA la información posible.",
      "",
      "TEXTO ORIGINAL:",
      truncated,
      "",
      "CONTACTOS YA DETECTADOS POR REGEX:",
      existingContactsStr,
      "",
      'INSTRUCCIONES CRÍTICAS:',
      '- DEBES extraer TODOS los medios de contacto del texto (emails, teléfonos, whatsapp, links)',
      '- Si el texto contiene un email, inclúyelo en contacts.emails',
      '- Si contiene un número de teléfono o link de whatsapp, inclúyelo en contacts.whatsapp',
      '- Si contiene un link de telegram, inclúyelo en contacts.telegramLinks',
      '- Si hay un link de postulación (apply, postularse, apply now), inclúyelo en contacts.applyUrl',
      '',
      'Responde SOLO con un JSON válido (sin markdown, sin backticks):',
      "{",
      '  "title": "título conciso de la vacante (ej: Frontend Developer React - Startup Fintech)",',
      '  "company": "nombre de la empresa o null",',
      '  "role": "rol específico (ej: Senior Frontend Developer)",',
      '  "location": "ubicación (ej: Ciudad de México, Remoto Global, España)",',
      '  "workModality": "remote" | "onsite" | "hybrid" | "unknown",',
      '  "salary": "rango salarial si se menciona o null",',
      '  "requirements": ["requisito 1", "requisito 2"],',
      '  "benefits": ["beneficio 1", "beneficio 2"],',
      '  "description": "descripción profesional de 3-5 oraciones de la vacante",',
      '  "contacts": {',
      '    "emails": ["TODOS los emails encontrados"],',
      '    "whatsapp": ["links de whatsapp"],',
      '    "telegramLinks": ["links de telegram"],',
      '    "phones": ["números de teléfono"],',
      '    "applyUrl": "link de aplicación o null"',
      '  },',
      '  "qualityScore": 0.0 a 1.0,',
      '  "summary": "resumen en 1 línea"',
      "}",
      "",
      "Reglas:",
      "- Si el texto es muy corto o spam, qualityScore = 0.1",
      "- Si no hay contacto, qualityScore = 0.2",
      "- Si hay email directo, qualityScore >= 0.7",
      "- Si hay teléfono/whatsapp, qualityScore >= 0.6",
      "- Si solo hay link de postulación, qualityScore = 0.5",
    ].join("\n");

    const textResponse = await callClaude(prompt, 1000, 0.2);
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
        phones: parsed.contacts?.phones || [],
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
    contactLines.push(`📧 Email: ${vacancy.contacts.emails.join(", ")}`);
  }
  if (vacancy.contacts.phones.length > 0) {
    contactLines.push(`📞 Teléfono: ${vacancy.contacts.phones.join(", ")}`);
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

import type { PostType, ProfileInfo, WorkModality } from "./types";

const PROFILE_PATTERNS: RegExp[] = [
  /\bme\s+ofrezco\b/i,
  /\bofrezco\s+mis\s+servicios\b/i,
  /\bbusco\s+(trabajo|empleo|proyectos?|oportunidad(es)?|clientes?)\b/i,
  /\bdisponible\s+para\s+(trabajar|proyectos|freelance)\b/i,
  /\bsoy\s+freelancer\b/i,
  /\bfreelancer\s+disponible\b/i,
  /\bprofesional\s+(independiente|freelance)\s+(busco|ofrezco|disponible)\b/i,
  /\bllevo\s+\d+\s+a[ñn]os\b/i,
  /\bexperiencia\s+en\b/i,
  /\bmis\s+servicios\b/i,
  /\ba\s+la\s+orden\b/i,
  /\bpuedo\s+ayudarte?\b/i,
  /\bsoy\s+(un|una|dev|dise[ñn]ador|programador|freelancer)\b/i,
];

const VACANCY_PATTERNS: RegExp[] = [
  /\bse\s+solicita\b/i,
  /\bsolicitamos\b/i,
  /\bse\s+busca\b/i,
  /\bbuscamos\b/i,
  /\bcontratando\b/i,
  /\bvacantes?\b/i,
  /\bestamos\s+buscando\b/i,
  /\bnecesitamos\b/i,
  /\brequerimos\b/i,
  /\best[aá]n\s+contratando\b/i,
  /\bbusco\s+(?:un[ao]?\s+)?(?!trabajo\b|empleo\b|proyectos?\b|oportunidad|clientes?\b)[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,2}\s+(?:para|que)\b/i,
  /(?:Senior|Junior|Mid|Lead|Principal|Staff)?\s*(?:Frontend|Backend|Full\s*Stack|DevOps|Data|Mobile|Cloud|Software|Systems|Platform|Infrastructure)\s+(?:Developer|Engineer|Architect|Analyst|Specialist|Manager|Designer|Consultant)/i,
  /(?:Desarrollador[a]?|Dise[ñn]ador[a]?|Ingeniero[a]?|Especialista|Consultor[a]?|Asesor[a]?|Ejecutivo[a]?|Representante)\s+(?:de\s+|en\s+)?[A-Z]/i,
  /\bhiring\b/i,
  /\bwe'?re\s+hiring\b/i,
  /\blooking\s+for\b/i,
  /\bjoin\s+our\s+team\b/i,
  /\bopen\s+position\b/i,
  /\b100%\s+remoto\b/i,
  /\btiempo\s+completo\b/i,
  /\binicio\s+inmediato\b/i,
  /[$€]\s?\d[\d,.]*(?:\s?(?:USD|MXN|EUR|\/\s?(?:hora|hr|mes|month)))\b/i,
  /\boferta\s+(?:remota|laboral|de\s+trabajo|empleo)\b/i,
];

export function classifyPostType(text: string, forumHint?: string | null): PostType {
  if (forumHint) {
    const hint = forumHint.toLowerCase();
    if (hint.includes("ofrezco")) return "profile";
    if (hint.includes("solicita") || hint.includes("busca")) return "vacancy";
  }

  const isProfile = PROFILE_PATTERNS.some((re) => re.test(text));
  const isVacancy = VACANCY_PATTERNS.some((re) => re.test(text));

  if (isProfile && !isVacancy) return "profile";
  if (isVacancy && !isProfile) return "vacancy";
  return "unknown";
}

const HYBRID_RE = /\bh[ií]brido\b|\bhybrid\b/i;
const REMOTE_RE = /\bremot[oa]\b|\bremote\b|\bhome\s*office\b|\bdesde\s+casa\b/i;
const ONSITE_RE = /\bpresencial\b|\bon-?site\b|\ben\s+oficina\b|\boficina\b/i;

export function detectWorkModality(text: string): WorkModality {
  if (HYBRID_RE.test(text)) return "hybrid";
  if (REMOTE_RE.test(text)) return "remote";
  if (ONSITE_RE.test(text)) return "onsite";
  return "unknown";
}

const FLAG_TO_COUNTRY: Record<string, string> = {
  "🇲🇽": "México", "🇨🇴": "Colombia", "🇦🇷": "Argentina", "🇻🇪": "Venezuela",
  "🇵🇪": "Perú", "🇨🇱": "Chile", "🇪🇨": "Ecuador", "🇧🇴": "Bolivia",
  "🇵🇾": "Paraguay", "🇺🇾": "Uruguay", "🇨🇷": "Costa Rica", "🇵🇦": "Panamá",
  "🇬🇹": "Guatemala", "🇭🇳": "Honduras", "🇸🇻": "El Salvador", "🇳🇮": "Nicaragua",
  "🇩🇴": "República Dominicana", "🇨🇺": "Cuba", "🇵🇷": "Puerto Rico",
  "🇪🇸": "España", "🇧🇷": "Brasil", "🇺🇸": "Estados Unidos",
};

const CITY_TO_LOCATION: Array<[RegExp, string]> = [
  [/\bciudad de m[eé]xico\b|\bcdmx\b|\bmexico city\b/i, "Ciudad de México, México"],
  [/\bguadalajara\b/i, "Guadalajara, México"],
  [/\bmonterrey\b/i, "Monterrey, México"],
  [/\bbogot[aá]\b/i, "Bogotá, Colombia"],
  [/\bmedell[ií]n\b/i, "Medellín, Colombia"],
  [/\bbuenos aires\b/i, "Buenos Aires, Argentina"],
  [/\bcaracas\b/i, "Caracas, Venezuela"],
  [/\blima\b/i, "Lima, Perú"],
  [/\bsantiago\b/i, "Santiago, Chile"],
  [/\bquito\b/i, "Quito, Ecuador"],
  [/\bmontevideo\b/i, "Montevideo, Uruguay"],
];

const COUNTRY_RE: Array<[RegExp, string]> = [
  [/\bm[eé]xico\b/i, "México"], [/\bcolombia\b/i, "Colombia"], [/\bargentina\b/i, "Argentina"],
  [/\bvenezuela\b/i, "Venezuela"], [/\bper[uú]\b/i, "Perú"], [/\bchile\b/i, "Chile"],
  [/\becuador\b/i, "Ecuador"], [/\buruguay\b/i, "Uruguay"], [/\bespa[ñn]a\b/i, "España"],
  [/\bbrasil\b/i, "Brasil"],
];

export function guessLocation(text: string): string | null {
  for (const flag of Object.keys(FLAG_TO_COUNTRY)) {
    if (text.includes(flag)) return FLAG_TO_COUNTRY[flag];
  }
  for (const [re, label] of CITY_TO_LOCATION) {
    if (re.test(text)) return label;
  }
  for (const [re, label] of COUNTRY_RE) {
    if (re.test(text)) return label;
  }
  return null;
}

const ROLE_KEYWORDS = [
  "Desarrollador Full Stack", "Desarrollador Frontend", "Desarrollador Backend",
  "Desarrollador", "Programador", "Diseñador Gráfico", "Diseñador Web",
  "Diseñador UX", "Diseñador de Producto", "Marketing Digital",
  "Community Manager", "Copywriter", "Redactor", "Traductor",
  "Asistente Virtual", "Contador", "Abogado", "Fotógrafo", "Editor de Video",
  "SEO", "Social Media", "Automatización", "Data Entry",
  "Ilustrador", "Animador", "Locutor", "Consultor", "Analista",
];

const SKILL_KEYWORDS = [
  "React", "Node.js", "Node", "Python", "PHP", "Java", "JavaScript",
  "TypeScript", "WordPress", "Shopify", "Excel", "Photoshop", "Illustrator",
  "Canva", "HubSpot", "Salesforce", "ManyChat", "Make", "Zapier",
  "Google Sheets", "Calendly", "SEO", "SEM", "Google Ads", "Facebook Ads",
  "Figma", "After Effects", "Premiere", "AutoCAD", "SQL", "MySQL",
  "PostgreSQL", "CRM", "Laravel", "Vue.js", "Vue", "Angular", "Django",
];

const YEARS_RE = /(\d{1,2})\+?\s*(?:años|anios|years?)\s*(?:de\s+)?(?:experiencia|experience)?/i;
const RATE_RE = /[$€]\s?\d[\d,.]*(?:\s?-\s?[$€]?\s?\d[\d,.]*)?(?:\s?(?:USD|MXN|EUR|pesos?|d[oó]lares?|\/\s?(?:hora|mes|proyecto|hr)))?/i;
const URL_RE = /https?:\/\/[^\s)]+/g;

function matchKeywords(text: string, dictionary: string[]): string[] {
  const lower = text.toLowerCase();
  return dictionary.filter((k) => lower.includes(k.toLowerCase()));
}

export function extractProfileInfo(text: string): ProfileInfo {
  const yearsMatch = text.match(YEARS_RE);
  const rateMatch = text.match(RATE_RE);
  const links = [...new Set((text.match(URL_RE) ?? []).filter((u) => !/wa\.me|t\.me\//i.test(u)))];

  return {
    roles: matchKeywords(text, ROLE_KEYWORDS),
    skills: matchKeywords(text, SKILL_KEYWORDS),
    yearsExperience: yearsMatch ? parseInt(yearsMatch[1], 10) : null,
    rate: rateMatch ? rateMatch[0].trim() : null,
    portfolioLinks: links,
  };
}

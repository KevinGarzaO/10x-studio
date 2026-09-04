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
  /(?:👨‍💻|👩‍💻|🧑‍💻|💼|🎯|🚀|🔧|⚡|🛠️)\s*[A-Z]/,
  /(?:🧑‍💼|👩‍💼|👨‍💼|📋|📝|🏢)\s*[A-Z]/,
  /(?:Senior|Junior|Mid|Lead|Principal|Staff)?\s*(?:Frontend|Backend|Full\s*Stack|DevOps|Data|Mobile|Cloud|Software|Systems|Platform|Infrastructure)\s+(?:Developer|Engineer|Architect|Analyst|Specialist|Manager|Designer|Consultant)/i,
  /(?:Desarrollador[a]?|Dise[ñn]ador[a]?|Ingeniero[a]?|Especialista|Consultor[a]?|Asesor[a]?|Ejecutivo[a]?|Representante)\s+(?:de\s+|en\s+)?[A-Z]/i,
  /\b(?:estamos?\s+)?contratando\b/i,
  /\bhiring\b/i,
  /\bwe'?re\s+hiring\b/i,
  /\blooking\s+for\b/i,
  /\bjob\s+opening\b/i,
  /\bwe\s+are\s+looking\b/i,
  /\bjoin\s+our\s+team\b/i,
  /\bopen\s+position\b/i,
  /\b100%\s+remoto\b/i,
  /\btiempo\s+completo\b/i,
  /\binicio\s+inmediato\b/i,
  /\bremoto.*(?:global|internacional|latinoam[eé]rica)\b/i,
  /(?:💼|📢|🔥|✅|👥|🎯|🏆|💰|📝)\s*.{0,30}(?:busca|buscamos|se busca|hiring|vacante|vacancy)/i,
  /[$€]\s?\d[\d,.]*(?:\s?(?:USD|MXN|EUR|\/\s?(?:hora|hr|mes|month)))\b/i,
  /(?:linkedin\.com\/posts|lnkd\.in)/i,
  /\bsomos\s+(?:una?\s+)?(?:empresa|compañía|startup)\b.*?\bbuscamos\b/is,
  /\bofrecemos\b.*?\b(?:salario|beneficio|remoto|puesto|vacante)\b/is,
  /\bsalario\b.*?\b(?:bueno|atractivo|competitivo)\b/i,
  /\b(?:aplica|apliquen|envía|envian)\s+(?:tu\s+)?(?:cv|currículum|hoja\s+de\s+vida|candidatura)\b/i,
  /\boferta\s+(?:remota|laboral|de\s+trabajo|empleo)\b/i,
  /\bapp\b.*\b(?:lanzamiento|disponible|pronto)\b/i,
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
  "Editor de Vídeo", "SEO", "Social Media", "Automatización", "Data Entry",
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

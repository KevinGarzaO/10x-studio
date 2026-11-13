import type { ContactInfo, Post } from "./types";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const WHATSAPP_RE = /(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send|whatsapp\.com\/send)\/?\+?\d+/g;
const TELEGRAM_RE = /(?:https?:\/\/)?(?:t\.me|telegram\.me)\/[a-zA-Z0-9_]+/g;
const MENTION_RE = /@[A-Za-z0-9_]{4,}/g;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

const ROLE_LOCAL_PARTS = new Set([
  "info", "contacto", "contact", "hr", "rrhh", "recursoshumanos", "talent",
  "talento", "jobs", "careers", "empleo", "empleos", "vacantes", "ventas",
  "sales", "admin", "administracion", "soporte", "support", "hola", "hello",
  "hi", "team", "equipo", "reclutamiento", "recruiting", "recruiter",
  "noreply", "no-reply", "notificaciones", "notifications", "people",
  "peopleteam", "hiring", "staffing", "cv", "curriculum", "resume", "apply",
  "aplicaciones", "postulaciones",
]);

export function guessNameFromEmail(email: string): string | null {
  const local = email.split("@")[0]?.toLowerCase();
  if (!local) return null;

  const parts = local.split(/[._-]+/).filter(Boolean);
  if (!parts.length || parts.length > 3) return null;
  if (parts.some((p) => /\d/.test(p) || p.length < 2)) return null;
  if (parts.some((p) => ROLE_LOCAL_PARTS.has(p))) return null;

  return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
}

const EMPRESA_LABEL_RE = /Empresa\s*:?\s*\n?\s*([^\n]{2,80})/i;
const JOB_VERB_RE = /\b(busca|solicita|requiere|necesita|est[aá]\s+buscando)\b/i;

function guessCompanyName(text: string, email: string): string {
  const m = text.match(EMPRESA_LABEL_RE);
  if (m?.[1]?.trim()) {
    let company = m[1].trim().replace(/[.,;]+$/, "");
    const cut = company.match(JOB_VERB_RE);
    if (cut?.index && cut.index > 2) company = company.slice(0, cut.index).trim();
    return company;
  }
  return email.split("@")[1] ?? "la empresa";
}

function buildReferTo(author: string | null, nameGuess: string | null, text: string, email: string): string {
  if (author) return author;
  if (nameGuess) return nameGuess;
  return `Departamento de RRHH de ${guessCompanyName(text, email)}`;
}

export function extractContacts(text: string, author: string | null = null): ContactInfo {
  if (!text) return {};

  const contacts: ContactInfo = {};

  const emails = [...new Set(text.match(EMAIL_RE) ?? [])];
  if (emails.length) {
    contacts.emails = emails.sort();
    contacts.contactNameGuess = guessNameFromEmail(contacts.emails[0]);
    contacts.referTo = buildReferTo(author, contacts.contactNameGuess, text, contacts.emails[0]);
  }

  const whatsapp = [...new Set(text.match(WHATSAPP_RE) ?? [])];
  if (whatsapp.length) contacts.whatsapp = whatsapp.sort();

  const telegramLinks = [...new Set(text.match(TELEGRAM_RE) ?? [])];
  if (telegramLinks.length) contacts.telegramLinks = telegramLinks.sort();

  const mentions = [...new Set(text.match(MENTION_RE) ?? [])].filter((m) => {
    const local = m.slice(1).toLowerCase();
    if (ROLE_LOCAL_PARTS.has(local)) return false;
    if (local.includes("gmail") || local.includes("hotmail") || local.includes("yahoo") || local.includes("outlook")) return false;
    return true;
  });
  if (mentions.length) contacts.mentions = mentions.sort();

  const phoneCandidates = text.match(PHONE_RE) ?? [];
  const phones = [...new Set(phoneCandidates.map((p) => p.trim()).filter((p) => {
    const digits = p.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return false;
    if (/^\d{10,}$/.test(p.replace(/\s/g, ""))) return false;
    if (/^\d[\d.]+$/.test(p)) return false;
    return true;
  }))];
  if (phones.length) contacts.phones = phones.sort();

  return contacts;
}

export function hasContact(post: Post): boolean {
  return (
    (post.contacts.emails?.length ?? 0) > 0 ||
    (post.contacts.whatsapp?.length ?? 0) > 0 ||
    (post.contacts.telegramLinks?.length ?? 0) > 0 ||
    (post.contacts.phones?.length ?? 0) > 0 ||
    !!post.contacts.applyUrl
  );
}

export function isSpanish(post: Post): boolean {
  return post.language === "spa" || post.language === "und";
}

const SPANISH_WORDS = /\b(el|la|los|las|de|del|en|es|que|por|con|para|una|uno|como|más|pero|sus|le|ya|o|este|sí|porque|esta|entre|cuando|sobre|también|me|hasta|hay|donde|quien|desde|todo|nos|durante|todos|uno|les|ni|contra|otros|ese|eso|ante|ellos|e|esto|mí|antes|algunos|qué|unos|yo|otro|otras|otra|él|tanto|esa|estos|mucho|quienes|nada|muchos|cual|poco|ella|estar|estas|algunas|algo|nosotros|mi|mis|tú|te|ti|tu|tus|ellas|nosotras|vosotros|vosotras|os|mío|mía|míos|mías|tuyo|tuya|tuyos|tuyas|suyo|suya|suyos|suyas|nuestro|nuestra|nuestros|nuestras|vuestro|vuestra|vuestros|vuestras|esos|esas|estoy|estás|está|estamos|estáis|están|esté|estés|estemos|estéis|estén|estaré|estarás|estará|estaremos|estaréis|estarán|estaría|estarías|estaríamos|estaríais|estarían|estaba|estabas|estábamos|estabais|estaban|estuve|estuviste|estuvo|estuvimos|estuvisteis|estuvieron|estuviera|estuvieras|estuviéramos|estuvierais|estuvieran|estuviese|estuvieses|estuviésemos|estuvieseis|estuviesen|estando|estado|estada|estados|estadas|estad|he|has|ha|hemos|habéis|han|haya|hayas|hayamos|hayáis|hayan|habré|habrás|habrá|habremos|habréis|habrán|habría|habrías|habríamos|habríais|habrían|había|habías|habíamos|habíais|habían|hube|hubiste|hubo|hubimos|hubisteis|hubieron|hubiera|hubieras|hubiéramos|hubierais|hubieran|hubiese|hubieses|hubiésemos|hubieseis|hubiesen|habiendo|habido|habida|habidos|habidas)\b/i;

export function detectLanguage(text: string): string {
  if (!text) return 'und';
  const sample = text.substring(0, 500).toLowerCase();
  const spanishMatches = (sample.match(SPANISH_WORDS) || []).length;
  const words = sample.split(/\s+/).length;
  if (words === 0) return 'und';
  return (spanishMatches / words) > 0.15 ? 'spa' : 'eng';
}

export function isRecent(post: Post, days: number = 30): boolean {
  if (!post.postDate) return false;
  const postDate = new Date(post.postDate);
  const now = new Date();
  const diffMs = now.getTime() - postDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= days;
}

export function applyFilters(
  posts: Post[],
  requireEmail: boolean,
  requireSpanish: boolean,
  requireRecent: boolean = false,
  maxDays: number = 90
): Post[] {
  return posts.filter(
    (p) =>
      (!requireEmail || hasContact(p)) &&
      (!requireSpanish || isSpanish(p)) &&
      (!requireRecent || isRecent(p, maxDays))
  );
}

export function applyDateFilter(posts: Post[], maxDays: number = 30): Post[] {
  return posts.filter((p) => isRecent(p, maxDays));
}

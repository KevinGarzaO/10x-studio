/**
 * Generates SEO-friendly slugs for job posts.
 * Format: /vacantes/{titulo-normalizado}-{sufijo-corto}
 */

const ACCENT_MAP: Record<string, string> = {
  a: "á",
  e: "é",
  i: "í",
  o: "ó",
  u: "ú",
  n: "ñ",
  c: "ç",
};

function removeAccents(str: string): string {
  return str.replace(/[áéíóúñç]/gi, (char) => {
    const lower = char.toLowerCase();
    for (const [key, value] of Object.entries(ACCENT_MAP)) {
      if (value === lower) return key;
    }
    return char;
  });
}

/**
 * Generates a slug from a title and UUID.
 * Example: "Desarrollador Full Stack Remoto CDMX" + "de5a855c-f8b2-4e78-9ab1-89992e08ccad"
 * => "desarrollador-full-stack-remoto-cdmx-de5a855c"
 */
export function generateSlug(title: string, id: string): string {
  const normalized = removeAccents(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const shortId = id.replace(/-/g, "").substring(0, 8);

  return `${normalized}-${shortId}`;
}

/**
 * Validates that a slug matches the expected format.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*-[a-f0-9]{8}$/.test(slug);
}

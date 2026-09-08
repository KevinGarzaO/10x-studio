import { detectLanguage, extractContacts } from "../contacts";
import { detectWorkModality } from "../enrich";
import type { Post } from "../types";

interface LeverPosting {
  text: string;
  categories: {
    location: string | null;
    team: string | null;
  } | null;
  hostedUrl: string;
  createdAt: number;
  descriptionPlain: string | null;
  description: string | null;
  id: string;
}

function normalizeLocation(loc: string | null): string | null {
  if (!loc) return null;
  if (/remote|remoto/i.test(loc)) return "Remoto";
  return loc;
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Lever's API is inconsistent about which description field it actually
// populates — some postings (seen on real Spotify/LogRocket jobs) ship an
// empty descriptionPlain while the HTML description field is fully
// populated. Falling back to that (stripped) avoids silently storing a job
// with no description at all.
function extractDescription(posting: LeverPosting): string | null {
  if (posting.descriptionPlain?.trim()) return posting.descriptionPlain.substring(0, 1500);
  if (posting.description?.trim()) return stripHtml(unescapeHtml(posting.description)).substring(0, 1500);
  return null;
}

export async function fetchLever(
  company: string,
  log: (msg: string) => void = () => {}
): Promise<Post[]> {
  const url = `https://api.lever.co/v0/postings/${company}?mode=json`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AvoTalent/1.0" },
    });

    if (!res.ok) {
      log(`[Lever] ${company}: HTTP ${res.status}`);
      return [];
    }

    const data: LeverPosting[] = await res.json();
    const posts: Post[] = [];

    for (const posting of (Array.isArray(data) ? data : [])) {
      const location = normalizeLocation(posting.categories?.location ?? null);
      const team = posting.categories?.team ?? null;
      const postDate = posting.createdAt
        ? new Date(posting.createdAt).toISOString()
        : null;
      const description = extractDescription(posting);
      const text = [
        `## ${posting.text}`,
        `**Empresa:** ${company}`,
        team ? `**Equipo:** ${team}` : null,
        location ? `**Ubicación:** ${location}` : null,
        "",
        description ? `### Descripción` : null,
        description,
        "",
        `### Contacto`,
        `🔗 Postularse: ${posting.hostedUrl}`,
      ]
        .filter(Boolean)
        .join("\n");

      const contacts = extractContacts(text, null);
      contacts.applyUrl = posting.hostedUrl;

      posts.push({
        platform: "lever",
        source: company,
        postId: posting.id,
        url: posting.hostedUrl,
        postDate,
        insertedAt: "",
        author: company,
        views: null,
        text,
        language: detectLanguage(text),
        postType: "vacancy",
        location: location,
        workModality: detectWorkModality(text),
        contacts,
      });
    }

    log(`[Lever] ${company}: ${posts.length} vacantes`);
    return posts;
  } catch (err) {
    log(`[Lever] ${company}: Error — ${(err as Error).message}`);
    return [];
  }
}

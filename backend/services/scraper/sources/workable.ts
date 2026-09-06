import { detectLanguage, extractContacts } from "../contacts";
import { detectWorkModality } from "../enrich";
import type { Post } from "../types";

interface WorkableJob {
  title: string;
  shortcode: string;
  department: string | null;
  location: string | null;
  published_on: string;
  url: string;
}

interface WorkableResponse {
  name: string;
  jobs: WorkableJob[];
}

function normalizeLocation(loc: string | null): string | null {
  if (!loc) return null;
  if (/remote|remoto/i.test(loc)) return "Remoto";
  return loc;
}

export async function fetchWorkable(
  shortcode: string,
  log: (msg: string) => void = () => {}
): Promise<Post[]> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${shortcode}?details=true`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AvoTalent/1.0" },
    });

    if (!res.ok) {
      log(`[Workable] ${shortcode}: HTTP ${res.status}`);
      return [];
    }

    const data: WorkableResponse = await res.json();
    const posts: Post[] = [];
    const companyName = data.name || shortcode;

    for (const job of (data.jobs ?? [])) {
      const applyUrl = `https://apply.workable.com/${shortcode}/j/${job.shortcode}/`;
      const location = normalizeLocation(job.location);
      const text = [
        `## ${job.title}`,
        `**Rol:** ${job.title}`,
        location ? `**Ubicación:** ${location}` : null,
        `**Modalidad:** ${/remote|remoto/i.test(job.location ?? "") ? "Remoto" : "Presencial"}`,
        "",
        `### Contacto`,
        `🔗 Postularse: ${applyUrl}`,
      ]
        .filter(Boolean)
        .join("\n");

      const contacts = extractContacts(text, null);
      contacts.applyUrl = applyUrl;

      posts.push({
        platform: "workable",
        source: shortcode,
        postId: job.shortcode,
        url: applyUrl,
        postDate: job.published_on ?? null,
        insertedAt: "",
        author: companyName,
        views: null,
        text,
        language: detectLanguage(text),
        postType: "vacancy",
        location: location,
        workModality: detectWorkModality(text),
        contacts,
        company: companyName,
        companyLogo: null,
      });
    }

    log(`[Workable] ${shortcode}: ${posts.length} vacantes`);
    return posts;
  } catch (err) {
    log(`[Workable] ${shortcode}: Error — ${(err as Error).message}`);
    return [];
  }
}

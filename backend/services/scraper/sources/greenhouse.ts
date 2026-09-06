import { detectLanguage, extractContacts } from "../contacts";
import { detectWorkModality } from "../enrich";
import type { Post } from "../types";

interface GreenhouseJob {
  id: number;
  title: string;
  company_name: string | null;
  location: { name: string } | null;
  absolute_url: string;
  updated_at: string;
  content: string | null;
  departments: Array<{ name: string }> | null;
}

interface GreenhouseResponse {
  jobs: GreenhouseJob[];
}

function normalizeLocation(loc: string | null): string | null {
  if (!loc) return null;
  if (/remote|remoto/i.test(loc)) return "Remoto";
  return loc;
}

export async function fetchGreenhouse(
  boardToken: string,
  log: (msg: string) => void = () => {}
): Promise<Post[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${boardToken}/jobs?content=true`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "AvoTalent/1.0" },
    });

    if (!res.ok) {
      log(`[Greenhouse] ${boardToken}: HTTP ${res.status}`);
      return [];
    }

    const data: GreenhouseResponse = await res.json();
    const posts: Post[] = [];

    for (const job of (data.jobs ?? [])) {
      const location = normalizeLocation(job.location?.name ?? null);
      const department = job.departments?.[0]?.name ?? null;
      const companyName = job.company_name || boardToken;
      const text = [
        `## ${job.title}`,
        department ? `**Departamento:** ${department}` : null,
        location ? `**Ubicación:** ${location}` : null,
        job.content ? job.content.substring(0, 1000) : null,
        "",
        `### Contacto`,
        `🔗 Postularse: ${job.absolute_url}`,
      ]
        .filter(Boolean)
        .join("\n");

      const contacts = extractContacts(text, null);
      contacts.applyUrl = job.absolute_url;

      posts.push({
        platform: "greenhouse",
        source: boardToken,
        postId: String(job.id),
        url: job.absolute_url,
        postDate: job.updated_at ?? null,
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

    log(`[Greenhouse] ${boardToken}: ${posts.length} vacantes`);
    return posts;
  } catch (err) {
    log(`[Greenhouse] ${boardToken}: Error — ${(err as Error).message}`);
    return [];
  }
}

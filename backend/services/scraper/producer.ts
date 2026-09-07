import { getActiveSources, insertPost } from "./db";
import { fetchWorkable } from "./sources/workable";
import { fetchGreenhouse } from "./sources/greenhouse";
import { fetchLever } from "./sources/lever";
import { hasContact, isRecent } from "./contacts";
import { enforceSafetyCap } from "./retention";
import type { Post } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Caps how many postings from a single company's ATS feed get processed per
// run — some boards (SpaceX, Databricks) list 100+ open reqs at once, which
// otherwise dominates the daily sync budget for that company alone.
const MAX_POSTS_PER_SOURCE = 30;

// Roles we don't want on the platform. Matched against the job title only
// (word-boundary, case-insensitive) so it doesn't false-positive on
// unrelated text mentioning e.g. "compliance" in a job description.
const EXCLUDED_TITLE_PATTERN = /\b(legal|counsel|compliance|policy|attorney|abogad[oa])\b/i;

function extractTitle(text: string): string {
  return text.split("\n")[0]?.replace(/^#+\s*/, "").trim() ?? "";
}

/**
 * Production cron: lee fuentes ATS activas de Supabase, scrapea,
 * y guarda posts nuevos sin IA — todo se inserta como llega.
 */
export async function runProduction(
  log: (msg: string) => void = () => {}
): Promise<{
  sourcesTested: number;
  postsFound: number;
  postsWithContact: number;
  postsInserted: number;
}> {
  const sources = await getActiveSources();
  // Only ATS platforms
  const atsSources = sources.filter(s => ["workable", "greenhouse", "lever"].includes(s.platform));
  log(`[Production] ${atsSources.length} fuentes ATS activas (de ${sources.length} totales)`);

  let sourcesTested = 0;
  let postsFound = 0;
  let postsWithContact = 0;
  let postsInserted = 0;

  for (const source of atsSources) {
    log(`[Production] Scraping ${source.platform}/${source.source_id}...`);
    sourcesTested++;

    try {
      let posts: Post[] = [];

      switch (source.platform) {
        case "workable":
          posts = await fetchWorkable(source.source_id, log);
          break;
        case "greenhouse":
          posts = await fetchGreenhouse(source.source_id, log);
          break;
        case "lever":
          posts = await fetchLever(source.source_id, log);
          break;
      }

      postsFound += posts.length;

      // Most recent postings first, then cap — a board with more open reqs
      // than the cap loses its oldest listings, not a random slice.
      const prioritized = [...posts]
        .sort((a, b) => new Date(b.postDate ?? 0).getTime() - new Date(a.postDate ?? 0).getTime())
        .slice(0, MAX_POSTS_PER_SOURCE);

      if (posts.length > MAX_POSTS_PER_SOURCE) {
        log(`[Production] ${source.platform}/${source.source_id}: ${posts.length} posts, recortado a ${MAX_POSTS_PER_SOURCE} más recientes`);
      }

      for (const post of prioritized) {
        if (!isRecent(post, 30)) {
          log(`[Production] Skipping old post (${post.postDate}): ${post.postId}`);
          continue;
        }

        const title = extractTitle(post.text);
        if (EXCLUDED_TITLE_PATTERN.test(title)) {
          log(`[Production] Skipping excluded category (${title}): ${post.postId}`);
          continue;
        }

        const hasCt = hasContact(post);
        if (!hasCt) {
          log(`[Production] Skipping no contact/apply link: ${post.postId}`);
          continue;
        }
        postsWithContact++;

        // Upsert (see insertPost) — a job seen before gets its content
        // refreshed instead of being silently skipped, so an incomplete
        // first scrape self-heals on the next run.
        await insertPost({
          platform: post.platform,
          source: post.source,
          post_id: post.postId,
          url: post.url,
          post_date: post.postDate,
          author: post.author,
          views: post.views,
          text: post.text,
          language: post.language,
          post_type: post.postType,
          location: post.location,
          work_modality: post.workModality,
          profile: post.profile ? post.profile as unknown as Record<string, unknown> : null,
          contacts: post.contacts as unknown as Record<string, unknown>,
          quality_score: 0.5,
          summary: post.text.substring(0, 200),
          is_spam: false,
          search_profile: null,
          forum_hint: post.forumHint ?? null,
          company: post.company ?? null,
          company_logo: post.companyLogo ?? null,
        });

        postsInserted++;
      }

      log(`[Production] ${source.platform}/${source.source_id}: ${posts.length} posts encontrados, ${prioritized.filter(p => hasContact(p)).length} con contacto de ${prioritized.length} procesados`);
    } catch (err) {
      log(`[Production] Error con ${source.platform}/${source.source_id}: ${(err as Error).message}`);
    }

    await sleep(2000);
  }

  log(`[Production] Completado: ${sourcesTested} fuentes, ${postsFound} posts, ${postsWithContact} con contacto, ${postsInserted} insertados`);

  await enforceSafetyCap(log);

  return { sourcesTested, postsFound, postsWithContact, postsInserted };
}

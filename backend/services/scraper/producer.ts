import { getActiveSources, insertPost, postExists } from "./db";
import { fetchWorkable } from "./sources/workable";
import { fetchGreenhouse } from "./sources/greenhouse";
import { fetchLever } from "./sources/lever";
import { hasContact, isRecent } from "./contacts";
import type { Post } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

      for (const post of posts) {
        const exists = await postExists(post.platform, post.source, post.postId);
        if (exists) continue;

        if (!isRecent(post, 30)) {
          log(`[Production] Skipping old post (${post.postDate}): ${post.postId}`);
          continue;
        }

        const hasCt = hasContact(post);
        if (hasCt) postsWithContact++;

        // Insert as-is — no AI classification or enrichment
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
          quality_score: hasCt ? 0.5 : 0.3,
          summary: post.text.substring(0, 200),
          is_spam: false,
          search_profile: null,
          forum_hint: post.forumHint ?? null,
          company: post.company ?? null,
          company_logo: post.companyLogo ?? null,
        });

        postsInserted++;
      }

      log(`[Production] ${source.platform}/${source.source_id}: ${posts.length} posts, ${posts.filter(p => hasContact(p)).length} con contacto`);
    } catch (err) {
      log(`[Production] Error con ${source.platform}/${source.source_id}: ${(err as Error).message}`);
    }

    await sleep(2000);
  }

  log(`[Production] Completado: ${sourcesTested} fuentes, ${postsFound} posts, ${postsWithContact} con contacto, ${postsInserted} insertados`);
  return { sourcesTested, postsFound, postsWithContact, postsInserted };
}

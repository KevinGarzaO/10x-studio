import { getActiveSources, insertPost, postExists } from "./db";
import { classifyPostWithAI } from "./ai";
import { enrichVacancyWithAI, buildEnrichedContent } from "./enrich";
import { fetchTelegramChannel } from "./sources/telegram";
import { fetchForobetaForum } from "./sources/forobeta";
import { fetchRedditListing } from "./sources/reddit";
import { hasContact } from "./contacts";
import type { Post } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Production cron: lee fuentes activas de Supabase, scrapea,
 * clasifica con IA, y guarda posts nuevos.
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
  log(`[Production] ${sources.length} fuentes activas encontradas`);

  let sourcesTested = 0;
  let postsFound = 0;
  let postsWithContact = 0;
  let postsInserted = 0;

  for (const source of sources) {
    log(`[Production] Scraping ${source.platform}/${source.source_id}...`);
    sourcesTested++;

    try {
      let posts: Post[] = [];

      switch (source.platform) {
        case "telegram":
          posts = await fetchTelegramChannel(source.source_id, 2, 2000, false, false, log);
          break;
        case "forobeta":
          posts = await fetchForobetaForum(source.source_id, 2, 2000, false, false, log);
          break;
        case "reddit":
          posts = await fetchRedditListing([source.source_id], 1, 2000, false, false, log);
          break;
      }

      postsFound += posts.length;

      for (const post of posts) {
        const exists = await postExists(post.platform, post.source, post.postId);
        if (exists) continue;

        const hasCt = hasContact(post);
        if (hasCt) postsWithContact++;

        // Classify with AI for quality score
        const aiResult = await classifyPostWithAI(post.text, post.platform, post.source);
        const qualityScore = aiResult?.qualityScore ?? (hasCt ? 0.5 : 0.2);
        const summary = aiResult?.summary ?? post.text.substring(0, 200);
        if (!aiResult) log(`[Production] AI classify returned null for post ${post.postId}`);

        // Enrich vacancy posts with AI
        let enrichedContent = post.text;
        let enrichedContacts = post.contacts as unknown as Record<string, unknown>;
        let enrichedTitle = post.text.split("\n")[0]?.substring(0, 150) || "Sin título";

        if (aiResult?.postType === "vacancy") {
          log(`[Production] Enriching vacancy: ${post.postId}`);
          const enriched = await enrichVacancyWithAI(
            post.text,
            post.platform,
            post.source,
            post.contacts
          );
          if (enriched) {
            enrichedContent = buildEnrichedContent(enriched);
            enrichedTitle = enriched.title;
            enrichedContacts = {
              emails: enriched.contacts.emails,
              whatsapp: enriched.contacts.whatsapp,
              telegramLinks: enriched.contacts.telegramLinks,
              applyUrl: enriched.contacts.applyUrl,
              company: enriched.company,
              role: enriched.role,
              salary: enriched.salary,
            };
          }
        }

        await insertPost({
          platform: post.platform,
          source: post.source,
          post_id: post.postId,
          url: post.url,
          post_date: post.postDate,
          author: post.author,
          views: post.views,
          text: enrichedContent,
          language: post.language,
          post_type: aiResult?.postType ?? post.postType,
          location: aiResult?.location ?? post.location,
          work_modality: aiResult?.workModality ?? post.workModality,
          profile: post.profile ? post.profile as unknown as Record<string, unknown> : null,
          contacts: enrichedContacts,
          quality_score: qualityScore,
          summary,
          is_spam: false,
          search_profile: null,
          forum_hint: post.forumHint ?? null,
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

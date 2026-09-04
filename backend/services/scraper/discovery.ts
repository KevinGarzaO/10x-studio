import { SEARCH_PROFILES } from "./profiles";
import { generateDiscoveryQueries, evaluateSourceWithAI } from "./ai";
import { upsertSource, getActiveSources } from "./db";
import { fetchTelegramChannel } from "./sources/telegram";
import type { Post } from "./types";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Discovery cron: genera queries con IA, busca canales nuevos,
 * evalúa con Gemini, y guarda en Supabase.
 */
export async function runDiscovery(
  profileName: string,
  log: (msg: string) => void = () => {}
): Promise<{
  tested: number;
  promoted: number;
  rejected: number;
  newChannels: string[];
}> {
  const profile = SEARCH_PROFILES.find((p) => p.name === profileName);
  if (!profile) {
    log(`[Discovery] Perfil "${profileName}" no encontrado.`);
    return { tested: 0, promoted: 0, rejected: 0, newChannels: [] };
  }

  log(`[Discovery] Iniciando con perfil: ${profile.name} — ${profile.description}`);

  const existingSources = await getActiveSources();
  const existingIds = new Set(existingSources.map((s) => `${s.platform}:${s.source_id}`));

  let tested = 0;
  let promoted = 0;
  let rejected = 0;
  const newChannels: string[] = [];

  // Generate queries with AI
  const aiQueries = await generateDiscoveryQueries(profile.name);
  log(`[Discovery] ${aiQueries.length} queries IA generadas: ${aiQueries.join(", ")}`);

  // Combine hardcoded + AI-generated queries
  const allQueries = [...new Set([...profile.telegramQueries, ...aiQueries])];
  log(`[Discovery] Total queries: ${allQueries.length}`);

  // Search Telegram channels by scraping t.me/s/<query>
  for (const query of allQueries) {
    const sourceId = query.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    const key = `telegram:${sourceId}`;

    if (existingIds.has(key)) {
      log(`[Discovery] Telegram/${sourceId} ya existe, saltando.`);
      continue;
    }

    log(`[Discovery] Probando Telegram/${sourceId}...`);
    tested++;

    try {
      const posts = await fetchTelegramChannel(sourceId, 1, 2000, false, false, log);
      if (posts.length === 0) {
        log(`[Discovery] Telegram/${sourceId}: sin posts, rechazando.`);
        await upsertSource({
          platform: "telegram",
          source_id: sourceId,
          display_name: sourceId,
          is_active: false,
          discovered_by: "discovery",
          discovery_query: query,
          rejection_reason: "no posts found",
        });
        rejected++;
        continue;
      }

      const sampleTexts = posts.slice(0, 5).map((p) => p.text);
      const evaluation = await evaluateSourceWithAI(sourceId, "telegram", sampleTexts);

      if (!evaluation) {
        log(`[Discovery] Telegram/${sourceId}: no se pudo evaluar, rechazando.`);
        rejected++;
        continue;
      }

      const isPromoted = evaluation.isRelevant && evaluation.qualityScore >= 0.4;

      await upsertSource({
        platform: "telegram",
        source_id: sourceId,
        display_name: sourceId,
        is_active: isPromoted,
        quality_score: evaluation.qualityScore,
        categories: evaluation.categories,
        discovered_by: "discovery",
        discovery_query: query,
        rejection_reason: isPromoted ? undefined : evaluation.reason,
        total_posts_tested: posts.length,
        posts_with_contact: posts.filter((p) =>
          (p.contacts.emails?.length ?? 0) > 0 ||
          (p.contacts.whatsapp?.length ?? 0) > 0
        ).length,
      });

      if (isPromoted) {
        log(`[Discovery] ✅ Telegram/${sourceId}: PROMOVIDO (score: ${evaluation.qualityScore.toFixed(2)})`);
        promoted++;
        newChannels.push(sourceId);
      } else {
        log(`[Discovery] ❌ Telegram/${sourceId}: rechazado (${evaluation.reason})`);
        rejected++;
      }
    } catch (err) {
      log(`[Discovery] Error con Telegram/${sourceId}: ${(err as Error).message}`);
      rejected++;
    }

    await sleep(3000);
  }

  log(`[Discovery] Completado: ${tested} probados, ${promoted} promovidos, ${rejected} rechazados`);
  return { tested, promoted, rejected, newChannels };
}

/**
 * Corre discovery para todos los perfiles.
 */
export async function runDiscoveryAll(
  log: (msg: string) => void = () => {}
): Promise<void> {
  for (const profile of SEARCH_PROFILES) {
    await runDiscovery(profile.name, log);
  }
}

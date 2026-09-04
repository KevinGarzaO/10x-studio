import cron from "node-cron";
import { runDiscovery, runDiscoveryAll } from "./discovery";
import { runProduction } from "./producer";
import { syncAllPending } from "./sync";
import { createScrapeRun, finishScrapeRun } from "./db";

/**
 * Inicia los crons del scraper:
 * - Discovery: cada 6 horas
 * - Production: cada 30 minutos
 * - Sync: cada 35 minutos (después de production)
 */
export function initScraperCron(): void {
  // Discovery: every 6 hours
  cron.schedule("0 */6 * * *", async () => {
    console.log(`[ScraperCron] Discovery iniciado: ${new Date().toISOString()}`);
    const runId = await createScrapeRun({ cron_name: "discovery" });
    const startTime = Date.now();

    try {
      await runDiscoveryAll((msg) => console.log(msg));
      await finishScrapeRun(runId, {
        duration_ms: Date.now() - startTime,
      });
    } catch (err) {
      console.error("[ScraperCron] Error en discovery:", err);
      await finishScrapeRun(runId, {
        error: (err as Error).message,
        duration_ms: Date.now() - startTime,
      });
    }
  });

  // Production: every 30 minutes
  cron.schedule("*/30 * * * *", async () => {
    console.log(`[ScraperCron] Production iniciado: ${new Date().toISOString()}`);
    const runId = await createScrapeRun({ cron_name: "production" });
    const startTime = Date.now();

    try {
      const result = await runProduction((msg) => console.log(msg));
      await finishScrapeRun(runId, {
        sources_tested: result.sourcesTested,
        posts_found: result.postsFound,
        posts_with_contact: result.postsWithContact,
        posts_inserted: result.postsInserted,
        duration_ms: Date.now() - startTime,
      });
    } catch (err) {
      console.error("[ScraperCron] Error en production:", err);
      await finishScrapeRun(runId, {
        error: (err as Error).message,
        duration_ms: Date.now() - startTime,
      });
    }
  });

  // Sync: every 35 minutes (offset from production)
  cron.schedule("5,40 * * * *", async () => {
    console.log(`[ScraperCron] Sync iniciado: ${new Date().toISOString()}`);

    try {
      await syncAllPending((msg) => console.log(msg));
    } catch (err) {
      console.error("[ScraperCron] Error en sync:", err);
    }
  });

  console.log("[ScraperCron] Crons inicializados (Discovery=6h, Production=30min, Sync=35min)");
}

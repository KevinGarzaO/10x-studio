import cron from "node-cron";
import { runProduction } from "./producer";
import { syncAllPending } from "./sync";
import { createScrapeRun, finishScrapeRun } from "./db";
import { sweepUnsyncedLeftovers } from "./retention";
import { isCycleDue, startNewCycle } from "./cycle";

/**
 * Inicia los crons del scraper (solo ATS):
 * - Production: cada 15 días (checado diario, corre solo cuando el ciclo vence)
 *   — antes de cada corrida se barre lo que quedó sin sincronizar del ciclo anterior
 * - Sync: diario, lunes a viernes
 * Discovery deshabilitado — solo fuentes ATS manuales.
 */
export function initScraperCron(): void {
  // Production cycle check: daily at 4am. A true "every 15 days" isn't a
  // reliable cron pattern (day-of-month step syntax resets at month
  // boundaries), so this checks a persisted cycle_started_at instead and
  // only actually runs when 15 real days have elapsed.
  cron.schedule("0 4 * * *", async () => {
    const due = await isCycleDue(15).catch((err) => {
      console.error("[ScraperCron] Error checando el ciclo:", err);
      return false;
    });
    if (!due) return;

    console.log(`[ScraperCron] Ciclo de 15 días vencido, iniciando: ${new Date().toISOString()}`);
    const runId = await createScrapeRun({ cron_name: "production" });
    const startTime = Date.now();

    try {
      await sweepUnsyncedLeftovers((msg) => console.log(msg));
      const result = await runProduction((msg) => console.log(msg));
      await finishScrapeRun(runId, {
        sources_tested: result.sourcesTested,
        posts_found: result.postsFound,
        posts_with_contact: result.postsWithContact,
        posts_inserted: result.postsInserted,
        duration_ms: Date.now() - startTime,
      });
      await startNewCycle();
    } catch (err) {
      console.error("[ScraperCron] Error en production:", err);
      await finishScrapeRun(runId, {
        error: (err as Error).message,
        duration_ms: Date.now() - startTime,
      });
    }
  });

  // Sync: once daily, weekdays only.
  cron.schedule("0 9 * * 1-5", async () => {
    console.log(`[ScraperCron] Sync iniciado: ${new Date().toISOString()}`);

    try {
      await syncAllPending((msg) => console.log(msg));
    } catch (err) {
      console.error("[ScraperCron] Error en sync:", err);
    }
  });

  console.log("[ScraperCron] Crons inicializados (Production=ciclo 15 días, Sync=diario L-V 9am) — ATS only");
}

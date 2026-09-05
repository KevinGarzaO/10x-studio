import { Router, Request, Response } from "express";
import { getActiveSources, getAllSources, getScraperStats } from "../services/scraper/db";
import { runDiscovery, runDiscoveryAll } from "../services/scraper/discovery";
import { runProduction } from "../services/scraper/producer";
import { syncAllPending } from "../services/scraper/sync";
import { enrichVacancyWithAI, buildEnrichedContent } from "../services/scraper/enrich";
import { SEARCH_PROFILES } from "../services/scraper/profiles";
import { supabase } from "../services/supabase.service";

const router = Router();

/**
 * GET /api/scraper/stats
 * Estadísticas generales del scraper
 */
router.get("/stats", async (_req: Request, res: Response) => {
  try {
    const stats = await getScraperStats();
    res.json(stats);
  } catch (error) {
    console.error("Scraper stats error:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

/**
 * GET /api/scraper/sources
 * Lista todas las fuentes
 */
router.get("/sources", async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.active === "true";
    const sources = activeOnly ? await getActiveSources() : await getAllSources();
    res.json({ sources });
  } catch (error) {
    console.error("Scraper sources error:", error);
    res.status(500).json({ error: "Error al obtener fuentes" });
  }
});

/**
 * GET /api/scraper/posts
 * Lista posts scrapingados con paginación y filtros
 */
router.get("/posts", async (req: Request, res: Response) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const platform = req.query.platform as string | undefined;
    const postType = req.query.type as string | undefined;
    const search = req.query.search as string | undefined;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("scraper_posts")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (platform) query = query.eq("platform", platform);
    if (postType) query = query.eq("post_type", postType);
    if (search) {
      query = query.or(`text.ilike.%${search}%,source.ilike.%${search}%`);
    }

    const { data: posts, count, error } = await query;
    if (error) throw error;

    res.json({
      posts: posts ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        pages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error("Scraper posts error:", error);
    res.status(500).json({ error: "Error al obtener posts" });
  }
});

/**
 * GET /api/scraper/runs
 * Historial de ejecuciones
 */
router.get("/runs", async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const { data: runs, error } = await supabase
      .from("scraper_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ runs: runs ?? [] });
  } catch (error) {
    console.error("Scraper runs error:", error);
    res.status(500).json({ error: "Error al obtener ejecuciones" });
  }
});

/**
 * GET /api/scraper/profiles
 * Lista los perfiles de búsqueda disponibles
 */
router.get("/profiles", (_req: Request, res: Response) => {
  res.json({ profiles: SEARCH_PROFILES });
});

/**
 * POST /api/scraper/scrape
 * Ejecuta un scrape manual de todas las fuentes activas
 */
router.post("/scrape", async (_req: Request, res: Response) => {
  try {
    const logs: string[] = [];
    const result = await runProduction((msg) => {
      console.log(msg);
      logs.push(msg);
    });
    res.json({ result, logs });
  } catch (error) {
    console.error("Scraper manual scrape error:", error);
    res.status(500).json({ error: "Error al ejecutar scrape" });
  }
});

/**
 * POST /api/scraper/discovery
 * Ejecuta discovery manual
 */
router.post("/discovery", async (req: Request, res: Response) => {
  try {
    const profile = req.body.profile as string | undefined;
    const logs: string[] = [];

    if (profile) {
      const result = await runDiscovery(profile, (msg) => {
        console.log(msg);
        logs.push(msg);
      });
      res.json({ result, logs });
    } else {
      await runDiscoveryAll((msg) => {
        console.log(msg);
        logs.push(msg);
      });
      res.json({ message: "Discovery completado para todos los perfiles", logs });
    }
  } catch (error) {
    console.error("Scraper discovery error:", error);
    res.status(500).json({ error: "Error al ejecutar discovery" });
  }
});

/**
 * POST /api/scraper/sync
 * Sincroniza posts nuevos a community_posts/users
 */
router.post("/sync", async (_req: Request, res: Response) => {
  try {
    const logs: string[] = [];
    const result = await syncAllPending((msg) => {
      console.log(msg);
      logs.push(msg);
    });
    res.json({ result, logs });
  } catch (error) {
    console.error("Scraper sync error:", error);
    res.status(500).json({ error: "Error al sincronizar" });
  }
});

/**
 * POST /api/scraper/re-enrich
 * Re-enriquece posts existentes con IA
 */
router.post("/re-enrich", async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.body.limit as string) || "50", 10);
    const logs: string[] = [];

    const { data: posts, error } = await supabase
      .from("scraper_posts")
      .select("id, text, platform, source, contacts, post_type, quality_score")
      .eq("post_type", "vacancy")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    logs.push(`[ReEnrich] ${posts?.length ?? 0} posts para re-enriquecer`);

    let enriched = 0;
    let failed = 0;

    for (const post of posts ?? []) {
      try {
        const aiResult = await enrichVacancyWithAI(
          post.text,
          post.platform,
          post.source,
          (post.contacts as any) || {}
        );

        if (aiResult) {
          const newContent = buildEnrichedContent(aiResult);
          const newContacts = {
            emails: aiResult.contacts.emails,
            whatsapp: aiResult.contacts.whatsapp,
            telegramLinks: aiResult.contacts.telegramLinks,
            phones: aiResult.contacts.phones,
            applyUrl: aiResult.contacts.applyUrl,
            company: aiResult.company,
            role: aiResult.role,
            salary: aiResult.salary,
          };

          await supabase
            .from("scraper_posts")
            .update({
              text: newContent,
              quality_score: aiResult.qualityScore,
              contacts: newContacts,
              summary: aiResult.summary,
              work_modality: aiResult.workModality,
              location: aiResult.location,
            })
            .eq("id", post.id);

          enriched++;
          logs.push(`[ReEnrich] ✅ ${post.id}: quality=${aiResult.qualityScore}, contacts=${JSON.stringify(aiResult.contacts.emails?.length || 0)} emails`);
        } else {
          failed++;
          logs.push(`[ReEnrich] ❌ ${post.id}: IA devolvió null`);
        }
      } catch (err) {
        failed++;
        logs.push(`[ReEnrich] ❌ ${post.id}: ${(err as Error).message}`);
      }
    }

    logs.push(`[ReEnrich] Completado: ${enriched} enriquecidos, ${failed} fallidos`);
    res.json({ enriched, failed, logs });
  } catch (error) {
    console.error("Scraper re-enrich error:", error);
    res.status(500).json({ error: "Error al re-enriquecer" });
  }
});

export default router;

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface ChannelsConfig {
  telegram: string[];
  forobeta: string[];
  reddit: string[];
}

// ATS sources — discovered via Google dorking:
// site:apply.workable.com, site:boards.greenhouse.io, site:jobs.lever.co
const ATS_SOURCES = {
  workable: [
    "platzi",
    "crediclub",
    "kavak",
    "bitso",
    "clip",
    "jokr",
    "nubank",
    "mercadolibre",
    "rappi",
    "dlocal",
  ],
  greenhouse: [
    "github",
    "gitlab",
    "figma",
    "notion",
    "canva",
    "airtable",
    "lastic",
    "mural",
    "loom",
    "grammarly",
  ],
  lever: [
    "netlify",
    "postman",
    "calendly",
    "upspot",
    "lattice",
    "greenhouse",
    "lever",
    "ashby",
    "breezy",
    "recruitee",
  ],
};

async function seed() {
  console.log("[Seed] Leyendo channels.json...");
  const raw = fs.readFileSync(path.join(__dirname, "../channels.json"), "utf-8");
  const config: ChannelsConfig = JSON.parse(raw);

  let total = 0;

  // Telegram
  for (const channel of config.telegram) {
    const { error } = await supabase.from("scraper_sources").upsert(
      {
        platform: "telegram",
        source_id: channel,
        display_name: channel,
        is_active: true,
        discovered_by: "manual_seed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,source_id" }
    );
    if (error) {
      console.error(`[Seed] Error insertando telegram/${channel}:`, error.message);
    } else {
      console.log(`[Seed] ✅ telegram/${channel}`);
      total++;
    }
  }

  // Forobeta
  for (const slug of config.forobeta) {
    const { error } = await supabase.from("scraper_sources").upsert(
      {
        platform: "forobeta",
        source_id: slug,
        display_name: slug,
        is_active: true,
        discovered_by: "manual_seed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,source_id" }
    );
    if (error) {
      console.error(`[Seed] Error insertando forobeta/${slug}:`, error.message);
    } else {
      console.log(`[Seed] ✅ forobeta/${slug}`);
      total++;
    }
  }

  // Reddit
  for (const subreddit of config.reddit) {
    const { error } = await supabase.from("scraper_sources").upsert(
      {
        platform: "reddit",
        source_id: subreddit,
        display_name: subreddit,
        is_active: true,
        discovered_by: "manual_seed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,source_id" }
    );
    if (error) {
      console.error(`[Seed] Error insertando reddit/${subreddit}:`, error.message);
    } else {
      console.log(`[Seed] ✅ reddit/${subreddit}`);
      total++;
    }
  }

  // ATS: Workable
  for (const slug of ATS_SOURCES.workable) {
    const { error } = await supabase.from("scraper_sources").upsert(
      {
        platform: "workable",
        source_id: slug,
        display_name: slug,
        is_active: true,
        discovered_by: "google_dorking",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,source_id" }
    );
    if (error) {
      console.error(`[Seed] Error insertando workable/${slug}:`, error.message);
    } else {
      console.log(`[Seed] ✅ workable/${slug}`);
      total++;
    }
  }

  // ATS: Greenhouse
  for (const slug of ATS_SOURCES.greenhouse) {
    const { error } = await supabase.from("scraper_sources").upsert(
      {
        platform: "greenhouse",
        source_id: slug,
        display_name: slug,
        is_active: true,
        discovered_by: "google_dorking",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,source_id" }
    );
    if (error) {
      console.error(`[Seed] Error insertando greenhouse/${slug}:`, error.message);
    } else {
      console.log(`[Seed] ✅ greenhouse/${slug}`);
      total++;
    }
  }

  // ATS: Lever
  for (const slug of ATS_SOURCES.lever) {
    const { error } = await supabase.from("scraper_sources").upsert(
      {
        platform: "lever",
        source_id: slug,
        display_name: slug,
        is_active: true,
        discovered_by: "google_dorking",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "platform,source_id" }
    );
    if (error) {
      console.error(`[Seed] Error insertando lever/${slug}:`, error.message);
    } else {
      console.log(`[Seed] ✅ lever/${slug}`);
      total++;
    }
  }

  console.log(`[Seed] Completado: ${total} fuentes insertadas`);
}

seed().catch(console.error);

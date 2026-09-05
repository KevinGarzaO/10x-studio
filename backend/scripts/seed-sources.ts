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

async function seed() {
  console.log("[Seed] Leyendo channels.json...");
  const raw = fs.readFileSync(path.join(__dirname, "../channels.json"), "utf-8");
  const config: ChannelsConfig = JSON.parse(raw);

  let total = 0;

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

  console.log(`[Seed] Completado: ${total} fuentes insertadas`);
}

seed().catch(console.error);

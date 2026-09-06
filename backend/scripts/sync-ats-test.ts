import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const BOT_ID = "00000000-0000-0000-0000-000000000001";

function generateSlug(title: string, id: string): string {
  const normalized = title
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 60)
    .replace(/^-|-$/g, "");
  return `/vacantes/${normalized}-${id.substring(0, 8)}`;
}

async function sync() {
  const { data: workable } = await supabase
    .from("scraper_posts")
    .select("*")
    .eq("platform", "workable")
    .order("created_at", { ascending: false });

  const { data: greenhouse } = await supabase
    .from("scraper_posts")
    .select("*")
    .eq("platform", "greenhouse")
    .order("created_at", { ascending: false });

  const pending = [...(workable || []), ...(greenhouse || [])];
  console.log(`Encontrados ${pending.length} posts ATS para sincronizar`);

  let synced = 0;

  for (const sp of pending) {
    const title = sp.text.split("\n")[0].replace(/^#+ /, "").substring(0, 200);
    const slug = generateSlug(title, sp.id);

    // Check if already synced by slug or title
    const { data: existing } = await supabase
      .from("community_posts")
      .select("id")
      .eq("title", title)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`  Skip (ya existe): ${title}`);
      continue;
    }

    const { error: insertError } = await supabase.from("community_posts").insert({
      author_id: BOT_ID,
      type: "job",
      title,
      content: sp.text,
      original_text: sp.text,
      slug,
      platform: sp.platform,
      source_name: sp.source,
      contacts: sp.contacts,
      is_scraper_post: true,
      scraped_at: sp.created_at,
      votes_count: 0,
      comments_count: 0,
    });

    if (insertError) {
      console.error(`  ERROR: ${insertError.message}`);
    } else {
      console.log(`  SYNCED: ${title} → ${slug}`);
      synced++;
    }
  }

  console.log(`\nSincronizados ${synced} posts a community_posts`);

  const { count } = await supabase
    .from("community_posts")
    .select("id", { count: "exact", head: true })
    .eq("is_scraper_post", true);

  console.log(`Total scraper posts en community: ${count}`);
}

sync().catch(console.error);

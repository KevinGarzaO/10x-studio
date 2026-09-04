import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || "";

if (!supabaseUrl || !supabaseKey) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const SCRAPER_BOT_ID = "00000000-0000-0000-0000-000000000001";

async function syncVacancy(post: any): Promise<string | null> {
  const title = post.text.split("\n")[0]?.substring(0, 150) || "Vacante sin título";
  const budgetMatch = post.text.match(/[$€]\s?\d[\d,.]*(?:\s?-\s?[$€]?\s?\d[\d,.]*)?/);
  const budget = budgetMatch ? budgetMatch[0] : null;

  const modalidadMap: Record<string, string> = {
    remote: "Remoto",
    onsite: "Presencial",
    hybrid: "Híbrido",
    unknown: "No especificado",
  };
  const modalidad = modalidadMap[post.work_modality ?? "unknown"] ?? "No especificado";

  const { data: communityPost, error } = await supabase
    .from("community_posts")
    .insert({
      title,
      content: post.text,
      type: "job",
      budget,
      modalidad,
      author_id: SCRAPER_BOT_ID,
      source_url: post.url,
      platform: post.platform,
      source_name: post.source,
      original_text: post.text,
      contacts: post.contacts,
      scraped_at: post.created_at || new Date().toISOString(),
      is_scraper_post: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`  Error inserting vacancy: ${error.message}`);
    return null;
  }

  // Mark as synced
  await supabase
    .from("scraper_posts")
    .update({ synced_to_community: true, community_post_id: communityPost.id })
    .eq("id", post.id);

  return communityPost.id;
}

async function syncProfile(post: any): Promise<string | null> {
  const author = post.author ?? post.contacts?.emails?.[0]?.split("@")[0] ?? "freelancer";
  const username = `scraper_${author.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
  const profile = post.profile as Record<string, unknown> | null;

  const { data: user, error } = await supabase
    .from("users")
    .insert({
      username,
      display_name: author,
      bio: post.text.substring(0, 500),
      roles: profile?.roles ?? [],
      skills: profile?.skills ?? [],
      years_experience: profile?.yearsExperience ?? null,
      rate: profile?.rate ?? null,
      portfolio_links: profile?.portfolioLinks ?? [],
      location: post.location,
      work_modality: post.work_modality,
      is_scraper_profile: true,
      scraper_source: `${post.platform}:${post.source}`,
      original_url: post.url,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`  Error inserting profile: ${error.message}`);
    return null;
  }

  await supabase
    .from("scraper_posts")
    .update({ synced_to_user: true, user_id: user.id })
    .eq("id", post.id);

  return user.id;
}

async function main() {
  console.log("=== Sincronización de Posts a Community/Users ===\n");

  // Get unsynced vacancy posts
  const { data: vacancies } = await supabase
    .from("scraper_posts")
    .select("*")
    .eq("post_type", "vacancy")
    .eq("synced_to_community", false)
    .limit(200);

  console.log(`Vacantes sin sincronizar: ${vacancies?.length ?? 0}`);

  let vacancyCount = 0;
  for (const post of vacancies ?? []) {
    const id = await syncVacancy(post);
    if (id) vacancyCount++;
  }

  console.log(`\nVacantes sincronizadas: ${vacancyCount}\n`);

  // Get unsynced profile posts
  const { data: profiles } = await supabase
    .from("scraper_posts")
    .select("*")
    .eq("post_type", "profile")
    .eq("synced_to_user", false)
    .limit(200);

  console.log(`Perfiles sin sincronizar: ${profiles?.length ?? 0}`);

  let profileCount = 0;
  for (const post of profiles ?? []) {
    const id = await syncProfile(post);
    if (id) profileCount++;
  }

  console.log(`\nPerfiles sincronizados: ${profileCount}`);
  console.log("\n=== Sincronización completada ===");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});

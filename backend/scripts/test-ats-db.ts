import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { fetchWorkable } from "../services/scraper/sources/workable";
import { fetchGreenhouse } from "../services/scraper/sources/greenhouse";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const log = (msg: string) => console.log(msg);

async function testAndInsert() {
  let inserted = 0;

  // 1. Workable — Platzi
  console.log("\n=== WORKABLE / PLATZI ===");
  const workablePosts = await fetchWorkable("platzi", log);
  console.log(`Encontradas: ${workablePosts.length}`);

  for (const post of workablePosts.slice(0, 5)) {
    const { data: exists } = await supabase
      .from("scraper_posts")
      .select("id")
      .eq("platform", "workable")
      .eq("source", "platzi")
      .eq("post_id", post.postId)
      .limit(1);

    if (exists && exists.length > 0) { log(`  Skip (ya existe): ${post.postId}`); continue; }

    const { error } = await supabase.from("scraper_posts").insert({
      platform: post.platform,
      source: post.source,
      post_id: post.postId,
      url: post.url,
      post_date: post.postDate,
      author: post.author,
      text: post.text,
      language: post.language,
      post_type: "vacancy",
      location: post.location,
      work_modality: post.workModality,
      contacts: post.contacts as any,
      quality_score: 0.8,
      is_spam: false,
    });

    if (error) { log(`  ERROR: ${error.message}`); }
    else { log(`  OK: ${post.text.split("\n")[0]}`); inserted++; }
  }

  // 2. Greenhouse — GitLab
  console.log("\n=== GREENHOUSE / GITLAB ===");
  const ghPosts = await fetchGreenhouse("gitlab", log);
  console.log(`Encontradas: ${ghPosts.length}`);

  for (const post of ghPosts.slice(0, 5)) {
    const { data: exists } = await supabase
      .from("scraper_posts")
      .select("id")
      .eq("platform", "greenhouse")
      .eq("source", "gitlab")
      .eq("post_id", post.postId)
      .limit(1);

    if (exists && exists.length > 0) { log(`  Skip (ya existe): ${post.postId}`); continue; }

    const { error } = await supabase.from("scraper_posts").insert({
      platform: post.platform,
      source: post.source,
      post_id: post.postId,
      url: post.url,
      post_date: post.postDate,
      author: post.author,
      text: post.text,
      language: post.language,
      post_type: "vacancy",
      location: post.location,
      work_modality: post.workModality,
      contacts: post.contacts as any,
      quality_score: 0.8,
      is_spam: false,
    });

    if (error) { log(`  ERROR: ${error.message}`); }
    else { log(`  OK: ${post.text.split("\n")[0]}`); inserted++; }
  }

  // Summary
  console.log("\n=== RESUMEN ===");
  console.log(`Insertados en scraper_posts: ${inserted}`);

  const { count } = await supabase
    .from("scraper_posts")
    .select("id", { count: "exact", head: true })
    .in("platform", ["workable", "greenhouse"]);

  console.log(`Total ATS en scraper_posts: ${count}`);
  console.log("\nSiguiente paso: llamar a /api/scraper/sync para copiar a community_posts");
}

testAndInsert().catch(console.error);

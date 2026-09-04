import { createClient } from "@supabase/supabase-js";
import { readFile, readdir } from "fs/promises";
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

// Path to the old scraper output directory
const OLD_SCRAPER_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  "Documentos",
  "GitHub",
  "telegram-freelance-scraper",
  "output"
);

interface OldPost {
  platform: string;
  source: string;
  postId: string | null;
  url: string | null;
  postDate: string | null;
  insertedAt: string;
  author: string | null;
  views: string | null;
  text: string;
  language: string;
  postType: "vacancy" | "profile" | "unknown";
  forumHint?: string | null;
  location: string | null;
  workModality: string;
  profile?: {
    roles: string[];
    skills: string[];
    yearsExperience: number | null;
    rate: string | null;
    portfolioLinks: string[];
  };
  contacts: {
    emails?: string[];
    whatsapp?: string[];
    telegramLinks?: string[];
    mentions?: string[];
    phones?: string[];
    contactNameGuess?: string | null;
    referTo?: string;
  };
  possibleDuplicateOf?: string | null;
}

interface OldScrapeResult {
  scrapedAt: string;
  messages: OldPost[];
}

async function migrateOutputFile(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as OldScrapeResult;

    if (!data.messages?.length) return 0;

    let inserted = 0;

    for (const post of data.messages) {
      // Check if already exists
      const postId = post.postId ?? "";
      const { count } = await supabase
        .from("scraper_posts")
        .select("id", { count: "exact", head: true })
        .eq("platform", post.platform)
        .eq("source", post.source)
        .eq("post_id", postId);

      if ((count ?? 0) > 0) continue;

      // Insert
      const { error } = await supabase.from("scraper_posts").insert({
        platform: post.platform,
        source: post.source,
        post_id: postId || null,
        url: post.url,
        post_date: post.postDate,
        inserted_at: post.insertedAt,
        author: post.author,
        views: post.views,
        text: post.text,
        language: post.language,
        post_type: post.postType,
        location: post.location,
        work_modality: post.workModality,
        profile: post.profile ?? null,
        contacts: post.contacts,
        forum_hint: post.forumHint ?? null,
        quality_score: (post.contacts.emails?.length ?? 0) > 0 ? 0.7 : 0.3,
        is_spam: false,
      });

      if (error) {
        console.error(`  Error inserting post: ${error.message}`);
      } else {
        inserted++;
      }
    }

    return inserted;
  } catch (err) {
    console.error(`  Error processing ${filePath}: ${(err as Error).message}`);
    return 0;
  }
}

async function main() {
  console.log("=== Migración de Historial del Scraper ===\n");
  console.log(`Directorio de output: ${OLD_SCRAPER_DIR}\n`);

  let files: string[];
  try {
    files = await readdir(OLD_SCRAPER_DIR);
  } catch {
    console.error(`No se pudo leer el directorio: ${OLD_SCRAPER_DIR}`);
    console.error("Asegúrate de que el scraper original existe en esa ruta.");
    process.exit(1);
  }

  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  console.log(`Archivos JSON encontrados: ${jsonFiles.length}\n`);

  let totalInserted = 0;

  for (const file of jsonFiles) {
    const filePath = path.join(OLD_SCRAPER_DIR, file);
    console.log(`Procesando: ${file}`);
    const inserted = await migrateOutputFile(filePath);
    totalInserted += inserted;
    console.log(`  → ${inserted} posts insertados`);
  }

  console.log(`\n=== Migración completada ===`);
  console.log(`Total posts insertados: ${totalInserted}`);
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});

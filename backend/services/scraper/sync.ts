import { supabase } from "../supabase.service";
import { generateSlug } from "../slug";
import { companySlug, formatCompanyName } from "../company";

const SCRAPER_BOT_ID = "00000000-0000-0000-0000-000000000001";

// Per-process cache so a scraper run doesn't re-look-up the same company for
// every one of its job posts.
const companyUserCache = new Map<string, string>();

/**
 * Companies aren't just a free-text field on the job post anymore — each one
 * gets a real row in `users` (username = its /empresas/:slug), so a vacancy's
 * author_id can point at the company that posted it instead of the generic
 * scraper bot. Looks the company up by slug first; creates it if missing.
 */
export async function getOrCreateCompanyUser(
  rawName: string | null | undefined,
  logo: string | null | undefined
): Promise<string | null> {
  if (!rawName) return null;
  const slug = companySlug(rawName);
  if (!slug) return null;

  if (companyUserCache.has(slug)) return companyUserCache.get(slug)!;

  const { data: existing } = await supabase
    .from("users")
    .select("id, photo_url")
    .eq("username", slug)
    .maybeSingle();

  if (existing) {
    if (logo && !existing.photo_url) {
      await supabase.from("users").update({ photo_url: logo }).eq("id", existing.id);
    }
    companyUserCache.set(slug, existing.id);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("users")
    .insert({
      username: slug,
      display_name: formatCompanyName(rawName),
      photo_url: logo || null,
      is_scraper_profile: true,
      scraper_source: "company",
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error(`[Sync] Error creando cuenta de empresa "${rawName}":`, error?.message);
    return null;
  }

  companyUserCache.set(slug, created.id);
  return created.id;
}

/**
 * Sincroniza un post scrapingado como vacancy en community_posts.
 */
export async function syncVacancyToCommunity(
  scraperPostId: string,
  log: (msg: string) => void = () => {}
): Promise<string | null> {
  // Get the scraper post
  const { data: post, error: fetchError } = await supabase
    .from("scraper_posts")
    .select("*")
    .eq("id", scraperPostId)
    .single();

  if (fetchError || !post) {
    log(`[Sync] No se encontró scraper_post ${scraperPostId}`);
    return null;
  }

  if (post.synced_to_community) {
    return post.community_post_id;
  }

  // Use enriched data from scraper_posts
  const title = post.text.split("\n")[0]?.replace(/^##\s*/, "")?.substring(0, 150) || "Vacante sin título";

  // Extract budget from contacts if available
  const contacts = post.contacts as Record<string, unknown> | null;
  const budget = (contacts?.salary as string) || null;

  // Map work_modality to modalidad
  const modalidadMap: Record<string, string> = {
    remote: "Remoto",
    onsite: "Presencial",
    hybrid: "Híbrido",
    unknown: "No especificado",
  };
  const modalidad = modalidadMap[post.work_modality ?? "unknown"] ?? "No especificado";

  // Extract company name
  const companyName = post.company ?? post.source ?? null;

  // Look up company logo from scraper_sources
  let companyLogo = post.company_logo ?? null;
  if (companyName && !companyLogo) {
    const { data: source } = await supabase
      .from("scraper_sources")
      .select("metadata")
      .ilike("source_id", companyName)
      .single();
    if (source?.metadata?.storage_logo_url) {
      companyLogo = source.metadata.storage_logo_url;
    }
  }

  const companyUserId = (await getOrCreateCompanyUser(companyName, companyLogo)) || SCRAPER_BOT_ID;

  // Insert into community_posts
  const { data: communityPost, error: insertError } = await supabase
    .from("community_posts")
    .insert({
      title,
      content: post.text,
      type: "job",
      budget,
      modalidad,
      author_id: companyUserId,
      source_url: post.url,
      platform: post.platform,
      source_name: post.source,
      original_text: post.text,
      contacts: post.contacts,
      scraped_at: post.created_at,
      is_scraper_post: true,
      company: companyName,
      company_logo: companyLogo,
      role_category: post.role_category ?? null,
      seniority_level: post.seniority_level ?? null,
      skills: post.skills ?? [],
    })
    .select("id")
    .single();

  if (insertError) {
    // 23505 on source_url means this exact job is already a community_posts
    // row (promoted from a different scraper_posts row — Lever/Greenhouse
    // sometimes reassign a posting a new id on edit). Without this, the
    // insert keeps failing and the row keeps being picked up as still
    // pending every single sync run, forever.
    if (insertError.code === "23505") {
      const { data: existing } = await supabase
        .from("community_posts")
        .select("id, slug")
        .eq("source_url", post.url)
        .maybeSingle();

      await supabase.from("scraper_posts").delete().eq("id", scraperPostId);

      if (existing) {
        log(`[Sync] Ya existía (source_url duplicado), descartando scraper_post: /vacantes/${existing.slug}`);
        return existing.id;
      }
      log(`[Sync] Duplicado detectado pero no se encontró el community_post existente para ${post.url}`);
      return null;
    }

    log(`[Sync] Error insertando en community_posts: ${insertError.message}`);
    return null;
  }

  // Generate and save slug
  const slug = generateSlug(title, communityPost.id);
  await supabase
    .from("community_posts")
    .update({ slug })
    .eq("id", communityPost.id);

  // community_posts now holds the sole permanent copy of this vacancy, so
  // the staging row is removed outright instead of just being flagged
  // synced — scraper_posts sheds a row the moment it's promoted.
  await supabase
    .from("scraper_posts")
    .delete()
    .eq("id", scraperPostId);

  log(`[Sync] Vacante sincronizada: /vacantes/${slug}`);
  return communityPost.id;
}

/**
 * Sincroniza un post scrapingado como perfil (usuario) en users.
 */
export async function syncProfileToUser(
  scraperPostId: string,
  log: (msg: string) => void = () => {}
): Promise<string | null> {
  const { data: post, error: fetchError } = await supabase
    .from("scraper_posts")
    .select("*")
    .eq("id", scraperPostId)
    .single();

  if (fetchError || !post) {
    log(`[Sync] No se encontró scraper_post ${scraperPostId}`);
    return null;
  }

  if (post.synced_to_user) {
    return post.user_id;
  }

  // Generate username from author or email
  const author = post.author ?? post.contacts?.emails?.[0]?.split("@")[0] ?? "freelancer";
  const username = `scraper_${author.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now().toString(36)}`;
  const displayName = author;
  const bio = post.text.substring(0, 500);
  const profile = post.profile as Record<string, unknown> | null;

  const { data: user, error: insertError } = await supabase
    .from("users")
    .insert({
      username,
      display_name: displayName,
      bio,
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

  if (insertError) {
    log(`[Sync] Error insertando en users: ${insertError.message}`);
    return null;
  }

  // Update scraper_post
  await supabase
    .from("scraper_posts")
    .update({
      synced_to_user: true,
      user_id: user.id,
    })
    .eq("id", scraperPostId);

  log(`[Sync] Perfil sincronizado: users/${user.id}`);
  return user.id;
}

/**
 * Obtiene cuántos posts nativos (no scraper) se publicaron hoy.
 */
async function getTodayNativePostCount(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const { count, error } = await supabase
    .from("community_posts")
    .select("id", { count: "exact", head: true })
    .eq("is_scraper_post", false)
    .gte("created_at", todayISO);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Obtiene cuántos posts scraper se publicaron hoy.
 */
async function getTodayScraperPostCount(): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const { count, error } = await supabase
    .from("community_posts")
    .select("id", { count: "exact", head: true })
    .eq("is_scraper_post", true)
    .gte("created_at", todayISO);

  if (error) return 0;
  return count ?? 0;
}

/**
 * Sincroniza todos los posts nuevos (no sincronizados aún).
 * Respeta la regla de volumen diario: máximo 20 posts/día (nativas + scraper).
 */
export async function syncAllPending(
  log: (msg: string) => void = () => {}
): Promise<{ vacancies: number; profiles: number }> {
  const DAILY_LIMIT = 20;
  const PER_COMBO_CAP = 2;

  const nativeCount = await getTodayNativePostCount();
  const scraperCount = await getTodayScraperPostCount();
  const remainingSlots = Math.max(0, DAILY_LIMIT - nativeCount - scraperCount);

  log(`[Sync] Hoy: ${nativeCount} nativas, ${scraperCount} scraper, ${remainingSlots} slots restantes`);

  if (remainingSlots === 0) {
    log("[Sync] Límite diario alcanzado, no se sincronizan más posts scraper");
    return { vacancies: 0, profiles: 0 };
  }
  // Get unsynced vacancy posts that have at least one contact method and are
  // ≤30 days old — checked against post_date (when the job was actually
  // posted), not created_at (when we happened to scrape it); a job posted
  // 40 days ago that we only just scraped yesterday is still stale.
  // Ordered oldest-created-first (not fetched previously — an unordered
  // query left Postgres free to return whichever rows it felt like, which
  // in practice meant a handful of high-volume companies crowded out
  // everyone else, day after day) and pulled from a wide candidate pool
  // (not capped at remainingSlots) so the diversity cap below has enough
  // rows to actually pick from.
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();

  const { data: vacancyPosts } = await supabase
    .from("scraper_posts")
    .select("id, contacts, created_at, company, role_category, seniority_level")
    .eq("post_type", "vacancy")
    .eq("synced_to_community", false)
    .eq("is_spam", false)
    .gte("post_date", thirtyDaysAgoISO)
    .order("created_at", { ascending: true })
    .limit(500);

  // Filter posts that have at least email or phone
  const postsWithContact = (vacancyPosts ?? []).filter((post) => {
    const contacts = post.contacts as Record<string, unknown> | null;
    const hasEmail = (contacts?.emails as string[])?.length ?? 0 > 0;
    const hasWhatsapp = (contacts?.whatsapp as string[])?.length ?? 0 > 0;
    const hasTelegram = (contacts?.telegramLinks as string[])?.length ?? 0 > 0;
    const hasApplyUrl = !!contacts?.applyUrl;
    return hasEmail || hasWhatsapp || hasTelegram || hasApplyUrl;
  });

  // Diversity cap: at most PER_COMBO_CAP per (role_category, seniority_level)
  // combo per day, so a high-volume company (SpaceX, Databricks, ...) can't
  // eat the whole day's quota with jobs from a single category and starve
  // every other role/level combination.
  const perComboCount = new Map<string, number>();
  const selected: typeof postsWithContact = [];
  for (const post of postsWithContact) {
    if (selected.length >= remainingSlots) break;
    const key = `${post.role_category ?? "sin-categoria"}:${post.seniority_level ?? "sin-nivel"}`;
    const count = perComboCount.get(key) || 0;
    if (count >= PER_COMBO_CAP) continue;
    perComboCount.set(key, count + 1);
    selected.push(post);
  }

  log(`[Sync] ${selected.length} vacantes seleccionadas de ${postsWithContact.length} con contacto (${vacancyPosts?.length ?? 0} candidatas, máx ${PER_COMBO_CAP}/combinación rol+nivel)`);

  // Get unsynced profile posts
  const { data: profilePosts } = await supabase
    .from("scraper_posts")
    .select("id")
    .eq("post_type", "profile")
    .eq("synced_to_user", false)
    .limit(50);

  let vacancies = 0;
  let profiles = 0;

  for (const post of selected) {
    const result = await syncVacancyToCommunity(post.id, log);
    if (result) vacancies++;
  }

  for (const post of profilePosts ?? []) {
    const result = await syncProfileToUser(post.id, log);
    if (result) profiles++;
  }

  log(`[Sync] Sincronizados: ${vacancies} vacantes, ${profiles} perfiles`);
  return { vacancies, profiles };
}

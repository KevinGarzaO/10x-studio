import { supabase } from "../supabase.service";

const SCRAPER_BOT_ID = "00000000-0000-0000-0000-000000000001";

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

  // Insert into community_posts
  const { data: communityPost, error: insertError } = await supabase
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
      scraped_at: post.created_at,
      is_scraper_post: true,
    })
    .select("id")
    .single();

  if (insertError) {
    log(`[Sync] Error insertando en community_posts: ${insertError.message}`);
    return null;
  }

  // Update scraper_post with community_post_id
  await supabase
    .from("scraper_posts")
    .update({
      synced_to_community: true,
      community_post_id: communityPost.id,
    })
    .eq("id", scraperPostId);

  log(`[Sync] Vacante sincronizada: community_posts/${communityPost.id}`);
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
 * Sincroniza todos los posts nuevos (no sincronizados aún).
 */
export async function syncAllPending(
  log: (msg: string) => void = () => {}
): Promise<{ vacancies: number; profiles: number }> {
  // Get unsynced vacancy posts
  const { data: vacancyPosts } = await supabase
    .from("scraper_posts")
    .select("id")
    .eq("post_type", "vacancy")
    .eq("synced_to_community", false)
    .limit(50);

  // Get unsynced profile posts
  const { data: profilePosts } = await supabase
    .from("scraper_posts")
    .select("id")
    .eq("post_type", "profile")
    .eq("synced_to_user", false)
    .limit(50);

  let vacancies = 0;
  let profiles = 0;

  for (const post of vacancyPosts ?? []) {
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

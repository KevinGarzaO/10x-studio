import { supabase } from "../supabase.service";
import type { Post } from "./types";

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export interface DbSource {
  id: string;
  platform: string;
  source_id: string;
  display_name: string | null;
  is_active: boolean;
  quality_score: number | null;
  categories: string[] | null;
  contact_quality: string | null;
  total_posts_tested: number | null;
  posts_with_contact: number | null;
  last_tested_at: string | null;
  last_post_date: string | null;
  discovered_by: string;
  discovery_query: string | null;
  rejection_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export async function getActiveSources(): Promise<DbSource[]> {
  const { data, error } = await supabase
    .from("scraper_sources")
    .select("*")
    .eq("is_active", true)
    .order("quality_score", { ascending: false });
  if (error) throw error;
  return (data as DbSource[]) ?? [];
}

export async function getAllSources(): Promise<DbSource[]> {
  const { data, error } = await supabase
    .from("scraper_sources")
    .select("*")
    .order("quality_score", { ascending: false });
  if (error) throw error;
  return (data as DbSource[]) ?? [];
}

export async function upsertSource(source: {
  platform: string;
  source_id: string;
  display_name?: string;
  is_active: boolean;
  quality_score?: number;
  categories?: string[];
  contact_quality?: string;
  total_posts_tested?: number;
  posts_with_contact?: number;
  last_tested_at?: string;
  last_post_date?: string;
  discovered_by?: string;
  discovery_query?: string;
  rejection_reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("scraper_sources").upsert(
    {
      platform: source.platform,
      source_id: source.source_id,
      display_name: source.display_name ?? null,
      is_active: source.is_active,
      quality_score: source.quality_score ?? null,
      categories: source.categories ?? null,
      contact_quality: source.contact_quality ?? null,
      total_posts_tested: source.total_posts_tested ?? null,
      posts_with_contact: source.posts_with_contact ?? null,
      last_tested_at: source.last_tested_at ?? new Date().toISOString(),
      last_post_date: source.last_post_date ?? null,
      discovered_by: source.discovered_by ?? "discovery",
      discovery_query: source.discovery_query ?? null,
      rejection_reason: source.rejection_reason ?? null,
      metadata: source.metadata ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "platform,source_id" }
  );
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export async function postExists(
  platform: string,
  source: string,
  postId: string | null
): Promise<boolean> {
  const key = postId ?? "";
  const { count, error } = await supabase
    .from("scraper_posts")
    .select("id", { count: "exact", head: true })
    .eq("platform", platform)
    .eq("source", source)
    .eq("post_id", key);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function insertPost(post: {
  platform: string;
  source: string;
  post_id: string | null;
  url: string | null;
  post_date: string | null;
  author?: string | null;
  views?: string | null;
  text: string;
  language?: string | null;
  post_type?: string | null;
  location?: string | null;
  work_modality?: string | null;
  profile?: Record<string, unknown> | null;
  contacts: Record<string, unknown>;
  quality_score?: number | null;
  summary?: string | null;
  is_spam?: boolean;
  search_profile?: string | null;
  forum_hint?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("scraper_posts").insert({
    platform: post.platform,
    source: post.source,
    post_id: post.post_id ?? null,
    url: post.url ?? null,
    post_date: post.post_date ?? null,
    author: post.author ?? null,
    views: post.views ?? null,
    text: post.text,
    language: post.language ?? null,
    post_type: post.post_type ?? null,
    location: post.location ?? null,
    work_modality: post.work_modality ?? null,
    profile: post.profile ?? null,
    contacts: post.contacts,
    quality_score: post.quality_score ?? null,
    summary: post.summary ?? null,
    is_spam: post.is_spam ?? false,
    search_profile: post.search_profile ?? null,
    forum_hint: post.forum_hint ?? null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Scrape Runs
// ---------------------------------------------------------------------------

export async function createScrapeRun(run: {
  cron_name: string;
  search_profile?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("scraper_runs")
    .insert({
      cron_name: run.cron_name,
      search_profile: run.search_profile ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function finishScrapeRun(
  id: string,
  stats: {
    sources_tested?: number;
    sources_promoted?: number;
    sources_rejected?: number;
    posts_found?: number;
    posts_with_contact?: number;
    posts_inserted?: number;
    new_channels_discovered?: number;
    duration_ms?: number;
    error?: string;
  }
): Promise<void> {
  const { error } = await supabase
    .from("scraper_runs")
    .update({
      sources_tested: stats.sources_tested ?? null,
      sources_promoted: stats.sources_promoted ?? null,
      sources_rejected: stats.sources_rejected ?? null,
      posts_found: stats.posts_found ?? null,
      posts_with_contact: stats.posts_with_contact ?? null,
      posts_inserted: stats.posts_inserted ?? null,
      new_channels_discovered: stats.new_channels_discovered ?? null,
      duration_ms: stats.duration_ms ?? null,
      error: stats.error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export async function getScraperStats(): Promise<{
  totalPosts: number;
  totalSources: number;
  activeSources: number;
  postsByPlatform: Record<string, number>;
  lastRun: unknown;
}> {
  const [postsCount, sourcesCount, activeCount, byPlatform, lastRun] = await Promise.all([
    supabase.from("scraper_posts").select("id", { count: "exact", head: true }),
    supabase.from("scraper_sources").select("id", { count: "exact", head: true }),
    supabase.from("scraper_sources").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("scraper_posts").select("platform"),
    supabase.from("scraper_runs").select("*").order("started_at", { ascending: false }).limit(1).single(),
  ]);

  const platformCounts: Record<string, number> = {};
  for (const p of (byPlatform.data ?? []) as { platform: string }[]) {
    platformCounts[p.platform] = (platformCounts[p.platform] ?? 0) + 1;
  }

  return {
    totalPosts: postsCount.count ?? 0,
    totalSources: sourcesCount.count ?? 0,
    activeSources: activeCount.count ?? 0,
    postsByPlatform: platformCounts,
    lastRun: lastRun.data ?? null,
  };
}

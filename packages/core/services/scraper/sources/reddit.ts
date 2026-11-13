import { applyFilters, detectLanguage, extractContacts } from "../contacts";
import { classifyPostType, detectWorkModality, extractProfileInfo, guessLocation } from "../enrich";
import type { Post } from "../types";

const USER_AGENT = "web:telegram-freelance-scraper:v1.0 (by /u/anonymous)";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RedditListing {
  data: {
    after: string | null;
    children: Array<{
      data: {
        id: string;
        title: string;
        selftext: string;
        subreddit: string;
        author: string;
        created_utc: number;
        permalink: string;
        score: number;
      };
    }>;
  };
}

function parseListing(json: RedditListing): { posts: Post[]; after: string | null } {
  const posts: Post[] = [];

  for (const child of json.data.children) {
    const d = child.data;
    const text = [d.title, d.selftext].filter(Boolean).join("\n\n").trim();
    if (!text) continue;

    const author = d.author && d.author !== "[deleted]" ? `u/${d.author}` : null;
    const postType = classifyPostType(text);

    posts.push({
      platform: "reddit",
      source: d.subreddit,
      postId: d.id,
      url: `https://www.reddit.com${d.permalink}`,
      postDate: new Date(d.created_utc * 1000).toISOString(),
      insertedAt: "",
      author,
      views: String(d.score),
      text,
      language: detectLanguage(text),
      postType,
      location: guessLocation(text),
      workModality: detectWorkModality(text),
      profile: postType === "profile" ? extractProfileInfo(text) : undefined,
      contacts: extractContacts(text, author),
    });
  }

  return { posts, after: json.data.after };
}

export async function fetchRedditListing(
  subreddits: string[],
  pages: number,
  delayMs: number,
  requireEmail: boolean,
  requireSpanish: boolean,
  log: (msg: string) => void = () => {}
): Promise<Post[]> {
  if (!subreddits.length) return [];

  const combined = subreddits.join("+");
  const all: Post[] = [];
  let after: string | null = null;

  for (let page = 0; page < pages; page++) {
    const url = new URL(`https://www.reddit.com/r/${combined}/new.json`);
    url.searchParams.set("limit", "50");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });

    if (res.status === 403 || res.status === 429) {
      log(`  [reddit/${combined}] HTTP ${res.status} - bloqueado o rate-limited.`);
      break;
    }
    if (!res.ok) {
      log(`  [reddit/${combined}] HTTP ${res.status}`);
      break;
    }

    let json: RedditListing;
    try {
      json = (await res.json()) as RedditListing;
    } catch {
      log(`  [reddit/${combined}] respuesta no es JSON valido.`);
      break;
    }

    const { posts, after: nextAfter } = parseListing(json);
    if (!posts.length) break;

    const kept = applyFilters(posts, requireEmail, requireSpanish);
    all.push(...kept);
    log(`  [reddit/${combined}] pagina ${page + 1}: ${posts.length} vistos, ${kept.length} pasaron el filtro`);

    if (!nextAfter || nextAfter === after) break;
    after = nextAfter;

    if (page < pages - 1) await sleep(delayMs);
  }

  return all;
}

export async function searchSubreddits(query: string, log: (msg: string) => void = () => {}): Promise<string[]> {
  const url = new URL("https://www.reddit.com/subreddits/search.json");
  url.searchParams.set("q", query);

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!res.ok) {
    log(`  busqueda de subreddits para "${query}": HTTP ${res.status}`);
    return [];
  }

  const json = (await res.json()) as { data: { children: Array<{ data: { display_name: string } }> } };
  return json.data.children.map((c) => c.data.display_name);
}

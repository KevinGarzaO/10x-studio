import * as cheerio from "cheerio";
import { applyFilters, detectLanguage, extractContacts } from "../contacts";
import { classifyPostType, detectWorkModality, extractProfileInfo, guessLocation } from "../enrich";
import type { Post } from "../types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface ThreadRef {
  url: string;
  title: string;
  tag: string | null;
}

function parseForumListing(html: string): ThreadRef[] {
  const $ = cheerio.load(html);
  const threads: ThreadRef[] = [];

  $(".structItem-title").each((_, titleEl) => {
    const link = $(titleEl).find("a[href*='/temas/']").first();
    const href = link.attr("href");
    const title = link.text().trim();
    if (!href || !title) return;

    const tag = $(titleEl).find(".label").first().text().trim() || null;

    threads.push({ url: new URL(href, "https://forobeta.com").toString(), title, tag });
  });

  return threads;
}

async function fetchThreadFirstPost(thread: ThreadRef, forum: string): Promise<Post | null> {
  const res = await fetch(thread.url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  const firstMessage = $(".message").first();
  const bodyEl = firstMessage.find(".message-body .bbWrapper").first();
  bodyEl.find("script, style, noscript, iframe").remove();
  bodyEl.find(".bbImageContainer, .lightbox, .js-lbContainer").remove();
  bodyEl.find("br").replaceWith("\n");
  bodyEl.find("a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) $(el).text(href);
  });
  let text = bodyEl.text().trim();
  text = text.replace(/\{[\s\S]*?"lightbox_[^}]*\}/g, "").trim();
  text = text.replace(/\s+/g, " ").replace(/\n\s*\n/g, "\n").trim();
  if (!text) return null;

  const author = firstMessage.find(".message-name").first().text().trim() || null;
  const postDate = firstMessage.find(".message-attribution time").first().attr("datetime") ?? null;
  const postIdMatch = thread.url.match(/\.(\d+)\/?$/);

  const postType = classifyPostType(text, thread.tag);

  return {
    platform: "forobeta",
    source: forum,
    postId: postIdMatch?.[1] ?? null,
    url: thread.url,
    postDate,
    insertedAt: "",
    author,
    views: null,
    text,
    language: detectLanguage(text),
    postType,
    forumHint: thread.tag,
    location: guessLocation(text),
    workModality: detectWorkModality(text),
    profile: postType === "profile" ? extractProfileInfo(text) : undefined,
    contacts: extractContacts(text, author),
  };
}

export async function fetchForobetaForum(
  forumSlug: string,
  pages: number,
  delayMs: number,
  requireEmail: boolean,
  requireSpanish: boolean,
  log: (msg: string) => void = () => {}
): Promise<Post[]> {
  const all: Post[] = [];

  for (let page = 1; page <= pages; page++) {
    const url =
      page === 1
        ? `https://forobeta.com/forums/${forumSlug}/`
        : `https://forobeta.com/forums/${forumSlug}/page-${page}`;

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.status === 404) {
      log(`  [forobeta/${forumSlug}] no existe o no hay mas paginas (404).`);
      break;
    }
    if (!res.ok) {
      log(`  [forobeta/${forumSlug}] HTTP ${res.status}`);
      break;
    }

    const html = await res.text();
    const threads = parseForumListing(html);
    if (!threads.length) break;

    const pagePosts: Post[] = [];
    for (const thread of threads) {
      try {
        const post = await fetchThreadFirstPost(thread, forumSlug);
        if (post) pagePosts.push(post);
      } catch (err) {
        log(`  [forobeta/${forumSlug}] error en hilo "${thread.title}": ${(err as Error).message}`);
      }
      await sleep(delayMs);
    }

    const kept = applyFilters(pagePosts, requireEmail, requireSpanish);
    all.push(...kept);
    log(`  [forobeta/${forumSlug}] pagina ${page}: ${threads.length} hilos, ${pagePosts.length} con texto, ${kept.length} pasaron el filtro`);
  }

  return all;
}

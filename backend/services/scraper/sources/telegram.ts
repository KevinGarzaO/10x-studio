import * as cheerio from "cheerio";
import { applyFilters, detectLanguage, extractContacts } from "../contacts";
import { classifyPostType, detectWorkModality, extractProfileInfo, guessLocation } from "../enrich";
import type { Post } from "../types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function parsePage(html: string, channel: string): { posts: Post[]; oldestId: string | null } {
  const $ = cheerio.load(html);
  const posts: Post[] = [];
  let oldestId: number | null = null;

  $("div.tgme_widget_message_wrap").each((_, wrap) => {
    const msgDiv = $(wrap).find("div.tgme_widget_message").first();
    if (!msgDiv.length) return;

    const postId = msgDiv.attr("data-post") ?? "";
    const msgNum = postId.includes("/") ? postId.split("/").pop()! : null;

    const textDiv = msgDiv.find("div.tgme_widget_message_text").first();
    textDiv.find("br").replaceWith("\n");
    const text = textDiv.text().trim();
    if (!text) return;

    const dateIso = msgDiv.find("a.tgme_widget_message_date time").first().attr("datetime") ?? null;
    const views = msgDiv.find("span.tgme_widget_message_views").first().text().trim() || null;
    const link =
      msgDiv.find("a.tgme_widget_message_date").first().attr("href") ??
      (postId ? `https://t.me/${postId}` : null);

    const postType = classifyPostType(text);

    posts.push({
      platform: "telegram",
      source: channel,
      postId: msgNum,
      url: link,
      postDate: dateIso,
      insertedAt: "",
      author: null,
      views,
      text,
      language: detectLanguage(text),
      postType,
      location: guessLocation(text),
      workModality: detectWorkModality(text),
      profile: postType === "profile" ? extractProfileInfo(text) : undefined,
      contacts: extractContacts(text, null),
    });

    if (msgNum && /^\d+$/.test(msgNum)) {
      const n = parseInt(msgNum, 10);
      if (oldestId === null || n < oldestId) oldestId = n;
    }
  });

  return { posts, oldestId: oldestId === null ? null : String(oldestId) };
}

export async function fetchTelegramChannel(
  channel: string,
  pages: number,
  delayMs: number,
  requireEmail: boolean,
  requireSpanish: boolean,
  log: (msg: string) => void = () => {}
): Promise<Post[]> {
  const all: Post[] = [];
  let before: string | null = null;

  for (let page = 0; page < pages; page++) {
    const url = new URL(`https://t.me/s/${channel}`);
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });

    if (res.status === 404) {
      log(`  [telegram/${channel}] no existe o no es un canal publico (404).`);
      break;
    }
    if (!res.ok) {
      log(`  [telegram/${channel}] HTTP ${res.status}`);
      break;
    }

    const html = await res.text();
    const { posts, oldestId } = parsePage(html, channel);
    if (!posts.length) break;

    const kept = applyFilters(posts, requireEmail, requireSpanish);
    all.push(...kept);
    log(`  [telegram/${channel}] pagina ${page + 1}: ${posts.length} vistos, ${kept.length} pasaron el filtro`);

    if (!oldestId || oldestId === before) break;
    before = oldestId;

    if (page < pages - 1) await sleep(delayMs);
  }

  return all;
}

import type { Post } from "./types";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(__dirname, "..", "..", "..", "data");
const SEEN_FILE = path.join(DATA_DIR, "seen.json");

export function postKey(post: Post): string {
  const id = post.postId ?? post.url ?? post.text.slice(0, 50);
  return `${post.platform}:${post.source}:${id}`;
}

export async function loadSeenStore(): Promise<Map<string, string>> {
  try {
    const raw = await fs.promises.readFile(SEEN_FILE, "utf-8");
    const obj = JSON.parse(raw) as Record<string, string>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

export async function saveSeenStore(store: Map<string, string>): Promise<void> {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  const obj = Object.fromEntries(store);
  await fs.promises.writeFile(SEEN_FILE, JSON.stringify(obj, null, 2), "utf-8");
}

export function dedupeAgainstSeen(
  posts: Post[],
  store: Map<string, string>,
  skipSeen: boolean
): { kept: Post[]; skippedCount: number } {
  const kept: Post[] = [];
  let skippedCount = 0;

  for (const post of posts) {
    const key = postKey(post);
    const existingInsertedAt = store.get(key);

    if (existingInsertedAt) {
      skippedCount++;
      if (skipSeen) continue;
      post.insertedAt = existingInsertedAt;
      kept.push(post);
      continue;
    }

    post.insertedAt = new Date().toISOString();
    store.set(key, post.insertedAt);
    kept.push(post);
  }

  return { kept, skippedCount };
}

export function flagCrossSourceDuplicates(posts: Post[]): void {
  const byEmail = new Map<string, Post>();

  for (const post of posts) {
    const email = post.contacts.emails?.[0]?.toLowerCase();
    if (!email) continue;

    const existing = byEmail.get(email);
    if (existing) {
      post.possibleDuplicateOf = postKey(existing);
    } else {
      byEmail.set(email, post);
    }
  }
}

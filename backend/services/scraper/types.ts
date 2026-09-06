export type Platform = "telegram" | "forobeta" | "reddit" | "workable" | "greenhouse" | "lever";

export type PostType = "vacancy" | "profile" | "unknown";

export type WorkModality = "remote" | "onsite" | "hybrid" | "unknown";

export interface ContactInfo {
  emails?: string[];
  whatsapp?: string[];
  telegramLinks?: string[];
  mentions?: string[];
  phones?: string[];
  contactNameGuess?: string | null;
  referTo?: string;
  applyUrl?: string | null;
}

export interface ProfileInfo {
  roles: string[];
  skills: string[];
  yearsExperience: number | null;
  rate: string | null;
  portfolioLinks: string[];
}

export interface Post {
  platform: Platform;
  source: string;
  postId: string | null;
  url: string | null;
  postDate: string | null;
  insertedAt: string;
  author: string | null;
  views: string | null;
  text: string;
  language: string;
  postType: PostType;
  forumHint?: string | null;
  location: string | null;
  workModality: WorkModality;
  profile?: ProfileInfo;
  contacts: ContactInfo;
  possibleDuplicateOf?: string | null;
  company?: string | null;
  companyLogo?: string | null;
}

export interface SourceConfig {
  telegram: string[];
  forobeta: string[];
  reddit: string[];
}

export interface ScrapeOptions {
  platforms: Platform[];
  sources: SourceConfig;
  pages: number;
  delayMs: number;
  requireEmail: boolean;
  requireSpanish: boolean;
  skipSeen: boolean;
}

export interface ScrapeResult {
  scrapedAt: string;
  platforms: Platform[];
  sources: SourceConfig;
  totalMessages: number;
  skippedAsSeen: number;
  messages: Post[];
  outputFile?: string;
}

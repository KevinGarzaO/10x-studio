# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Avocado Studio (aka "10X Studio") is a pnpm monorepo for AI-assisted content creation and publishing, plus a job-board community product. It has three deployable apps and a browser extension:

- `apps/avocado` — Next.js 14 app, the content studio (redactor, calendar, Substack/LinkedIn/blog publishing, topics, web scraping views). Runs on port 3000.
- `apps/community` — Next.js app, "Avocado Forum" / job community hub (posts, comments, saved jobs, user auth, job vacancies). Runs on port 3002. Deployed to Vercel (see `vercel.json`, root dir `apps/community`).
- `backend` — Express + TypeScript API shared by both frontends. Runs on port 3001. Deployed to Railway (see `railway.toml`, builds/starts from `backend/`).
- `extension` — Manifest V3 Chrome extension ("Redactor IA — Conectar Substack") that bridges Substack cookies/session into the app via content scripts.

Both frontends talk to the single `backend` Express API, never to Supabase/Postgres directly. `apps/avocado/src/lib/api.ts` is the shared fetch wrapper — it requires `NEXT_PUBLIC_BACKEND_URL` to be set and throws loudly if missing.

## Commands

Run from the repo root with pnpm (workspace defined in `pnpm-workspace.yaml`: `apps/*` + `backend`).

```bash
pnpm install                 # install all workspace deps

pnpm dev                     # run avocado + community + backend concurrently
pnpm dev:avocado             # apps/avocado only (port 3000)
pnpm dev:community           # apps/community only (port 3002)
pnpm dev:backend             # backend only (port 3001), via ts-node

pnpm build                   # builds backend only (tsc)
pnpm build:avocado           # next build for apps/avocado
pnpm build:community         # next build for apps/community
pnpm build:backend           # tsc for backend
```

Per-package commands (run inside the package or via `pnpm --filter <name> <script>`):

- `backend`: `npm run lint` (eslint), `npm run start` (runs compiled `dist/index.js`), `npm run migrate-history` / `npm run sync-to-community` (one-off `tsx` scripts in `backend/scripts/`).
- `apps/avocado`: `npm run lint` (`next lint`).
- `apps/community`: no lint script defined.

There is no configured test runner in any package — do not assume `npm test`/`vitest`/`jest` exist. One-off diagnostic scripts under `backend/scripts/` (e.g. `test-ats.ts`, `test-ats-db.ts`, `sync-ats-test.ts`) are run manually with `tsx scripts/<file>.ts`, not via a test framework.

## Architecture

### Backend (`backend/`)

Single Express app (`backend/index.ts`) mounting several route groups under `/api`, each behind `authMiddleware` (Firebase-based) unless noted:

- `crud`, `ai`, `users`, `blog`, `linkedin` — the Studio's core content/AI/publishing endpoints (studio auth).
- `/api/substack` — Substack integration (posts, stats, subscribers), synced via cron.
- `/api/community/*` — the Community Hub API (`backend/src/routes/community/*`, controllers/services live alongside), using a separate `communityAuthMiddleware` (its own auth is public for `/auth`, protected for `saved`, mixed elsewhere).
- `/api/scraper` — job-scraper endpoints, no auth (internal use).
- `/api-docs` — Swagger UI generated from JSDoc comments in `routes/*.ts`.

Data layer is Supabase/Postgres, accessed via `backend/services/supabase.service.ts` (a shared `supabase` client) — SQL migrations live in `backend/sql/*.sql` and are applied manually, there's no migration runner.

Background jobs are two independent cron subsystems started at boot in `index.ts` (`initCron()`):
- `services/cron.service.ts` — Substack data sync every 15 min, plus a "Daily Orchestrator" cron (`45 17 * * *` = 11:45 Monterrey time) that runs one AI-generated topic through image generation → Blog (ES/EN) → LinkedIn (ES/EN) → Newsletter, gated by `GLOBAL_START_DATE`.
- `services/scraper/scheduler.ts` (`initScraperCron`, invoked separately from the scraper flow) — job-scraper production run every 30 min and a sync run every 35 min, ATS sources only (discovery is currently disabled).

The job scraper (`backend/services/scraper/`) is a pipeline: `discovery` (disabled) → `producer` (runs production) → per-source scrapers in `sources/` (`greenhouse`, `lever`, `workable`, `reddit`, `telegram`, `forobeta`) → `enrich`/`contacts`/`profiles` → `dedupe` → `db` (persistence) → `sync` (pushes into the community DB/consumer side). `ai.ts` and `types.ts` support that pipeline.

Content generation (`lib/prompts.ts`, `lib/converter.ts`, `services/content.service.ts`, `services/image.service.ts`, `services/search.service.ts`) uses `@google/genai` (Gemini) for text/image generation and search-grounding.

### apps/avocado (Studio frontend)

Next.js App Router under `src/app`, with a route group `(dashboard)` holding the main authenticated sections: `dashboard`, `redactor`, `calendar`, `topics`, `substack`, `linkedin`, `web`, `settings`. UI is organized by feature under `src/components/<feature>/` mirroring those routes (e.g. `components/substack/`, `components/topics/`, `components/redactor/`). Shared app state/bootstrapping lives in `components/layout/AppProvider.tsx` and `hooks/useAppData.ts`. All backend calls go through `src/lib/api.ts`; direct Supabase access from the client is in `src/lib/supabase.ts` (used sparingly — most reads/writes go through the backend). Uses PrimeReact + Tailwind, Tiptap for rich text editing, and PWA registration (`InstallPWA`/`PWARegister`).

### apps/community (Job community / forum frontend)

Next.js App Router under `app/`: `login`/`signup` (auth), `create` (new post), `post/[id]`, `users/[username]`, `vacantes/[slug]` (job postings), `saved`, `notifications`, `profile`, `settings`. `components/community-hub.tsx` and `components/account-pages.tsx` are the large composite screens; `components/ui/` holds shadcn-style primitives (`components.json` confirms shadcn is configured). Talks to the same `backend` API (`/api/community/*` routes), independently of `apps/avocado`.

Note: `apps/community/CLAUDE.md` and `apps/community/AGENTS.md` are auto-generated boilerplate re-written by `next dev` on every run (see the file's own header) — not maintained documentation, safe to ignore/regenerate.

### extension

Plain MV3 extension, no build step: `background.js` (service worker), `content.js` (runs on `*.substack.com`, extracts session/cookies), `content_app.js` (runs on the studio app's own origin to receive messages via `postMessage`), `popup.js`/`popup.html`. Loaded unpacked via `chrome://extensions`.

## Cross-cutting notes

- Auth is split: Firebase-based `authMiddleware` protects the Studio/content endpoints; a separate `communityAuthMiddleware` protects Community Hub endpoints. Don't assume one covers the other.
- `NEXT_PUBLIC_BACKEND_URL` must be set for `apps/avocado` (and analogously for `apps/community`) to reach the Railway-hosted `backend`; local dev typically points it at `http://localhost:3001`.
- The scraper and content-orchestrator crons run automatically whenever the backend process starts (`initCron()` in `index.ts`) — be aware of this when running `pnpm dev:backend` locally, as it will fire scheduled jobs against real Supabase data and external APIs.

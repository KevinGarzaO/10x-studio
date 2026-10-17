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

Run from the repo root with pnpm (workspace defined in `pnpm-workspace.yaml`: `apps/*` + `backend` + `packages/*`).

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

- `backend`: `npm run lint` (eslint), `npm run start` (runs compiled `dist/index.js`), `npm run test` (Vitest, `tests/unit/`), `npm run test:integration` (Vitest, `tests/integration/`), `npm run migrate-history` / `npm run sync-to-community` (one-off `tsx` scripts in `backend/scripts/`).
- `apps/avocado`: `npm run lint` (`next lint`). No test runner configured here yet.
- `apps/community`: `npm run test` (Vitest + Testing Library, `tests/`). No lint script defined.
- `packages/schemas`: shared Zod schemas (workspace package `@avocado/schemas`), consumed by `backend` and `apps/community`. `npm run build` (tsc, emits to `dist/`) runs automatically via the repo root's `postinstall` after every `pnpm install`. `npm run test` (Vitest).
- Root: `pnpm test:e2e` (Playwright, `e2e/`) exercises real flows against a running `backend` + `apps/community`.

Vitest (`backend`, `apps/community`, `packages/schemas`) and Playwright (`e2e/`) were introduced by the exam-question-form feature — before that, no test runner existed in any package. One-off diagnostic scripts under `backend/scripts/` (e.g. `test-ats.ts`, `test-ats-db.ts`, `sync-ats-test.ts`) predate this and are still run manually with `tsx scripts/<file>.ts`, not via a test framework.

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
- The skill catalog lives in the database (`skills`, `skill_aliases`, `skill_proposals`) and is served by `GET /api/community/skills`; candidates propose missing ones through `/api/community/skill-proposals`. The frontend consumes it as data — `CANONICAL_SKILLS` no longer exists, so a skill approved in SQL reaches the app without a redeploy.
- Account type (`users.account_type`) and the superadmin permission (`users.is_superadmin`) are intentionally not changed from the app: `change_account_type()`, `set_superadmin()` and the skill-proposal decisions run in the Supabase SQL editor, and a trigger blocks every other path. Authorization middleware lives in `backend/src/middleware/` (`requireSuperadmin`, `requireAccountType`); `users.roles` now only holds scraper job keywords.
- `users.user_kind` (`user` | `company` | `superadmin`) is a generated column derived from `account_type` and `is_superadmin`, so it cannot drift. `users.is_test_account` marks our own test/QA accounts and is set by hand in SQL; scraper-created companies are real, not test. `npm run user-stats` (in `backend/`) prints the counts. Migration: `backend/sql/user-classification-migration.sql`. `users.profile_completed` is also generated (photo for everyone; candidates also title, role, level, location, modality and at least one skill) and the app's onboarding gate (`apps/community/lib/profile-gate.ts`) honors it. Accounts matching test patterns (e2e-*, t001-*, +test emails, ...) are flagged `is_test_account` on insert by a trigger, and a company created by approving a claim inherits the claimant's flag (`backend/sql/profile-completion-migration.sql`).
- Role categories (`@avocado/schemas`, `ROLE_CATEGORY` / `ROLE_CATEGORY_LABEL`, Spanish names) are the person's *puesto*: the profile no longer has a typed title, `users.title` is derived from the chosen role. Vacancies get their category from `classify_role_category()` (SQL, generated from `backend/services/scraper/role-rules.ts`: whole words, title first); change the rules in the TS module, regenerate the SQL and keep `tests/unit/role-rules.test.ts` green. `skills.role_categories` links each skill to roles for the profile skill picker.
- The CV lives in `users.cv` (JSON, schema in `packages/schemas/src/cv.ts`) and `users.cv_public` (private by default). It is saved apart from the profile (`PUT /users/:username/cv`) and served only at `GET /users/:username/cv` when public or owner. The public profile endpoint strips private columns (`PRIVATE_USER_FIELDS` in `users.routes.ts`): never return a raw `select('*')` of `users`. Migrations: `user-cv-migration.sql`, `role-categories-migration.sql`, `skills-role-categories-migration.sql`.
- Vacancies are linked at ingest: `insertPost()` (scraper `db.ts`) runs `enrichVacancy()` (`backend/services/vacancies/`) over the FULL description (`Post.analysisText`; the stored `text` is truncated by each source) and saves role, seniority (`NULL` = unknown, never guessed), skills (detected from the DB catalog via `skills.detect_terms`, seeded from `skill-terms.ts`) and modality. The DB trigger only falls back for the role. Re-run enrichment on stored vacancies with `npm run backfill-vacancies` (dry-run by default; `-- --apply`, `-- --refetch`). Migrations: `vacancy-enrichment-migration.sql`, `vacancy-analytics-migration.sql`.
- "Para ti" scores each vacancy against the person with `services/matching/score.ts` (role 35, skills 35, seniority 15, modality 15; shown if it shares a skill and scores >= 45). `npm run match-report` (and the `role_supply_demand` / `skill_supply_demand` views) show roles and skills without offers and candidates with few good offers, from the same scoring.
- **Business rule: a vacancy only enters the feed if it is linked to the catalogs** (title, company, apply link, a role other than `otro`, and at least one catalog skill). Single definition: `backend/services/vacancies/publish-rule.ts`; enforced at scraper ingest (`insertPost`, which also deletes the staged row), at promotion (`syncVacancyToCommunity`/`syncAllPending`), on manual creation (`POST /api/community/posts`) and by the `enforce_vacancy_linkage` insert trigger (`backend/sql/vacancy-publish-rule-migration.sql`). `npm run clean-vacancies` (dry-run; `--apply`) removes legacy vacancies that do not comply, sparing those with comments or saves. Role is classified from the title only.
- Vacancies are posted to the owner's LinkedIn twice a day, Mon-Sat (8:30 and 13:30 Monterrey), from `services/linkedin/` (`vacancy-post.ts` picks the vacancy and writes the text from a template, no AI; `vacancy-publisher.ts` publishes it as a link card and records it in `linkedin_vacancy_posts`). Off until `LINKEDIN_VACANCY_POSTS=on` is set on the server; `COMMUNITY_APP_URL` must be the public site. Check the texts with `npm run linkedin-vacancy-preview`. The vacancy page's link card comes from the server layout `app/(main)/vacantes/[slug]/layout.tsx`.
- Signup origin (UTM): the browser stores the first origin for 30 days (`apps/community/lib/attribution.ts`), sends one visit per session to `POST /api/community/attribution/visit` and the origin with the signup (`users.signup_*`). `npm run signup-sources` prints visitors, signups and conversion per origin (view `acquisition_by_source`). Migration: `linkedin-vacancies-attribution-migration.sql`. `enable-rls-migration.sql` closes every public table to anon/authenticated: new tables need `ENABLE ROW LEVEL SECURITY`.
- `NEXT_PUBLIC_BACKEND_URL` must be set for `apps/avocado` (and analogously for `apps/community`) to reach the Railway-hosted `backend`; local dev typically points it at `http://localhost:3001`.
- The scraper and content-orchestrator crons run automatically whenever the backend process starts (`initCron()` in `index.ts`) — be aware of this when running `pnpm dev:backend` locally, as it will fire scheduled jobs against real Supabase data and external APIs.

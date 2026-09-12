<!--
Sync Impact Report
- Version change: [TEMPLATE] → 1.0.0 (initial ratification)
- Modified principles: n/a (first concrete version, replacing all placeholder tokens)
- Added sections: Core Principles (6), Technology Stack, Governance
- Removed sections: none
- Templates requiring follow-up: none — dependent templates (plan/spec/tasks) read this
  file at runtime and are not modified by this command.
- Deferred items: RATIFICATION_DATE set to today (2026-09-12) since no earlier
  ratification date exists for this project; adjust manually if an earlier date should
  be recorded.
-->

# AvoTalent Constitution

## Core Principles

### I. Three-Layer Validation
Every piece of user-supplied data MUST be validated at three layers: the database
(constraints), the backend (Zod schemas), and the frontend (the same Zod schema,
imported — never re-declared). The backend MUST NEVER trust frontend validation and
MUST always re-validate independently, since the backend is reachable directly
(`/api/*`) without going through any frontend.

**Rationale**: Both `apps/avocado` and `apps/community` talk to the same shared
`backend` Express API. A frontend-only check is not a security or data-integrity
boundary — it protects nothing once the API is called directly (curl, another
client, or a compromised frontend build).

### II. Shared Validation Schemas
All validation schemas live in `packages/schemas/` and MUST be imported by both the
relevant frontend app and the backend route that accepts the same data — never
duplicated or redefined per-app.

**Rationale**: This repo has previously suffered from the same normalization logic
(e.g. `companySlug()`) being duplicated between `apps/community/lib/company.ts` and
`backend/services/company.ts`, causing grouping/dedup bugs when the two drifted.
A single shared schema source removes this class of bug for validation.

### III. Explicit Auth on Every Endpoint
Every new backend endpoint MUST explicitly declare and verify both authentication
and authorization — which middleware applies, and what the caller is permitted to
act on (e.g. their own resources only, admin-only, etc.). No endpoint is exempt by
default.

**Rationale**: This project already runs two separate auth systems (Firebase-based
`authMiddleware` for Studio endpoints, `communityAuthMiddleware` for Community Hub
endpoints), and a real incident occurred this project where two scraper-trigger
endpoints (`/api/scraper/sync`, `/api/scraper/scrape`) shipped to production with
zero authentication. Explicit, endpoint-by-endpoint verification is required to
prevent recurrence.

### IV. Trim All Free Text
Every free-text field MUST be trimmed before it is persisted, with no exceptions.

**Rationale**: Untrimmed text has previously caused duplicate/near-duplicate
grouping bugs in this codebase (e.g. company-name variants fragmenting the job-feed
round-robin). Trimming at write time is cheap and eliminates an entire class of
downstream matching bugs.

### V. Tests Ship With The Code
Every new piece of code MUST include tests — at minimum one unit test and one
integration test — in the same pull request that introduces it. Tests are not
deferred to a follow-up PR.

**Rationale**: This repo currently has no configured test runner in any package.
This principle governs all *new* code going forward; introducing a test runner
(e.g. Vitest/Jest) is itself an in-scope prerequisite the first time this principle
applies to a PR, not something to defer indefinitely.

### VI. No Undisclosed Scope Creep
Existing logic outside the explicit scope of the current task MUST NOT be modified
without first flagging the change to the user and getting acknowledgment before
touching it.

**Rationale**: This project's working style (established over many prior sessions)
depends on the person directing the work being able to trust that a requested fix
stays contained to what was asked — unrelated refactors or "while I'm here" changes
create review burden and risk regressions in untouched features.

## Technology Stack

This is a pnpm monorepo. Frontend: Next.js (`apps/avocado` — content studio, port
3000; `apps/community` — AvoTalent job/forum hub, port 3002). Backend: Express +
TypeScript (`backend`, port 3001), the single API both frontends call — neither
frontend accesses Supabase/Postgres directly except where explicitly documented as
an exception. Data layer: Supabase (Postgres). A browser extension (`extension`,
Manifest V3) bridges Substack session data into the studio app. New code MUST fit
within this existing stack; introducing a new language, framework, or datastore is
a decision for the user, not a default choice.

## Governance

This constitution supersedes ad-hoc conventions and prior undocumented practice
whenever the two conflict. Amendments are made via `/speckit-constitution`, must
state the reason for the change, and follow semantic versioning:

- **MAJOR**: backward-incompatible removal or redefinition of a principle.
- **MINOR**: a new principle or materially expanded section is added.
- **PATCH**: wording, clarification, or non-semantic fixes.

All new PRs and code changes are expected to comply with the principles above;
non-compliance must be explicitly justified in the PR description if it cannot be
avoided. `CLAUDE.md` remains the authoritative day-to-day operational/runtime
guidance file (commands, architecture map); this constitution governs the
non-negotiable rules that guidance must not contradict.

**Version**: 1.0.0 | **Ratified**: 2026-09-12 | **Last Amended**: 2026-09-12

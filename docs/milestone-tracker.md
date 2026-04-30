# Flatmeal Milestone Tracker

Persistent progress tracker for coding agents. Update this file after every meaningful feature, checkpoint, blocker, verification run, or agent-created commit/push.

## Current Milestone

- **Current:** M3 — Fake Swiggy OAuth PKCE and encrypted household connection.
- **Status:** Ready to start.
- **Goal:** Add local fake Swiggy OAuth routes, PKCE state validation, encrypted token storage, expiry/reconnect state, and owner-only connection flow.

## Build Order

- **M0:** Docs and Swiggy contract readiness.
- **M1:** TypeScript backend scaffold, environment config, Supabase schema/migrations.
- **M2:** Telegram bot onboarding, roles, cook language, group setup.
- **M3:** Fake Swiggy OAuth PKCE and encrypted household connection.
- **M4:** Local Instamart MCP stub with all 13 contract-tested tools.
- **M5:** OpenAI agent intent/extraction, Sarvam STT/TTS, cook prompt flow.
- **M6:** Cart build, add-more window, approval revisioning, checkout simulation.
- **M7:** Observability, `agent_events`, traces, eval fixtures, demo script.
- **M8:** End-to-end Telegram demo and Swiggy access-review video checklist.

## Completed Milestones

- **M0 — Docs and Swiggy contract readiness.**
  - Product plan, agent workflow, Swiggy contract gates, and milestone workflow are in place.
  - All 13 Instamart tools now have per-tool local contract sections checked against live Swiggy docs.
- **M1 — TypeScript backend scaffold, environment config, Supabase schema/migrations.**
  - Added Node.js + Express + TypeScript scaffold with strict env validation and test runner.
  - Added Supabase admin-client boundary for backend-only service-role access.
  - Added initial Instamart tool-name contract test scaffold without implementing tool behavior.
  - Added and applied Supabase migrations for MVP state tables and foreign-key indexes.
- **M2 — Telegram bot onboarding, roles, cook language, group setup.**
  - Added direct Telegram webhook route and idempotent update handling.
  - Added setup-card send action when the bot is added to a group.
  - Added role callback handling with first-owner-wins protection.
  - Added cook language callback handling that requires an existing cook role.
  - Added direct Telegram Bot API sender for setup cards, language cards, and callback answers.

## In Progress

- M3 is ready to begin:
  - Add fake OAuth authorize/callback/token routes.
  - Store PKCE state and code verifier hashes in `oauth_sessions`.
  - Encrypt fake access tokens before writing `swiggy_connections`.
  - Add owner-only Swiggy connect checks for Telegram flow.

## Next Tasks

1. Start M3 with fake OAuth PKCE unit tests.
2. Implement fake Swiggy authorize/callback/token exchange routes.
3. Add encrypted token storage and expiry state.
4. Add Telegram owner-only connect action.
5. Keep local Instamart tool behavior blocked until M4 contract tests exist.

## Blockers

- No implementation blockers recorded yet.
- Future implementation requires real API keys/config from the user:
  - Telegram bot token.
  - OpenAI API key.
  - Sarvam API key.
  - Supabase project URL, anon/publishable key, service-role key, and database URL.
  - Public HTTPS webhook URL for local development or deployment.
  - Encryption secret for Swiggy token storage.

## Verification History

- 2026-05-01: Docs reviewed and updated for Telegram-first MVP, Swiggy delegated OAuth, local Instamart MCP contract extraction, and milestone workflow.
- 2026-05-01: Added `docs/ai-agent-architecture.md` as the source of truth for OpenAI specialist agents, backend-owned safety gates, Supabase memory, tool exposure, traces, and evals. Updated session/agent docs to require reading it.
- 2026-05-01: Updated milestone Git workflow so future agents may commit and push after significant milestones without asking again, while blocking commit/push on unrelated changes, failed milestone verification, missing remote/credentials, or explicit user opt-out.
- 2026-05-01: Fetched live Swiggy docs index, Instamart overview, all 13 Instamart tool pages, auth, delegated auth, errors, production, access, rate-limit, data/compliance, and grocery recipe docs. Expanded `docs/swiggy-instamart-tool-contracts.md` so every Instamart tool has a per-tool implementation-gate section with args, response envelope, workflow rules, local stub behavior, and required tests. Verified with `rg '^### \`' docs/swiggy-instamart-tool-contracts.md`, `rg 'Tool-specific data expectations:|Exact Swiggy agent guidance / workflow rules:|Required contract tests:' docs/swiggy-instamart-tool-contracts.md`, and `git diff --check`.
- 2026-05-01: Completed M1 scaffold. Verified with `npm install`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
- 2026-05-01: Applied Supabase migrations `initial_mvp_schema` and `add_mvp_foreign_key_indexes` through Supabase MCP. Verified 14 public MVP tables with RLS enabled via Supabase MCP `list_tables` and SQL query. Security advisor shows expected `rls_enabled_no_policy` info notices for backend-only service-role tables; it also reports pre-existing `public.rls_auto_enable()` SECURITY DEFINER execute warnings that were not created by this milestone. Performance advisor foreign-key warnings were fixed; remaining performance notices are unused-index info on the empty new schema.
- 2026-05-01: Fetched live Telegram Bot API docs before M2 implementation. Completed Telegram onboarding slice with webhook intake, setup card sending, role callbacks, first-owner-wins protection, cook language persistence, Telegram sender tests, and Supabase repository boundary. Verified with `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.

## Commit / Push History

- 2026-05-01: Agent created and pushed a docs-only update on `main` covering the milestone Git workflow in `AGENTS.md`, `docs/new-session-prompt.md`, and this tracker.
- 2026-05-01: Agent created and pushed a docs-only M0 completion update on `main` covering completed Swiggy Instamart per-tool contract gates in `docs/swiggy-instamart-tool-contracts.md` and this tracker.
- 2026-05-01: Agent created and pushed M1 scaffold update on `main` covering TypeScript backend scaffold, env validation, Supabase migrations, initial contract-test scaffold, and this tracker.
- 2026-05-01: Agent created and pushed M2 Telegram onboarding update on `main` covering webhook intake, Telegram setup/language cards, role callbacks, cook language persistence, and this tracker.

## Milestone Update Template

Use this format when updating progress:

```md
### YYYY-MM-DD — Mx: short title

- Changed:
- Verified:
- Blocked:
- Next:
- Proposed commit:
```

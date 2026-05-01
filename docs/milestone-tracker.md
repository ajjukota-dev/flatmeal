# Flatmeal Milestone Tracker

Persistent progress tracker for coding agents. Update this file after every meaningful feature, checkpoint, blocker, verification run, or agent-created commit/push.

## Current Milestone

- **Current:** M5 — OpenAI agent intent/extraction, Sarvam STT/TTS, cook prompt flow.
- **Status:** In progress.
- **Goal:** Add backend-managed OpenAI specialist-agent phases and Sarvam speech adapters for Telegram text/voice intent extraction and cook prompt delivery, without letting agents own cart truth or checkout state.

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
- **M3 — Fake Swiggy OAuth PKCE and encrypted household connection.**
  - Rechecked live Swiggy authentication and delegated-auth docs before implementation.
  - Added fake OAuth authorize/callback/token flow with PKCE S256 state and code validation.
  - Added owner-only Swiggy connect start checks backed by Supabase household membership.
  - Added encrypted fake access-token storage in `swiggy_connections`.
  - Added Telegram owner connect-link action after owner role selection.
- **M4 — Local Instamart MCP stub with all 13 contract-tested tools.**
  - Rechecked live Swiggy Instamart/auth/error docs before implementation.
  - Added local MCP-compatible `/mcp/instamart` JSON-RPC endpoint shape.
  - Added all 13 documented Instamart tool names and contract-tested local handlers.
  - Added variant-level `spinId` search/go-to results, full-cart replacement, bill/payment cart reads, checkout approval gate, order history/details/tracking, and sanitized `report_error`.
  - Added uncertain-checkout simulation that requires `get_orders` verification before retry.

## In Progress

- M5 is in progress:
  - Re-read OpenAI, Sarvam, Telegram, and agent architecture docs before coding.
  - Fetched current OpenAI Agents SDK and Sarvam STT/TTS docs before implementation.
  - Add structured intent/extraction schemas and backend-managed specialist-agent wrappers.
  - Add Sarvam STT/TTS adapters behind small provider interfaces.
  - Keep Supabase as authoritative memory; agent/session state must not own cart, approval, OAuth, address, or order truth.

## Next Tasks

1. Fetch current OpenAI Agents SDK docs and Sarvam STT/TTS docs.
2. Add strict structured-output schemas for intent, meal request, cook prompt, missing items, and cart plan.
3. Implement backend-owned agent wrapper interfaces for intent and extraction phases.
4. Add Sarvam STT/TTS provider interfaces and Telegram voice-note placeholders.
5. Verify with focused unit tests, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.

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
- 2026-05-01: Fetched live Swiggy authentication and delegated-auth docs before M3 implementation. Completed fake Swiggy OAuth with PKCE S256 authorization URL generation, state/code validation, single-use code exchange, owner-only connection start, encrypted fake token storage, and Telegram owner connect-link action. Verified with `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
- 2026-05-01: Re-verified M0-M3 against live Swiggy docs after tightening `AGENTS.md` documentation-review rules. Fetched live Swiggy auth, delegated-auth, Instamart overview, grocery recipe, errors, and all 13 Instamart tool markdown pages into `/private/tmp/flatmeal-swiggy-docs`. Confirmed M0 local tool contracts still match live tool names, endpoint, argument names, response envelopes, `spinId` guidance, `update_cart` replacement behavior, and checkout confirmation/payment guidance. Confirmed M3 fake OAuth mirrors documented PKCE S256, `/auth/authorize` and `/auth/token` shape, 120-second single-use authorization code, 5-day access token, no refresh-token issuance, no third-party OTP collection, and per-user delegated token storage. Verified with `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
- 2026-05-01: Started M4 by re-reading local Swiggy contract docs and fetching live Swiggy docs for auth, delegated auth, Instamart overview, grocery recipe, errors, and all 13 Instamart tool pages into `/private/tmp/flatmeal-swiggy-docs-m4`. Confirmed implementation will start with contract tests before local MCP stub code.
- 2026-05-01: Added M4 local Instamart MCP contract tests before implementation. Initial `npm test` failed as expected because `src/instamart/local-mcp-stub.ts` does not exist yet.
- 2026-05-01: Completed M4 local Instamart MCP stub. Verified live Swiggy docs fetched into `/private/tmp/flatmeal-swiggy-docs-m4`, all 13 local tool handlers, strict argument validation, no auth credentials in tool arguments, `spinId` variants, full-cart replacement, checkout approval/stale/duplicate gates, uncertain-checkout `get_orders` branch, order details/tracking, sanitized `report_error`, and `/mcp/instamart` JSON-RPC route wiring. Verified with `npm test`, `npm run typecheck`, `npm run build`, and `git diff --check`.
- 2026-05-01: Started M5 by re-reading local MVP, agent architecture, context, Swiggy observability, Swiggy contract, and milestone docs. Fetched official OpenAI Agents SDK docs into `/private/tmp/flatmeal-openai-sarvam-docs-m5` and confirmed `@openai/agents`, `Agent`, `run`, Zod `outputType`, and run tracing metadata controls. Fetched official Sarvam STT/TTS Markdown docs and confirmed REST endpoints `/speech-to-text` and `/text-to-speech`, `api-subscription-key` auth header, required STT `file`, required TTS `text` plus `target_language_code`, STT `transcript` response, and TTS `audios` response.
- 2026-05-01: Added M5 strict Zod structured-output schemas for intent, meal requests, cook prompts, missing items, and cart build plans. Verified with `npm test -- src/agents/schemas.test.ts`.
- 2026-05-01: Added M5 backend-owned OpenAI specialist-agent wrappers using `@openai/agents`, no model-owned tools for intent/extraction/cook-prompt phases, max-turn agent runs, sanitized trace metadata, and runtime output validation before workflow consumption. Verified with `npm test -- src/agents/specialists.test.ts` and `npm run typecheck`.
- 2026-05-01: Added M5 Sarvam STT/TTS provider interfaces and REST adapter using official `/speech-to-text` multipart `file` upload, `/text-to-speech` JSON request, `api-subscription-key` auth header, STT `transcript` parsing, TTS `audios` base64 decoding, and documented Sarvam error-envelope surfacing. Verified with `npm test -- src/speech/sarvam.test.ts` and `npm run typecheck`.
- 2026-05-01: Rechecked live Telegram Bot API docs for `Voice`, `getFile`, file download URLs, and `sendVoice`. Added Telegram voice-file download and multipart `sendVoice` primitives for future Sarvam STT/TTS wiring. Verified with `npm test -- src/telegram/bot-api.test.ts` and `npm run typecheck`.
- 2026-05-01: Completed M5 foundation slice for structured OpenAI specialist agents, Sarvam speech adapters, and Telegram voice primitives. Verified with `npm test` (10 files / 40 tests), `npm run typecheck`, `npm run build`, and `git diff --check`. Remaining M5 work is wiring these primitives into the Telegram message workflow and persisting `voice_assets`/`agent_runs` records.

## Commit / Push History

- 2026-05-01: Agent created and pushed a docs-only update on `main` covering the milestone Git workflow in `AGENTS.md`, `docs/new-session-prompt.md`, and this tracker.
- 2026-05-01: Agent created and pushed a docs-only M0 completion update on `main` covering completed Swiggy Instamart per-tool contract gates in `docs/swiggy-instamart-tool-contracts.md` and this tracker.
- 2026-05-01: Agent created and pushed M1 scaffold update on `main` covering TypeScript backend scaffold, env validation, Supabase migrations, initial contract-test scaffold, and this tracker.
- 2026-05-01: Agent created and pushed M2 Telegram onboarding update on `main` covering webhook intake, Telegram setup/language cards, role callbacks, cook language persistence, and this tracker.
- 2026-05-01: Agent created and pushed M3 fake Swiggy OAuth update on `main` covering PKCE routes, owner-only connection start, encrypted fake token storage, Telegram owner connect links, and this tracker.
- 2026-05-01: Agent created and pushed docs verification update on `main` covering stricter per-task live-doc review rules in `AGENTS.md` and M0-M3 live Swiggy verification in this tracker.
- 2026-05-01: Agent created and pushed M4 local Instamart MCP stub update on `main` covering 13 contract-tested local tools, `/mcp/instamart` JSON-RPC route wiring, checkout safety gates, and this tracker.
- 2026-05-01: Agent created and pushed M5 foundation commit `eabb466` on `main` covering OpenAI structured specialist-agent wrappers, Sarvam STT/TTS provider adapters, Telegram voice primitives, and this tracker.
- 2026-05-01: Agent created and pushed a docs-only tracker follow-up on `main` recording the M5 foundation push state.

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

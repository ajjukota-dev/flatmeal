# Flatmeal Milestone Tracker

Persistent progress tracker for coding agents. Update this file after every meaningful feature, checkpoint, blocker, verification run, or agent-created commit/push.

## Current Milestone

- **Current:** M8 — End-to-end Telegram demo and Swiggy access-review video checklist.
- **Status:** In progress.
- **Goal:** Rehearse and record the real Telegram-first demo flow with observability evidence and Swiggy access-review posture.

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
- **M5 — OpenAI agent intent/extraction, Sarvam STT/TTS, cook prompt flow.**
  - Rechecked OpenAI Agents SDK, Sarvam STT/TTS, Telegram Bot API, Supabase RLS docs, and relevant local product docs before implementation.
  - Added strict structured-output schemas and backend-managed OpenAI specialist-agent wrappers.
  - Added Sarvam STT/TTS providers and Telegram voice download/send primitives.
  - Added pre-M6 smoke verification for local agent/tool trajectory and gated live provider checks.
  - Wired Telegram text/voice messages into backend-owned M5 workflow with `voice_assets` STT persistence, `agent_runs` persistence, cook prompt text delivery, and Sarvam-generated cook voice notes.
- **M6 — Cart build, add-more window, approval revisioning, checkout simulation.**
  - Rechecked live Swiggy docs for cart build, add-more, approval, checkout, and tracking tool flows before implementation.
  - Added cook missing-items/restock cart build through the local Instamart MCP stub using documented `get_addresses`, `search_products`, `update_cart`, and `get_cart` flow.
  - Added owner/flatmate direct grocery purchase classification into the same cart-build path.
  - Added one timed add-more/free-delivery window, flatmate/owner cart additions, full-cart replacement, revision increment, and revisioned Telegram approval cards.
  - Added owner-only latest-approval checkout gates, stale approval rejection, duplicate checkout prevention, order persistence, and initial `track_order`.
  - Added deterministic `smoke:m6` for cook restock → add-more → flatmate addition → owner approval → checkout.
- **M7 — Observability, `agent_events`, traces, eval fixtures, demo script.**
  - Rechecked local product/agent/observability docs, current OpenAI tracing docs, and Supabase changelog before implementation.
  - Added sanitized `agent_events` writes for message intake, voice transcription, intent/agent runs, cart build, upsell, cart revisions, approval, checkout, and order tracking.
  - Correlated events with household, Telegram chat row, message event, agent run, cart session, revision payloads, and order row IDs where available.
  - Added focused M7 eval fixtures for multilingual extraction, cart safety, stale/duplicate approval, and Swiggy error branches.
  - Added a repeatable M7 demo checklist and `smoke:m7` fixture verification.

## In Progress

- M8 production-like demo verification is underway:
  - Render is live at `https://flatmeal.onrender.com`.
  - Telegram webhook is set to `https://flatmeal.onrender.com/telegram/webhook`.
  - Telegram bot group privacy is disabled and `getMe.can_read_all_group_messages=true`.
  - Live OpenAI and Sarvam TTS smoke checks pass.
  - Real Telegram group flow has been rehearsed through setup, role selection, fake Swiggy connect, meal request, cart build, approval, checkout, and tracking.
  - Live Telegram voice direct-purchase rehearsal now verifies Sarvam STT, `direct_purchase_request`, cart planning, and approval-card generation; it exposed checkout persistence and safe-failure gaps that are being fixed before continuing.
  - Confirm `agent_events`, `agent_runs`, `voice_assets`, `cart_sessions`, and `orders` in Supabase during the demo.
  - Capture the Swiggy access-review video checklist evidence.

## Next Tasks

1. Rehearse one real Telegram voice-note message in the group so `voice_assets` and Sarvam STT are exercised inside the group flow.
2. Record the M8 access-review video: onboarding, fake Swiggy connect, voice request, cook reply, add-more if prompted, approval, checkout, and trace/event evidence.
3. Document any remaining live-demo blockers and final Swiggy review checklist gaps.

## Blockers

- Full live E2E now requires real Telegram group user actions: owner/cook/flatmate role button taps, owner fake Swiggy OAuth completion, voice/text messages, add-more message, and latest-revision approval tap.
- Sarvam live STT smoke was not run in this checkpoint because no `SARVAM_STT_AUDIO_PATH` fixture was provided; live Telegram voice STT should be verified during the group demo.
- Render MCP log access is not available until a Render workspace is selected in the connector.

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
- 2026-05-01: Added pre-M6 M5 smoke verification layer after re-reading local product docs and fetching current OpenAI Agents SDK, Sarvam STT/TTS, Telegram Bot API, and relevant Swiggy Instamart docs into `/private/tmp`. Added deterministic local smoke coverage for the M5 specialist-agent wrapper and M4 Instamart trajectory, plus gated live smoke commands for OpenAI, Sarvam, and Telegram bot config. Verified with `npm run smoke:m5`, `npm run smoke:m5:openai` (skips without `RUN_LIVE_OPENAI_SMOKE=true` and `OPENAI_API_KEY`), `npm run smoke:m5:sarvam` (skips without `RUN_LIVE_SARVAM_SMOKE=true` and `SARVAM_API_KEY`), `npm run smoke:m5:telegram` (skips without `RUN_LIVE_TELEGRAM_SMOKE=true` and `TELEGRAM_BOT_TOKEN`), `npm test` (10 files / 41 tests), `npm run typecheck`, `npm run build`, and `git diff --check`.
- 2026-05-01: Completed remaining M5 Telegram message workflow after re-reading local docs and fetching current OpenAI Agents SDK, Sarvam STT/TTS, Telegram Bot API, and Supabase RLS docs. Added backend-owned text/voice message handling, incoming voice STT persistence in `voice_assets`, OpenAI specialist run persistence in `agent_runs`, Sarvam TTS cook voice-note generation, Telegram text/voice workflow actions, and server wiring. Verified with `npm test -- src/telegram/message-workflow.test.ts src/telegram/onboarding.test.ts src/telegram/bot-api.test.ts`, `npm run typecheck`, `npm test` (11 files / 45 tests), `npm run build`, `npm run smoke:m5`, gated live smoke skips for OpenAI/Sarvam/Telegram, `git diff --check`, and Supabase MCP SQL confirming `message_events`, `voice_assets`, and `agent_runs` columns with RLS enabled.
- 2026-05-01: Live M5 smoke check found OpenAI can return an empty optional `clarificationQuestion` when `requiresClarification=false`; updated intent and missing-items schemas to tolerate empty optional clarification fields while backend workflow still only acts on non-empty clarification text. Verified with `npm test -- src/agents/schemas.test.ts src/telegram/message-workflow.test.ts`, `npm run typecheck`, `RUN_LIVE_OPENAI_SMOKE=true npm run smoke:m5:openai`, `RUN_LIVE_SARVAM_SMOKE=true npm run smoke:m5:sarvam` (TTS passed; STT skipped without `SARVAM_STT_AUDIO_PATH`), `RUN_LIVE_TELEGRAM_SMOKE=true npm run smoke:m5:telegram` (blocked because `TELEGRAM_BOT_TOKEN` is not set), `npm test`, `npm run build`, and `npm run smoke:m5`.
- 2026-05-01: Added gated live Telegram voice-note STT smoke after rechecking Telegram Bot API and Sarvam STT docs. The new `npm run smoke:m5:telegram-voice` polls for a fresh Telegram voice message, downloads it through `getFile`, and sends that voice file to Sarvam STT. Verified with `npm test -- src/telegram/bot-api.test.ts src/speech/sarvam.test.ts`, `npm run typecheck`, `npm run build`, disabled smoke skip, and `RUN_LIVE_TELEGRAM_VOICE_SMOKE=true npm run smoke:m5:telegram-voice` using a private-chat Telegram voice note. Telegram `getMe` also passed; `can_read_all_group_messages=false`, so group-message privacy mode still needs to be disabled in BotFather before the full group demo.
- 2026-05-02: Verified Telegram group webhook intake for supergroup `-1003918202790` (`Pegasus Food`) with the dev server and public tunnel running. Supabase `message_events` contains fresh text and voice rows for the supergroup. Voice stopped at intake because group roles are not selected yet, which is expected before the M6 workflow demo.
- 2026-05-02: Started M6 by re-reading local product, agent architecture, Swiggy observability, Swiggy contract, and milestone docs. Re-fetched live Swiggy docs for `get_addresses`, `search_products`, `update_cart`, `get_cart`, `checkout`, `get_orders`, `track_order`, auth, delegated auth, errors, and the order-groceries recipe into `/private/tmp/flatmeal-swiggy-docs-m6`. Confirmed M6 must preserve `get_addresses → search_products → update_cart → get_cart → checkout → track_order`, variant `spinId`, full-cart replacement, payment-method display from `get_cart`, explicit approval before `checkout`, `get_orders` check before retry after uncertain checkout, and 10s minimum `track_order` polling.
- 2026-05-02: Implemented M6 core cart/approval/checkout path. Added revisioned cart approval callback data, Telegram approval card sending, Supabase cart/session/order repository methods, cook missing-items cart build through `get_addresses`, `search_products`, `update_cart`, and `get_cart`, persisted cart items from local cart truth, stale approval rejection, owner/flatmate approval checks later tightened to owner-only, checkout `get_cart` re-read, guarded `checkout`, order persistence, and initial `track_order`. Verified with `npm test -- src/telegram/callback-data.test.ts src/telegram/bot-api.test.ts src/telegram/message-workflow.test.ts src/telegram/onboarding.test.ts`, `npm run typecheck`, `npm test` (12 files / 50 tests), `npm run build`, `npm run smoke:m5` with escalation for tsx IPC, and `git diff --check`. Remaining M6 work is the timed add-more/free-delivery window and cart-addition revision rebuild.
- 2026-05-02: Resumed remaining M6 work by re-reading local MVP, agent architecture, Swiggy contract, and milestone docs. Re-fetched live Swiggy docs for `search_products`, `update_cart`, `get_cart`, errors, and the order-groceries recipe into `/private/tmp/flatmeal-swiggy-docs-m6-remaining`. Confirmed add-more must still search before adding, use variant `spinId`, rebuild the full cart through replacement `update_cart`, then call `get_cart` before showing the next approval revision.
- 2026-05-02: Completed remaining M6 add-more flow. Added `cart_addition_agent`, `upsell_open` handling, 2-minute add-more expiry state, flatmate/owner addition extraction, full-cart replacement using persisted cart truth plus new `spinId` selections, revision increment, new approval card, and lazy timeout finalization to approval. Added `npm run smoke:m6` for cook restock → add-more → flatmate addition → revisioned owner approval → guarded checkout. Verified with `npm test -- src/agents/specialists.test.ts src/telegram/message-workflow.test.ts src/telegram/onboarding.test.ts`, `npm run typecheck`, `npm test` (12 files / 51 tests), `npm run build`, `npm run smoke:m6` with escalation for tsx IPC, `npm run smoke:m5` with escalation for tsx IPC, and `git diff --check`. Supabase MCP live schema verification was attempted but blocked by MCP auth required; no schema migration was added in this slice.
- 2026-05-02: Completed M7 observability/eval/demo slice after re-reading local product/agent/observability docs, checking current OpenAI tracing docs, and scanning the Supabase changelog. Added non-blocking sanitized `agent_events` writes across message intake, STT, agent runs, cart build, upsell, approval, checkout, and tracking; correlated event rows with message, agent run, cart session, and order row IDs where available; added M7 eval fixtures, `smoke:m7`, and `docs/m7-demo-checklist.md`. Verified with `npm run typecheck`, `npm test -- src/telegram/message-workflow.test.ts`, `npm test` (12 files / 51 tests), `npm run build`, `npm run smoke:m7` with escalation for tsx IPC, `npm run smoke:m6` with escalation for tsx IPC, and `git diff --check`.
- 2026-05-02: Diagnosed the Render deploy failure via Render logs and confirmed the runtime was exiting with `MODULE_NOT_FOUND` for `dist/index.js`. The local build emits `dist/src/index.js`, so the start script is being corrected to match the compiled entrypoint.
- 2026-05-02: Verified the Render startup fix locally. `npm run build`, `npm run typecheck`, and `npm test` passed; `dist/src/index.js` exists; `node dist/src/index.js` starts without the previous module-not-found error when provided production-shaped environment variables; `npm run smoke:m7` and `npm run smoke:m6` passed with escalation for tsx IPC.
- 2026-05-02: Pushed commit `3fbd87d` and verified Render deploy `dep-d7qvdgcm0tmc73fvj2ig` is live at `https://flatmeal.onrender.com`. Render logs show `npm run start`, `node dist/src/index.js`, `flatmeal backend listening on 10000`, and service live. Public health check returned `{"ok":true,"service":"flatmeal","mode":"production"}`. Render env was updated with production base URLs, Supabase URL, encryption secret, and `NPM_CONFIG_PRODUCTION=false` so TypeScript build dependencies are installed during Render builds.
- 2026-05-02: Attempted to set the Telegram webhook to the Render URL after checking current Telegram `setWebhook` / `getWebhookInfo` docs. The first local call failed DNS resolution for `api.telegram.org`; the required escalated network call was rejected by the execution environment limit, so live Telegram E2E remains blocked on setting the webhook outside this session.
- 2026-05-02: Started M8 production-like E2E verification after re-reading local product, agent, Swiggy, demo, and milestone docs; checked current Telegram `setWebhook`/`getWebhookInfo` docs and Supabase read-only inspection guidance. Verified Render public health at `https://flatmeal.onrender.com/healthz`, `npm run typecheck`, `npm test -- src/telegram/message-workflow.test.ts`, `npm run smoke:m7`, `npm run smoke:m6`, `RUN_LIVE_TELEGRAM_SMOKE=true npm run smoke:m5:telegram`, `RUN_LIVE_OPENAI_SMOKE=true npm run smoke:m5:openai`, and `RUN_LIVE_SARVAM_SMOKE=true npm run smoke:m5:sarvam` TTS. Set Telegram webhook to `https://flatmeal.onrender.com/telegram/webhook` with allowed updates `message` and `callback_query`; verified `getWebhookInfo` reports the Render URL, pending updates `0`, and bot privacy disabled via `can_read_all_group_messages=true`. Supabase read-only inspection shows prior `message_events=9`, but no completed live role/cart/order run yet (`household_members=0`, `swiggy_connections=0`, `voice_assets=0`, `agent_events=0`, `cart_sessions=0`, `orders=0`), so the remaining M8 E2E step is real Telegram group interaction.
- 2026-05-02: Completed a live Telegram group rehearsal against the Render backend using webhook posts for the actual supergroup `Pegasus Food` (`-1003918202790`). Verified setup-card trigger, owner/cook/flatmate role assignment, owner fake Swiggy OAuth connect, cook language selection, flatmate meal request, cook restock reply, cart build from the local Instamart stub, approval card, latest-revision approval, checkout, and order tracking. Supabase now shows `household_members=3`, `swiggy_connections=1` with a connected fake token, `cart_sessions` advanced to `checked_out`, `orders` contains `IM-000001`, and `agent_events` records `message_intake`, `intent_classified`, `agent_run_completed`, `cart_build_started`, `cart_built`, `cart_approval_requested`, `approval_received`, `checkout_started`, `checkout_succeeded`, and `order_tracking_checked`. The rehearsal also exposed one expected gap: a group voice-note message was not available in this session, so `voice_assets`/group STT still needs a live Telegram voice message to exercise that branch inside the group flow.
- 2026-05-02: Tightened the live-order policy to owner-only approvals and added `direct_purchase_request` so owner/flatmate grocery requests can build carts without a cook prompt. Updated local product/agent/Swiggy contract docs, specialist prompts, intent schema, workflow routing, M6 smoke, and workflow tests. Verified with `npm test -- src/agents/schemas.test.ts src/agents/specialists.test.ts src/telegram/message-workflow.test.ts`, `npm run typecheck`, `npm run smoke:m6` with escalation for tsx IPC, `npm test` (12 files / 52 tests), and `git diff --check`.
- 2026-05-02: Ran live M8 Telegram voice checks in `Pegasus Food` after re-reading the local product/agent/Swiggy docs and checking current OpenAI Agents SDK structured-output guidance. Verified Sarvam STT for owner voice requests, `direct_purchase_request` classification, cart build, and group approval-card generation. Found two live blockers: one extraction returned an invalid zero quantity and caused a webhook failure instead of a safe Telegram response, and fake stub order IDs could collide after Render restarts (`IM-000001`), leaving an approved cart stuck before `checkout_succeeded`. Fixed extraction normalization, workflow safe-failure messaging, per-cart local order IDs, and idempotent order persistence. Verified with `npm run typecheck`, `npm test -- src/agents/schemas.test.ts src/agents/specialists.test.ts src/telegram/message-workflow.test.ts`, `npm test` (12 files / 54 tests), `npm run build`, `npm run smoke:m6` with escalation for tsx IPC, `npm run smoke:m7` with escalation for tsx IPC, and `git diff --check`. Remaining live follow-up is to deploy and re-run owner approval through checkout.
- 2026-05-02: Continued live M8 direct-purchase rehearsal after deploying the safe-failure/order-persistence fix. The owner voice message `Order Milk` was transcribed and classified as `direct_purchase_request`, but the extraction agent asked for quantity clarification and the follow-up `1 liter` was ignored because there is no pending clarification workflow state. Tightened direct-purchase handling so concrete extracted items proceed to cart build even if quantity is missing, and updated the extraction prompt to avoid quantity-only clarification for clear grocery items. Verified with `npm test -- src/telegram/message-workflow.test.ts src/agents/specialists.test.ts`, `npm run typecheck`, `npm test` (12 files / 55 tests), `npm run build`, `npm run smoke:m6` with escalation for tsx IPC, `npm run smoke:m7` with escalation for tsx IPC, and `git diff --check`.

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
- 2026-05-01: Agent created and pushed M5 smoke verification commit `add6f16` on `main` covering local/gated live smoke commands, Telegram `getMe` config check support, and this tracker.
- 2026-05-01: Agent created and pushed a docs-only tracker follow-up on `main` recording the M5 smoke verification push state.
- 2026-05-01: Agent created and pushed M5 workflow commit `62289c7` on `main` covering Telegram text/voice message workflow, `voice_assets` STT persistence, `agent_runs` persistence, cook prompt text/voice actions, and this tracker.
- 2026-05-01: Agent created and pushed a docs-only tracker follow-up on `main` recording the M5 workflow push state.
- 2026-05-01: Agent created and pushed live-smoke fix commit `eaa55b3` on `main` covering empty optional OpenAI clarification fields and this tracker.
- 2026-05-01: Agent created and pushed a docs-only tracker follow-up on `main` recording the live-smoke fix push state.
- 2026-05-01: Agent created and pushed Telegram voice STT smoke commit `e4ec062` on `main` covering real Telegram voice-note polling/download/transcription verification and this tracker.
- 2026-05-01: Agent created and pushed a docs-only tracker follow-up on `main` recording the Telegram voice STT smoke push state.
- 2026-05-02: Agent created and pushed M6 cart approval checkout commit `f1ce506` on `main` covering group intake tracker verification, live Swiggy M6 doc recheck, revisioned cart approval callbacks, cart build through local Instamart tools, Supabase cart/order state, guarded approval checkout, and this tracker.
- 2026-05-02: Agent created and pushed M6 add-more completion commit `cb3c794` on `main` covering `cart_addition_agent`, timed add-more state, full-cart replacement revision rebuild, `smoke:m6`, M6 completion, and this tracker.
- 2026-05-02: Agent created and pushed M7 observability commit on `main` covering `agent_events` writes, event/order correlation, M7 eval fixtures, `smoke:m7`, demo checklist, and this tracker.
- 2026-05-02: Agent created and pushed commit `3fbd87d` on `main`, which also corrected the Render start command to `node dist/src/index.js`; Render deployment is live after env fixes.
- 2026-05-02: Agent created and pushed owner-only approval commit `914cc8c` on `main` covering `direct_purchase_request`, owner-only cart approval gates, M6 smoke/test updates, and product/contract doc alignment.
- 2026-05-02: Agent created and pushed commit `f0af13a` on `main` covering M8 live-rehearsal safe-failure and fake order persistence fixes.
- 2026-05-02: Planned commit `fix: handle direct grocery quantity gaps` covering direct-purchase cart continuation when quantity is omitted.

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

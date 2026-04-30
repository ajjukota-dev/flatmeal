# Swiggy MCP Contract + Agent Observability Plan

## Goal

Flatmeal MVP v1 is Telegram-first, but Swiggy compatibility remains non-negotiable.

The local Swiggy Instamart MCP stub must match Swiggy's documented tool contracts closely enough that real Swiggy access can be integrated later without rewriting Telegram flows, backend workflow, cart state, or checkout approval rules.

The local stub is not a loose mock. It is a contract-faithful simulator for Swiggy Instamart MCP.

The MVP also includes a fake local Swiggy OAuth 2.0 PKCE flow so the Telegram bot can behave as if a household owner connected a real Swiggy account before real access is granted.

The production-ready MVP uses Supabase Postgres for durable state, OpenAI Agents SDK tracing for agent/tool visibility, and sanitized `agent_events` for product-level debugging. SQLite is optional fallback only, not the canonical architecture.

## Required Swiggy Documentation Review

Before implementing the local Instamart MCP stub, the coding agent must read the Instamart overview and every individual Instamart tool page under:

- https://mcp.swiggy.com/builders/docs/reference/instamart/
- https://mcp.swiggy.com/builders/llms.txt
- https://mcp.swiggy.com/builders/llms-full.txt when broad context is needed
- Per-page Markdown by appending `.md` to Swiggy docs URLs when implementing a specific tool

The coding agent must not rely only on the overview page.

Every tool contract must be extracted into `docs/swiggy-instamart-tool-contracts.md` before implementation. Do not paste full Swiggy docs into the repo; capture the important local contract facts only. For each tool, capture:

- exact tool name
- stage
- endpoint
- mutating/non-mutating behavior
- exact argument names
- required fields
- optional fields
- response envelope
- tool-specific `data` shape
- failure envelope
- agent guidance
- workflow rules
- error behavior
- local stub behavior
- required tests

## Contract Extraction Gate

No Swiggy tool implementation may start until its local contract section is complete in `docs/swiggy-instamart-tool-contracts.md`.

Required sequence for each tool:

```text
1. Fetch the exact live Swiggy tool page
2. Extract arguments, response envelope, data expectations, and exact agent guidance
3. Update docs/swiggy-instamart-tool-contracts.md
4. Write/adjust contract tests from the local contract
5. Implement or modify the stub/client behavior
```

Rules:

- Do not rely only on the Instamart overview page.
- Do not infer missing fields from examples or adjacent tools.
- If the docs do not specify a tool-specific `data` shape, write `not specified by docs`.
- Preserve Swiggy’s workflow guidance exactly in meaning, especially STOP/confirm/select-before-next-tool rules.
- Contract tests must cover workflow rules, not only argument validation.

## Instamart Tool Pages To Mirror

Swiggy's Instamart overview currently lists 13 tools across Discover, Cart, Order, Track, and Support. The local stub must support all of them for onboarding/readiness, even if MVP cart flow only uses a subset.

Discover:

- `create_address`: https://mcp.swiggy.com/builders/docs/reference/instamart/create_address/
- `delete_address`: https://mcp.swiggy.com/builders/docs/reference/instamart/delete_address/
- `get_addresses`: https://mcp.swiggy.com/builders/docs/reference/instamart/get_addresses/
- `search_products`: https://mcp.swiggy.com/builders/docs/reference/instamart/search_products/
- `your_go_to_items`: https://mcp.swiggy.com/builders/docs/reference/instamart/your_go_to_items/

Cart:

- `clear_cart`: https://mcp.swiggy.com/builders/docs/reference/instamart/clear_cart/
- `get_cart`: https://mcp.swiggy.com/builders/docs/reference/instamart/get_cart/
- `update_cart`: https://mcp.swiggy.com/builders/docs/reference/instamart/update_cart/

Order:

- `checkout`: https://mcp.swiggy.com/builders/docs/reference/instamart/checkout/

Track:

- `get_order_details`: https://mcp.swiggy.com/builders/docs/reference/instamart/get_order_details/
- `get_orders`: https://mcp.swiggy.com/builders/docs/reference/instamart/get_orders/
- `track_order`: https://mcp.swiggy.com/builders/docs/reference/instamart/track_order/

Support:

- `report_error`: https://mcp.swiggy.com/builders/docs/reference/instamart/report_error/

## Swiggy Integration Shape

Swiggy does not expose normal REST endpoints like `/search-products` or `/checkout`.

Real Swiggy Instamart uses one MCP endpoint:

```text
POST https://mcp.swiggy.com/im
```

The backend calls named MCP tools through that server. The local MVP must follow the same shape: a local MCP-compatible server with named tools, not arbitrary fake REST routes.

Before implementing the local stub or real client, read and apply:

- Authentication: https://mcp.swiggy.com/builders/docs/start/authenticate/
- Errors: https://mcp.swiggy.com/builders/docs/reference/errors/
- Ship to production: https://mcp.swiggy.com/builders/docs/build/ship-to-production/
- Access and onboarding: https://mcp.swiggy.com/builders/docs/operate/access/
- Rate limits: https://mcp.swiggy.com/builders/docs/operate/rate-limits/
- Data and compliance: https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/

## Swiggy Account Connection Model

The bot does not own a Swiggy account.

One household owner connects their Swiggy account, and the household's Instamart cart/order flow uses that owner session.

This is **delegated user auth**: Flatmeal calls Swiggy MCP on behalf of the connected household owner account.

Real Swiggy OAuth browser page:

- asks the owner for phone + OTP inside Swiggy’s hosted authorization UI
- redirects back to Flatmeal with an authorization code after successful auth/consent
- keeps internal OTP endpoints outside the third-party OAuth contract

Flatmeal must never collect, ask for, store, log, or proxy a Swiggy OTP or Swiggy password.

The OAuth access token is the only credential Flatmeal stores, encrypted, and it is used by the backend/agent to call Swiggy MCP tools on behalf of the connected household owner.

Local MVP:

- Owner taps `Connect Swiggy` in Telegram.
- Bot sends a private fake auth link.
- Fake local OAuth authorize page mimics Swiggy OAuth 2.0 PKCE and simulates Swiggy-hosted phone + OTP / consent without collecting real Swiggy credentials.
- Backend validates OAuth `state`, exchanges fake `code`, and stores encrypted fake access token.
- Local MCP stub requires a valid fake token/session for cart/order tools.

Real Swiggy later:

- Keep the same backend routes and household connection state.
- Replace fake authorize/token endpoints with Swiggy OAuth endpoints.
- Use real token/session for `POST https://mcp.swiggy.com/im`.

If the token is missing, expired, or rejected, the Telegram bot must ask the owner to reconnect Swiggy before checkout.

Swiggy auth requirements to mirror:

- OAuth 2.1 with PKCE S256.
- `GET /auth/authorize` starts authorization.
- Swiggy-hosted authorization UI collects phone + OTP in the browser.
- Third-party clients must not call internal OTP endpoints or collect OTP/password themselves.
- `POST /auth/token` exchanges authorization code for token.
- Token represents delegated access for the authenticated Swiggy user.
- Authorization code is single-use and short-lived.
- Access token lifetime is 5 days.
- Refresh-token issuance is not wired in v1; `401` means re-run authorization.
- Production redirect URIs must be exact-match HTTPS; `localhost` is allowed only for local dev.
- Never log tokens or send them over non-HTTPS transports in real mode.

## Required Grocery Flow

The core grocery flow must preserve Swiggy's sequence:

```text
get_addresses
  → search_products
  → update_cart
  → get_cart
  → checkout
  → track_order
```

Rules:

- `get_addresses` returns saved user addresses.
- `search_products` requires an `addressId`.
- `search_products` returns products with variants.
- Product variants include `spinId`.
- `update_cart` must use variant-level `spinId`.
- `update_cart` replaces the full cart with the provided items.
- `get_cart` must be called before checkout.
- `checkout` is mutating and must require explicit Telegram approval.
- `track_order` returns order tracking state.

Production retry/idempotency rules:

- Pure reads like `get_addresses`, `get_orders`, `get_order_details`, and `track_order` are safe to retry.
- Cart mutations like `update_cart` and `clear_cart` are safe to retry with the same arguments.
- `checkout` is not safe to blind-retry.
- On checkout 5xx/network failure: wait 2–5 seconds, call `get_orders`, treat as success if order exists, otherwise retry once through the guarded path.
- Use exponential backoff with jitter for 5xx/upstream timeout/upstream error.
- Cap user-facing retry time around 30 seconds.
- Honor `Retry-After` if rate limiting appears later.

## Local Stub Requirements

The local Instamart MCP stub must:

- expose the same tool names as Swiggy
- accept the same argument names as Swiggy docs
- return Swiggy-style success/failure envelopes
- seed at least one saved `Home` address
- seed realistic grocery products for common meals and restock items
- include multiple variants for common products
- include variant-level `spinId`
- support cart replacement through `update_cart`
- return bill totals from `get_cart`
- return available payment methods from `get_cart`
- block `checkout` unless the backend has stored latest Telegram approval
- return fake but realistic order IDs
- support order tracking after checkout

Failure envelope:

```json
{
  "success": false,
  "error": {
    "message": "human-readable description",
    "reportLink": "https://...",
    "reportHint": "Run report_error to share diagnostics"
  }
}
```

Stub failure scenarios to support:

- product not found
- item out of stock
- address not serviceable
- minimum order not met
- cart expired
- checkout attempted before approval
- stale cart revision approval
- duplicate checkout attempt
- transient upstream failure simulation

Error handling contract:

- Failure envelope is primary: `success: false` with `error.message`.
- Auth failure: HTTP `401` or JSON-RPC `-32001` → reconnect/re-auth.
- Bad input: HTTP `400`, `Invalid ...`, or `Missing ...` → fix arguments, no retry.
- Upstream timeout/error: `504`, `502`, `503`, or timeout message → retry with backoff.
- Domain failure: HTTP 200 with `success: false` → surface to Telegram, no blind retry.
- Internal error: HTTP `500` or JSON-RPC `-32603` → retry once, then use/report `report_error`.

## Telegram-First Agent Design

Use OpenAI Agents SDK TypeScript for orchestration, structured outputs, tool calls, and tracing.

The backend still owns hard safety gates. The OpenAI agent can classify, extract, plan cart search terms, and call approved tools, but backend validation owns role checks, cart revision checks, Swiggy connection checks, approval gating, and checkout gating.

The backend owns:

- Telegram-native onboarding buttons.
- Telegram role lookup.
- Active workflow/session lookup.
- Fake/real Swiggy OAuth connection state.
- Prompt construction.
- OpenAI Agents SDK runs.
- Sarvam STT/TTS calls.
- Swiggy MCP tool calls.
- Cart revisioning.
- Approval gating.
- Checkout gating.

The OpenAI agent must not directly own checkout or mutate cart state without backend validation.

## Intent Tool Exposure Rules

Do not expose every MCP tool to every workflow phase.

Cart build phase:

- `get_addresses`
- `search_products`
- `update_cart`
- `get_cart`

Approval/checkout phase:

- `get_cart`
- `checkout`
- `track_order`

Support/debug phase:

- `report_error`
- `get_orders`
- `get_order_details`

Never expose or call `checkout` before explicit Telegram approval is stored for the latest cart revision.

## Structured Outputs

OpenAI agent runs must return validated structured JSON at each major step.

```ts
type ParsedMessageIntent =
  | "flatmate_meal_request"
  | "cook_meal_missing_items"
  | "cook_restock_request"
  | "cook_question_to_flatmates"
  | "flatmate_cart_addition"
  | "cart_approval_context_message"
  | "ignore";

type MealRequest = {
  dish: string;
  servings?: number;
  mealTime?: string;
  spiceLevel?: "less" | "medium" | "spicy";
  notes?: string[];
};

type CookPrompt = {
  text: string;
  language: "hi" | "en" | "hinglish" | "ta" | "te";
  voiceRequired: true;
  targetTelegramUserId: string;
};

type MissingItem = {
  name: string;
  quantity?: number;
  unit?: string;
  confidence: number;
};

type CartBuildPlan = {
  addressId: string;
  items: Array<{
    requestedName: string;
    searchQuery: string;
    selectedSpinId: string;
    quantity: number;
  }>;
};
```

Invalid structured output must fail safely and create a `run_failed` event.

## Supabase State Model

Use Supabase Postgres as the canonical production-ready state layer:

- `households`: household status, defaults, and operational mode.
- `telegram_chats`: Telegram group chat ID, title, and household mapping.
- `telegram_users`: Telegram user ID and display metadata.
- `household_members`: owner/cook/flatmate role mapping.
- `cook_profiles`: cook language and TTS preferences.
- `swiggy_connections`: fake/real OAuth connection, encrypted token, expiry, and mode.
- `oauth_sessions`: PKCE state, code-verifier hash, callback state, and expiry.
- `message_events`: idempotency records for Telegram updates.
- `voice_assets`: Telegram file IDs, audio locations, STT status, and transcript metadata.
- `agent_runs`: OpenAI run metadata, intent, status, and trace IDs.
- `cart_sessions`: active cart state, revision, approval status, and timeout state.
- `cart_items`: requested grocery, selected product/variant, `spinId`, and quantity.
- `orders`: checkout result, Swiggy/local order ID, status, and tracking state.
- `agent_events`: sanitized product timeline and debugging events.

Supabase implementation rules:

- Keep all schema changes in migrations.
- Use Supabase MCP for schema inspection, SQL verification, migration planning, and advisors when connected.
- Enable RLS on exposed tables by default.
- Keep service-role access backend-only.
- Encrypt fake/real Swiggy tokens before storage.
- Minimize PII and avoid phone-number onboarding.
- Do not persist full Swiggy request/response bodies unless needed for the current session.
- Add retention/deletion paths for transcripts, voice files, and Swiggy-derived data.
- SQLite is optional offline fallback only; it is not the canonical production-ready path.

## Swiggy Access Review Readiness

The implementation should be ready to show Swiggy a real, respectful, technically credible flow:

- Concrete use case: shared-flat Telegram group coordinates food and groceries with a cook.
- Real-user surface: Telegram group with owner/cook/flatmate roles, not a sandbox-only script.
- Demo video: bot added to group, fake Swiggy connected, voice flow transcribed, cart built, latest revision approved, checkout simulated.
- Consumer respect: no surprise orders; cart items, quantities, bill total, and checkout action are visible before approval.
- OAuth readiness: PKCE state/verifier validation, exact-match redirect URIs, HTTPS in production, token expiry/reconnect path.
- Error readiness: explicit branches for 401, planned 429, 400 bad input, domain failures, 5xx/upstream failures, and checkout check-then-retry.
- Traffic readiness: estimate `1-3 orders/day/household`, `8-20 Instamart tool calls/order`, low human-triggered peak QPS; cache addresses and avoid tracking polls faster than 10 seconds.
- Security baseline: encrypted tokens, minimal PII, no plaintext full Swiggy responses in logs, hashed identifiers where possible, and deletion path for user/household data.

## Observability Strategy

Use two observability layers:

1. OpenAI Agents SDK tracing for agent runs, model calls, structured outputs, tool calls, and custom spans.
2. Backend `agent_events` table for Telegram-visible/admin-visible timeline and operational debugging.

The Telegram group should not read trace data directly. It should receive sanitized bot messages generated from backend state and `agent_events`.

Swiggy production observability requirements:

- Log Swiggy MCP `session_id` on every tool call.
- Log tool name, duration, status, HTTP/JSON-RPC status, and sanitized household/user hash.
- Track tool-call latency p50/p95/p99.
- Track tool success rate.
- Track 4xx and 5xx rates.
- Track OAuth reconnect frequency.
- Add OpenTelemetry/custom spans around every MCP `callTool`.
- Alert on `_meta.swiggy.deprecation` when present.

## Trace Requirements

Wrap each workflow in a named trace:

```text
flatmeal.telegram_order_flow
```

Attach safe metadata only:

- `householdId`
- `telegramChatId`
- `telegramUpdateId`
- `messageEventId`
- `agentRunId`
- `cartSessionId`
- `cartRevision`
- `instamartMode`
- `providerMode`

Do not attach:

- Telegram bot token
- Swiggy OAuth tokens
- full phone numbers
- full addresses
- payment details
- raw sensitive transcripts

Add spans for:

- Telegram bot added/setup card.
- Role button callback.
- Cook language selection callback.
- Fake/real Swiggy OAuth start/callback/token exchange.
- Telegram webhook received.
- Telegram voice file download.
- Sarvam STT call.
- OpenAI intent classification.
- OpenAI missing-item extraction.
- Sarvam/Google TTS generation.
- Telegram sendMessage/sendVoice/sendPhoto/editMessageReplyMarkup calls.
- Each Instamart MCP tool call.
- Free-delivery/add-more window.
- Cart approval callback.
- Checkout attempt.

## Agent Events Requirements

Store sanitized timeline events in `agent_events`.

Useful event types:

- `telegram_message_received`
- `telegram_group_linked`
- `role_selected`
- `cook_language_selected`
- `swiggy_connect_started`
- `swiggy_connect_completed`
- `swiggy_reconnect_required`
- `voice_downloaded`
- `stt_started`
- `stt_completed`
- `intent_extracted`
- `cook_prompt_created`
- `tts_started`
- `tts_completed`
- `cook_prompt_sent`
- `missing_items_extracted`
- `mcp_get_addresses_called`
- `mcp_search_products_called`
- `mcp_update_cart_called`
- `mcp_get_cart_called`
- `upsell_window_opened`
- `cart_ready_for_approval`
- `cart_approved`
- `stale_approval_rejected`
- `mcp_checkout_called`
- `order_created`
- `track_order_called`
- `run_failed`

Each event should include:

- `householdId`
- `telegramChatId`
- `messageEventId`
- `agentRunId`
- timestamp
- status
- user-safe message
- sanitized payload summary
- provider/tool name if relevant
- retryability if failed

## Correlation IDs

Backend logs should include:

- `householdId`
- `telegramChatId`
- `telegramUpdateId`
- `messageEventId`
- `agentRunId`
- `traceId`
- `cartSessionId`
- `cartRevision`
- `mcpSessionId`
- `swiggyConnectionId`

These IDs should allow debugging a full run across Telegram, backend, OpenAI, Sarvam, TTS, and MCP calls.

## Test Plan

Contract tests:

- every local Instamart tool accepts documented arguments
- every local Instamart tool returns documented success/failure envelopes
- local tool names match Swiggy names exactly
- local cart update uses variant `spinId`
- local `update_cart` replaces the cart
- local `checkout` is blocked before latest Telegram approval

Flow tests:

- Telegram-native onboarding creates household when bot is added to group
- setup card buttons assign owner, cook, and flatmate roles
- cook language selection is stored
- fake Swiggy OAuth PKCE start/callback/token storage works
- missing/expired token asks owner to reconnect Swiggy
- `get_addresses → search_products → update_cart → get_cart → checkout → track_order`
- checkout fails before approval
- checkout succeeds after latest approval
- stale approval button is rejected
- duplicate checkout does not create duplicate successful orders
- product not found creates a user-visible failure
- out-of-stock creates a user-visible failure
- cart expired creates a user-visible failure

Observability tests:

- OpenAI trace is created for each Telegram order flow
- agent events are stored for every major step
- failure events include safe recovery information
- sensitive values are not stored in events or logs
- Supabase migrations apply cleanly and RLS is enabled on exposed tables
- Swiggy access-readiness branches exist for 401, planned 429, 5xx, checkout check-then-retry, and domain failures

Evaluation tests:

- intent classification fixtures across flatmate/cook/restock/question/add-more/ignore
- multilingual extraction fixtures for Hindi, Hinglish, Tamil, and Telugu cook messages
- checkout-safety eval proving the agent cannot place/simulate an order before latest approval
- tool-trajectory eval proving the cart flow uses the allowed MCP tools in the correct phase
- trace/evidence eval proving each run has a trace ID and sanitized `agent_events`

## Acceptance Criteria

- The local Instamart MCP stub is built from individual Swiggy tool docs, not guessed from the overview.
- Tool names, arguments, response envelopes, and cart semantics match Swiggy docs.
- Swiggy authentication, error handling, and production retry rules are represented in the local fake OAuth/client/stub path.
- Telegram-first flow uses OpenAI Agents SDK for structured classification/extraction/tool orchestration.
- Telegram-native onboarding uses inline buttons, not website forms or slash commands.
- Fake local Swiggy OAuth mirrors real PKCE enough to swap to real Swiggy later.
- MCP tools are called only by the backend workflow phase that needs them.
- `checkout` is impossible before latest Telegram approval.
- Provider-agnostic tracing is enabled for internal debugging.
- `agent_events` powers Telegram/admin-visible timeline.
- Supabase/Postgres stores durable production-shaped state with RLS/security expectations captured.
- The demo can produce a Swiggy access-review video and QPS/security/OAuth readiness notes.
- Replacing local MCP with real Swiggy MCP requires only credentials, OAuth setup, endpoint/client config, and production error handling.

## Required API Keys And Config

- Telegram bot token from BotFather.
- Telegram privacy mode disabled for group-message access.
- Public HTTPS webhook URL for local dev via ngrok/cloudflared and production deployment URL later.
- OpenAI API key for OpenAI Agents SDK.
- Sarvam API key for STT/TTS.
- Google TTS credentials only if Sarvam TTS is not enough.
- Supabase project URL.
- Supabase anon/publishable key if needed server-side.
- Supabase service-role key for backend-only use.
- Supabase database URL for migrations.
- Encryption secret for fake/real Swiggy token storage.
- Fake Swiggy OAuth base URL and callback URL.
- Local Instamart MCP stub URL.
- Later real Swiggy `client_id`, approved redirect URI, scopes, and Instamart server allowlist.

## Source References

- Swiggy Instamart overview/tools list: https://mcp.swiggy.com/builders/docs/reference/instamart/
- Swiggy docs index: https://mcp.swiggy.com/builders/llms.txt
- Swiggy full docs context: https://mcp.swiggy.com/builders/llms-full.txt
- Swiggy create address example: https://mcp.swiggy.com/builders/docs/reference/instamart/create_address/
- Swiggy grocery ordering flow: https://mcp.swiggy.com/builders/docs/build/recipes/order-groceries/
- Swiggy authentication: https://mcp.swiggy.com/builders/docs/start/authenticate/
- Swiggy delegated auth: https://mcp.swiggy.com/builders/docs/start/enterprise/delegated-auth/
- Swiggy errors: https://mcp.swiggy.com/builders/docs/reference/errors/
- Swiggy ship to production: https://mcp.swiggy.com/builders/docs/build/ship-to-production/
- Swiggy access and onboarding: https://mcp.swiggy.com/builders/docs/operate/access/
- Swiggy rate limits: https://mcp.swiggy.com/builders/docs/operate/rate-limits/
- Swiggy data and compliance: https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/
- Telegram Bot API: https://core.telegram.org/bots/api

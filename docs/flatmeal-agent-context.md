# Flatmeal Coding Agent Context

## Product Goal

Flatmeal removes the daily food-coordination burden from shared flats by turning Telegram group voice/text messages into grocery carts and approved orders.

The MVP v1 surface is the household Telegram group:

1. Flatmates or cooks send voice/text messages in the group.
2. The bot transcribes voice notes with Sarvam STT.
3. OpenAI agent classifies the message intent and extracts structured data.
4. The bot asks the cook in text + generated voice when the request came from a flatmate.
5. The cook replies with what needs to be ordered or what is missing.
6. The backend builds a Swiggy Instamart cart through a local MCP-compatible stub.
7. The bot sends a cart preview with an approval button.
8. Checkout happens only after a flatmate/owner approves the latest cart revision.

This is a working Telegram-first MVP, not a mobile app prototype.

## MVP v1 Scope

Included:

- Telegram group bot.
- Telegram text and voice-note ingestion.
- Telegram inline approval buttons.
- Sarvam STT for incoming voice notes.
- Sarvam TTS for bot-generated cook prompts, with Google TTS as fallback only if needed.
- OpenAI Agents SDK TypeScript for intent classification, extraction, orchestration, tools, and tracing.
- Local Swiggy Instamart MCP-compatible stub.
- Supabase Postgres database with production-shaped schema/security.
- `agent_events` timeline and provider/tool traces.

Excluded from MVP v1:

- Razorpay.
- Pricing/subscription enforcement.
- Paid onboarding.
- React Native app.
- Bolna outbound calls.
- Production Swiggy checkout before access is granted.

## Core Stack

- **Backend:** Node.js, Express, TypeScript.
- **Bot:** Telegram Bot API via Telegraf or direct Bot API wrapper.
- **Database:** Supabase Postgres for the production-ready MVP; SQLite is optional fallback only.
- **Voice to text:** Sarvam STT.
- **Text to voice:** Sarvam TTS, fallback to Google TTS only if needed.
- **Agent/orchestration:** OpenAI Agents SDK TypeScript with structured outputs/tools.
- **Observability:** OpenAI Agents SDK tracing plus internal `agent_events`.
- **Commerce:** Local Swiggy Instamart MCP-compatible stub now; real Swiggy MCP later.
- **Deployment:** HTTPS backend/webhook and OAuth callback route; local dev uses ngrok/cloudflared.

## Production-Ready MVP Decisions

- This should look like a real product, not a sandbox toy: real Telegram group, real STT/TTS, real OpenAI agent runs, real persisted state, fake Swiggy OAuth, and contract-faithful local Instamart MCP.
- Use Supabase now so households, roles, cart sessions, approvals, OAuth sessions, and traces survive restarts and can be inspected during the demo.
- Enable RLS on exposed Supabase tables by default; backend-only service-role access must never reach any client.
- Keep PII minimal: Telegram IDs are required for roles, but phone numbers are not required; raw transcripts/addresses should be retained only when needed and sanitized in logs.
- Build for Swiggy access readiness: explicit cart confirmation, OAuth readiness, 401/429 branches, safe retries, QPS estimate, HTTPS redirect URIs, and a short working-flow video.

## Telegram Setup And Onboarding

- Owner adds the bot to the Telegram group.
- Bot creates the `household` automatically when added to a group.
- Bot stores `telegramChatId`, group title, and household mapping.
- Bot posts a setup card with inline buttons: `[I am owner] [I am cook] [I am flatmate]`.
- First user to tap `I am owner` becomes owner.
- Cook taps `I am cook`.
- Bot asks cook language with inline buttons: `[Hindi] [Hinglish] [Tamil] [Telugu] [English]`.
- Flatmates tap `I am flatmate`.
- New group members can be prompted with the same role buttons when they first join, speak, or tap the bot.
- Identity is Telegram `from.id`; usernames are display metadata only.
- Do not rely on phone numbers for Telegram identity mapping.
- No `/link`, `/join`, or `/language` commands are required in MVP v1.
- Bot privacy mode must be disabled for full group-message access.

## Case 1: Flatmate Meal Request

```text
Flatmate sends voice/text in group
  → Sarvam STT if voice
  → OpenAI agent classifies flatmate_meal_request
  → OpenAI agent extracts meal, servings, time, spice/notes
  → Bot tags cook with text
  → Bot sends generated voice note in cook language
  → Cook replies voice/text
  → Sarvam STT if voice
  → OpenAI agent extracts missing items
  → Backend builds Swiggy cart through local MCP stub
  → Optional free-delivery/add-more window
  → Bot sends cart preview + Approve button
  → Flatmate/owner approves latest cart revision
  → Checkout
  → Bot posts order confirmation in group
```

Example bot prompt to cook:

```text
Ramu bhai, kal 4 logon ke liye chicken biryani banani hai, less spicy.
Aap bata do ghar mein kya-kya missing hai jo order karna padega.
Agar quantity pata ho toh quantity bhi bata dena.
Sirf grocery items bolo jo mangwane hain.
```

## Case 2: Cook Reports Meal + Missing Items

```text
Cook sends voice/text in group
  → Sarvam STT if voice
  → OpenAI agent classifies cook_meal_missing_items
  → OpenAI agent extracts meal context + missing items
  → Skip cook ping
  → Build cart
  → Optional free-delivery/add-more window
  → Send cart preview + Approve button
  → Flatmate/owner approves
  → Checkout
  → Confirm order in group
```

## Case 3: Cook Restock Request

```text
Cook sends voice/text: "chawal khatam, dahi nahi hai"
  → Sarvam STT if voice
  → OpenAI agent classifies cook_restock_request
  → OpenAI agent extracts grocery items
  → Build cart
  → Optional free-delivery/add-more window
  → Send cart preview + Approve button
  → Flatmate/owner approves
  → Checkout
  → Confirm order in group
```

## Intent Classification

OpenAI agent must return exactly one intent for relevant messages:

- `flatmate_meal_request`: flatmate asks to cook/eat something.
- `cook_meal_missing_items`: cook reports meal plus required/missing items.
- `cook_restock_request`: cook asks only for grocery restock.
- `cook_question_to_flatmates`: cook asks what to cook or asks a clarification.
- `flatmate_cart_addition`: flatmate adds items during an active add-more window.
- `cart_approval_context_message`: user asks about cart/order state.
- `ignore`: unrelated group chat.

The backend must validate role and active workflow before acting. For example, `flatmate_cart_addition` only applies when the household has an active `upsell_open` cart session.

## Structured Outputs

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

type CartRevision = {
  cartSessionId: string;
  revision: number;
  items: MissingItem[];
  status: "building" | "upsell_open" | "approval_pending" | "approved" | "checked_out" | "expired";
};
```

Invalid structured output must stop the workflow and create a `run_failed` event.

## Free Delivery / Add-More Window

- After `get_cart`, backend checks bill breakdown and delivery-fee/free-delivery threshold.
- If a small amount can unlock free delivery, open one add-more window for 2 minutes.
- Bot message example: `₹20 more for free delivery — kuch aur chahiye? 2 min.`
- During the window, flatmate messages can be classified as `flatmate_cart_addition`.
- If an item is added, rebuild cart and increment cart revision.
- Send a new cart preview after timeout or successful addition.
- Previous approval buttons must be disabled through Telegram edit or rejected by stale revision.
- Cap to one upsell loop per cart session for MVP v1.

## Approval And Checkout Rules

- Checkout must never happen automatically.
- Only `flatmate` or `owner` roles can approve.
- Approval callback payload must include `cartSessionId` and `revision`.
- Backend must reject stale approval callbacks.
- Backend must reject approval if cart status is not `approval_pending`.
- Backend must call `get_cart` before checkout.
- Checkout is allowed only after explicit Telegram approval for the latest cart revision.
- Group confirmation should include order ID, item summary, total, and tracking status.

## Swiggy Account Connection

One Swiggy account is connected per household. The bot does not own a Swiggy account.

MVP rule:

- Household owner taps `Connect Swiggy` in Telegram.
- Bot sends a private auth link to the owner.
- This is **delegated user auth**: Flatmeal connects and calls Swiggy on behalf of the household owner’s Swiggy account.
- Real Swiggy OAuth asks the owner for phone + OTP only inside Swiggy’s browser-hosted authorization page.
- Flatmeal never collects, stores, logs, or proxies the owner’s Swiggy OTP or Swiggy password.
- The stored OAuth token authorizes the backend/agent to call Swiggy MCP tools on behalf of that household owner account.
- Local MVP uses fake Swiggy OAuth 2.0 PKCE to mimic Swiggy's real auth flow.
- Backend stores an encrypted fake token/session for the household.
- Local Instamart MCP stub accepts that fake token.
- All carts/orders in that Telegram group use the connected household owner's Swiggy session.
- If the connection is missing or expired, bot asks the owner to reconnect.

Local fake OAuth flow:

```text
Owner taps Connect Swiggy
  → bot sends private auth link
  → fake Swiggy authorize page opens
  → fake page simulates Swiggy-hosted phone + OTP / consent
  → owner clicks Authorize Flatmeal
  → callback returns fake code
  → backend exchanges fake code for fake token
  → token is stored encrypted for household
  → bot confirms Swiggy connected
```

Real Swiggy later:

- Replace fake authorize/token endpoints with Swiggy OAuth.
- Keep the same household connection state.
- Use real token/session when calling `POST https://mcp.swiggy.com/im`.

## Swiggy Integration Shape

Swiggy Instamart is an MCP server, not normal REST endpoints.

Real endpoint:

```text
POST https://mcp.swiggy.com/im
```

Before implementing the local Instamart stub or real Swiggy client, read `docs/swiggy-mcp-and-agent-observability-plan.md`.

Also read and maintain `docs/swiggy-instamart-tool-contracts.md`. The implementation should use that file as the local extracted contract after verifying live Swiggy docs. Do not paste whole Swiggy docs into the repo; keep the local file as a concise contract summary.

Implementation must also read and follow:

- Swiggy docs index: https://mcp.swiggy.com/builders/llms.txt
- Swiggy full docs context: https://mcp.swiggy.com/builders/llms-full.txt
- Swiggy authentication: https://mcp.swiggy.com/builders/docs/start/authenticate/
- Swiggy delegated auth: https://mcp.swiggy.com/builders/docs/start/enterprise/delegated-auth/
- Swiggy errors: https://mcp.swiggy.com/builders/docs/reference/errors/
- Swiggy ship to production: https://mcp.swiggy.com/builders/docs/build/ship-to-production/
- Swiggy access and onboarding: https://mcp.swiggy.com/builders/docs/operate/access/
- Swiggy rate limits: https://mcp.swiggy.com/builders/docs/operate/rate-limits/
- Swiggy data and compliance: https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/

The local stub must mirror every individual Instamart tool page under:

- https://mcp.swiggy.com/builders/docs/reference/instamart/

The coding agent must not implement arbitrary fake REST routes or guessed response shapes.

## Required Swiggy MCP Tools

The local stub must document and support every Instamart tool page:

- `create_address`
- `delete_address`
- `get_addresses`
- `search_products`
- `your_go_to_items`
- `clear_cart`
- `get_cart`
- `update_cart`
- `checkout`
- `get_order_details`
- `get_orders`
- `track_order`
- `report_error`

Core cart flow:

```text
get_addresses → search_products → update_cart → get_cart → checkout → track_order
```

Important rules:

- `search_products` uses `addressId`.
- Product variants include `spinId`.
- Cart updates use variant-level `spinId`.
- `update_cart` replaces the full cart.
- `get_cart` must be called before checkout.
- `checkout` remains gated by explicit Telegram approval.
- `checkout` is non-idempotent; on 5xx/network failure, wait briefly, call `get_orders`, and only retry if no order exists.
- `401` or JSON-RPC `-32001` means reconnect Swiggy; never retry with the same token.
- Retriable upstream failures use exponential backoff with jitter and a user-facing retry budget.
- Domain failures are surfaced to Telegram and not blindly retried.
- Log Swiggy MCP `session_id` and sanitized tool-call metrics.
- Replacing local MCP with real Swiggy should require credentials/OAuth/config only, not workflow rewrites.

## Local Swiggy MCP Stub

The local stub must:

- Expose the same tool names as Swiggy.
- Accept the same argument names as Swiggy docs.
- Return Swiggy-style success/failure envelopes.
- Seed at least one saved `Home` address.
- Seed realistic grocery products for common meals and restock items.
- Include multiple variants for common products.
- Include variant-level `spinId`.
- Support cart replacement through `update_cart`.
- Return bill totals and available payment methods from `get_cart`.
- Block `checkout` unless the backend has stored latest Telegram approval.
- Return fake but realistic order IDs and tracking states.

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

## Backend Responsibilities

- Receive Telegram webhooks.
- Store idempotent Telegram `message_events`.
- Download Telegram voice notes.
- Call Sarvam STT.
- Run OpenAI Agents SDK workflows for intent/extraction/tool orchestration.
- Generate cook prompt text.
- Generate TTS voice note for cook prompt.
- Send Telegram messages, voice notes, and approval buttons.
- Build cart through the Instamart MCP adapter.
- Manage cart revision, upsell window, approval, checkout, and tracking.
- Store sanitized `agent_events`.

For the detailed OpenAI specialist-agent architecture, tool exposure rules, memory policy, reasoning defaults, and eval plan, read `docs/ai-agent-architecture.md`.

## Provider Boundary Rules

All external systems must sit behind adapters:

- `TelegramProvider`
- `SpeechToTextProvider`
- `TextToSpeechProvider`
- `IntentParser`
- `InstamartClient`
- `TraceProvider`

The business workflow must not depend directly on provider SDK response shapes.

## Database MVP v1

Use Supabase Postgres with these tables:

- `households`: household profile, status, language defaults.
- `telegram_chats`: group chat ID, title, linked household.
- `telegram_users`: Telegram ID, username, display name.
- `household_members`: household-user-role mapping.
- `cook_profiles`: cook member, preferred language, TTS voice preference.
- `swiggy_connections`: household owner connection, encrypted token, mode `fake | real`, token status.
- `oauth_sessions`: fake/real PKCE state, code verifier hash, household, owner, expiry.
- `message_events`: Telegram update metadata and idempotency keys.
- `voice_assets`: Telegram file IDs, file paths, STT transcript.
- `agent_runs`: intent classification and workflow records.
- `cart_sessions`: cart status, revision, approval status, expiration.
- `cart_items`: requested item, selected product/variant, `spinId`, quantity.
- `orders`: checkout result, order ID, status.
- `agent_events`: sanitized timeline/debugging events.

Supabase requirements:

- Keep schema changes in migrations.
- Use Supabase MCP for schema inspection, migration planning, SQL verification, and advisors when connected.
- Enable RLS by default on exposed tables.
- Keep service-role access backend-only.
- Encrypt fake/real Swiggy tokens before storage.
- Minimize persisted PII and add cleanup paths for transcripts, voice assets, and Swiggy-derived data.
- SQLite may be implemented only as a local fallback; it is not the canonical production-ready path.

## Swiggy Access Readiness

The demo must be suitable for Swiggy access review:

- Show a concrete real-user flow in a Telegram group, not a sandbox-only script.
- Confirm items, quantities, bill total, and checkout intent before placing/simulating an order.
- Complete fake OAuth locally with PKCE and keep the same route/state model for real OAuth.
- Handle `401`/JSON-RPC `-32001` by reconnecting, not retrying with the same token.
- Handle planned `429` by honoring `Retry-After`.
- Use check-then-retry for non-idempotent `checkout`.
- Estimate traffic as household-triggered low QPS; cache addresses and avoid repeated polling.
- Use HTTPS redirect URIs in production and exact-match callback configuration.
- Store no PII beyond what is needed; never log Swiggy tokens, full addresses, or raw sensitive transcripts.

## Agent Events

Useful event types:

- `telegram_message_received`
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

All events must use sanitized payloads only.

## Evaluation And Regression Checks

- Intent fixtures: flatmate meal request, cook meal+missing items, cook restock, cook question, cart addition, cart context, ignore.
- Multilingual fixtures: Hindi, Hinglish, Tamil, Telugu, and mixed-language grocery/cook messages.
- Extraction fixtures: missing items with quantity/unit, ambiguous items, and irrelevant chatter.
- Safety fixtures: checkout blocked before approval, stale revision rejected, duplicate checkout blocked.
- Swiggy contract fixtures: every local Instamart tool accepts documented args and returns documented success/failure envelopes.
- Error fixtures: 401 reconnect, planned 429 retry-after, 5xx retry budget, domain failure surfaced to Telegram.
- Trace fixtures: every E2E flow creates OpenAI trace spans and sanitized Supabase `agent_events`.

## Coding Agent Build Prompt

Use this prompt when asking a coding agent to implement the MVP:

```text
Build the Telegram-first Flatmeal MVP end to end from the Markdown docs in this repo.

Source of truth:
- telegram-firstflatmeal MVP PLan.md
- docs/flatmeal-agent-context.md
- docs/swiggy-mcp-and-agent-observability-plan.md
- docs/swiggy-instamart-tool-contracts.md

Implement a production-ready-shaped TypeScript backend:
- Telegram Bot API webhook flow with group onboarding buttons, roles, voice/text handling, inline cart approval, stale revision rejection, and no slash-command dependency.
- Supabase Postgres schema/migrations for households, Telegram users/chats, roles, cook profile/language, OAuth sessions, Swiggy connections, message events, voice assets, agent runs, cart sessions/items, orders, and agent events.
- OpenAI Agents SDK TypeScript for structured intent classification/extraction/tool orchestration/tracing.
- Sarvam STT for incoming voice notes and Sarvam TTS for cook prompts.
- Local fake Swiggy OAuth 2.0 PKCE flow.
- Local Swiggy Instamart MCP-compatible stub, not arbitrary REST mocks.
- Local Swiggy contract extraction in `docs/swiggy-instamart-tool-contracts.md`; update it from live docs before changing tool schemas.
- Hard gate: do not implement or change a Swiggy tool until its local contract section captures exact Swiggy agent guidance/workflow rules and required tests.
- If the live docs do not specify a response field or data shape, write `not specified by docs`; do not invent schemas.
- Contract tests for every Instamart tool page under https://mcp.swiggy.com/builders/docs/reference/instamart/.
- Swiggy-style auth/error/retry behavior from the official auth, errors, rate-limit, access, data-compliance, and ship-to-production docs.

The demo must work in Telegram end to end:
1. Bot is added to group and creates household.
2. Owner/cook/flatmates choose roles through buttons.
3. Cook language is selected.
4. Owner connects fake Swiggy.
5. Flatmate voice/text meal request is transcribed/classified.
6. Bot sends cook text + voice note.
7. Cook replies voice/text with missing items.
8. Agent extracts missing items.
9. Backend builds cart through local Instamart MCP stub.
10. Optional free-delivery add-more window runs once.
11. Bot sends latest cart preview with approve button.
12. Checkout is simulated only after latest approval.
13. Order confirmation and tracking state are posted in group.

Do not mock away the core path. Fake only the Swiggy production credentials/order placement via the local MCP/OAuth simulator.
Run tests autonomously and fix failures unless unrelated to this MVP.
```

## Demo Target

The MVP v1 demo should show:

1. Telegram group linked to a household.
2. Cook and flatmates registered by Telegram ID.
3. Cook language selected through Telegram buttons.
4. Owner connects fake Swiggy OAuth.
5. Case 1 flatmate voice meal request.
6. Sarvam STT transcript.
7. OpenAI agent intent extraction.
8. Bot text + voice prompt to cook.
9. Cook voice/text reply.
10. Missing items extracted.
11. Local Swiggy MCP-compatible cart build using connected fake Swiggy session.
12. Optional free-delivery add-more flow.
13. Telegram cart preview + approval button.
14. Stale approval rejection if cart revision changes.
15. Approved checkout and order confirmation in group.

## Acceptance Criteria

- MVP works end to end inside Telegram without a mobile app.
- Razorpay and paid onboarding are absent from v1.
- Website/phone-number onboarding and slash-command onboarding are absent from v1.
- Sarvam STT and TTS run for real in the demo path.
- OpenAI agent returns validated structured JSON for intent/extraction.
- The local Instamart stub follows Swiggy's MCP tool names, tool docs, `spinId`, cart replacement semantics, and error envelope.
- Fake local Swiggy OAuth mimics real PKCE connection and stores a household owner session.
- Checkout is impossible unless the latest Telegram cart revision is approved.
- Replacing local MCP with real Swiggy MCP does not change Telegram flows, database state machine, or cart workflow.

## Required API Keys And Local Config

- Telegram bot token from BotFather.
- Telegram privacy mode disabled for the bot.
- Public webhook URL for local development, usually ngrok or cloudflared.
- OpenAI API key.
- Sarvam API key.
- Google TTS credentials only if Sarvam TTS is not enough.
- Supabase project URL.
- Supabase anon/publishable key if needed server-side.
- Supabase service-role key for backend-only use.
- Supabase database URL for migrations.
- Encryption secret for fake/real Swiggy token storage.
- Fake Swiggy OAuth base URL and callback URL.
- Local Instamart MCP stub URL.
- Real Swiggy credentials later: `client_id`, approved redirect URI, scopes, and Instamart server allowlist.
- Production HTTPS base URL for Telegram webhook and OAuth redirect.

## Source References

- Telegram Bot API: https://core.telegram.org/bots/api
- Swiggy Instamart reference: https://mcp.swiggy.com/builders/docs/reference/instamart/
- Swiggy grocery recipe: https://mcp.swiggy.com/builders/docs/build/recipes/order-groceries/
- Swiggy authentication: https://mcp.swiggy.com/builders/docs/start/authenticate/
- Swiggy errors: https://mcp.swiggy.com/builders/docs/reference/errors/
- Swiggy developer quickstart: https://mcp.swiggy.com/builders/docs/start/developer/
- Swiggy access and onboarding: https://mcp.swiggy.com/builders/docs/operate/access/

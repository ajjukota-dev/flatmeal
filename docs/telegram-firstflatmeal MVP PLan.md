# Telegram-First Flatmeal MVP v1 Plan

## Summary
- Pivot from app-first/call-first to **Telegram group-first**: the household already coordinates in chat, so the bot becomes the product surface.
- Remove Bolna outbound calling from the MVP; use Telegram text + generated voice notes to communicate with cooks.
- Remove Razorpay, pricing, subscriptions, and payment-gated onboarding from MVP v1.
- Keep Sarvam STT for incoming voice notes, Sarvam TTS or Google TTS for bot-generated cook voice notes, OpenAI Agents SDK for intent/extraction/orchestration/tracing, Supabase/Postgres for production-shaped state, and Swiggy MCP-compatible local stub for cart/order flow.
- Keep the Swiggy integration contract exactly as planned: local MCP stub now, real `POST https://mcp.swiggy.com/im` later after access.
- Keep `docs/swiggy-instamart-tool-contracts.md` as the concise local Swiggy contract extracted from live docs.
- Use deterministic backend safety gates plus OpenAI Agents SDK structured outputs and tracing; do not let the model directly own checkout.
- Make the MVP production-ready in shape: real Telegram group flow, real STT/TTS, real agent runs, real database persistence, fake Swiggy OAuth, contract-faithful local Instamart MCP, and a video-ready end-to-end demo.

## Core Stack
- **Group UX:** Telegram Bot API with webhooks, group messages, voice notes, inline approval buttons.
- **Backend:** Node.js + Express + TypeScript.
- **Bot framework:** Telegraf or direct Telegram Bot API wrapper.
- **Database:** Supabase Postgres for the production-ready MVP, with RLS/security policies and migrations from day one.
- **Voice → text:** Sarvam STT.
- **Text → voice:** Sarvam TTS first; Google Cloud TTS fallback if Sarvam voice quality/language coverage is weak.
- **Agent + intent + extraction:** OpenAI Agents SDK TypeScript with structured outputs/tools.
- **Observability:** OpenAI Agents SDK tracing plus internal `agent_events`.
- **Grocery cart:** Local Swiggy Instamart MCP-compatible stub now; real Swiggy MCP later.
- **Onboarding:** Telegram-native setup cards and inline buttons; no website, phone-number form, or slash commands for MVP v1.
- **Deployment shape:** HTTPS backend/webhook plus OAuth callback route; local dev uses ngrok/cloudflared, production can deploy on Vercel/Render/Fly/Railway.

## Database Choice
- Use **Supabase Postgres now** because the product should look production-ready for Swiggy access review, not like a throwaway laptop-only demo.
- Supabase gives a real managed database, dashboard, backups, secure secrets flow, and a clean path to staging/production without rewriting state.
- Use Supabase MCP for schema inspection, SQL changes, migration planning, advisors, and verification once connected.
- Enable RLS by default on exposed tables and write policies that match the actual backend/admin access model.
- Never expose the Supabase service-role key in public clients; only the backend can use service-role access.
- Store authorization/role facts in database rows, not user-editable metadata.
- SQLite may still be kept only as an optional emergency local fallback, but the canonical MVP implementation should target Supabase/Postgres.
- supabse mcp is connect use it

## Telegram Requirements
- The bot must receive Telegram `message` and `callback_query` updates.
- The bot must handle text messages, voice notes, and inline keyboard approval buttons.
- The bot must download voice files from Telegram, send them to Sarvam STT, and store the transcript.
- Bot-generated cook prompts should be sent as both text and voice note.
- Approval should use Telegram inline keyboard buttons with callback data tied to `cartSessionId` and `revision`.
- Previous approval buttons must be expired by editing the old message reply markup or rejecting stale callback revisions.
- Telegram bot privacy mode must be disabled for full group-message access; verify via `getMe.can_read_all_group_messages`.
- Use stable Telegram `from.id` for identity; usernames are optional display metadata and must not be trusted as primary IDs.

Sources:
- Telegram Bot API: https://core.telegram.org/bots/api
- Telegram Bot API voice notes: https://core.telegram.org/bots/api#voice
- Telegram Bot API sendVoice: https://core.telegram.org/bots/api#sendvoice
- Telegram Bot API CallbackQuery: https://core.telegram.org/bots/api#callbackquery

## User Roles + Telegram-Native Onboarding
- A user creates or opens a Telegram group and adds the Flatmeal bot.
- Bot creates the `household` automatically when added to a group.
- Bot stores `telegramChatId`, group title, and household mapping.
- Bot posts a setup card with inline buttons: `[I am owner] [I am cook] [I am flatmate]`.
- First user to tap `I am owner` becomes owner.
- Cook taps `I am cook`.
- Bot asks cook language with inline buttons: `[Hindi] [Hinglish] [Tamil] [Telugu] [English]`.
- Flatmates tap `I am flatmate`.
- New group members can be prompted with the same role buttons when they first join, speak, or tap the bot.
- Telegram IDs must be captured from actual Telegram interactions, not phone numbers or usernames.
- Backend role lookup is simple: `message.from.id → household_members.role`.
- Roles:
  - `cook`: can initiate missing-item/restock requests.
  - `flatmate`: can request meals, add items, and approve carts.
  - `owner`: can manage household, Swiggy OAuth, and membership.
- No `/link`, `/join`, or `/language` commands are required in MVP v1.

## Case 1: Flatmate Meal Request
```text
Flatmate sends voice/text in group
  → Sarvam STT if voice
  → OpenAI agent classifies as flatmate_meal_request
  → OpenAI agent extracts meal, servings, time, spice/notes
  → Bot tags cook with text
  → Bot sends generated voice note in cook's preferred language
  → Cook replies voice/text
  → Sarvam STT if voice
  → OpenAI agent extracts missing items
  → Agent builds Swiggy cart through local MCP stub
  → Bot checks cart/free-delivery threshold
  → Optional 2-minute add-more window
  → Bot sends cart preview + Approve button
  → Owner taps Approve
  → Backend validates latest cart revision
  → Checkout
  → Order confirmation posted in group
```

## Case 2: Cook Reports Meal + Missing Items
```text
Cook sends voice/text in group
  → Sarvam STT if voice
  → OpenAI agent classifies as cook_meal_missing_items
  → Extract meal context and missing items
  → Skip cook ping entirely
  → Build cart
  → Optional free-delivery/add-more window
  → Send cart preview + Approve button
  → Owner approves
  → Checkout
  → Confirm order in group
```

## Case 3: Cook Restock Request Only
```text
Cook sends voice/text: "chawal khatam, dahi nahi hai"
  → Sarvam STT if voice
  → OpenAI agent classifies as cook_restock_request
  → Extract grocery items directly
  → Build cart
  → Optional free-delivery/add-more window
  → Send cart preview + Approve button
  → Owner approves
  → Checkout
  → Confirm order in group
```

## Case 4: Owner/Flatmate Direct Purchase Request
```text
Owner or flatmate clearly asks to buy/order grocery items
  → Sarvam STT if voice
  → OpenAI agent classifies as direct_purchase_request
  → Extract grocery items directly
  → Build or update cart
  → Optional free-delivery/add-more window
  → Send cart preview + Approve button
  → Owner approves
  → Checkout
  → Confirm order in group
```

## Intent Classification
OpenAI agent should return one structured intent per relevant message:
- `flatmate_meal_request`: flatmate asks to cook/eat something.
- `cook_meal_missing_items`: cook reports meal plus required/missing items.
- `cook_restock_request`: cook asks only for grocery restock, no meal context.
- `direct_purchase_request`: owner or flatmate clearly asks to buy/order grocery items directly.
- `cook_question_to_flatmates`: cook asks what to cook or asks a clarification.
- `flatmate_cart_addition`: flatmate adds items during active add-more window.
- `cart_approval_context_message`: user asks about cart/order state.
- `ignore`: ordinary group chat unrelated to food/grocery/order.

The backend must validate role + active workflow before acting. Example: a `flatmate_cart_addition` only matters if the group has an open `add_more_window`.

## Structured Outputs
```ts
type ParsedMessageIntent =
  | "flatmate_meal_request"
  | "cook_meal_missing_items"
  | "cook_restock_request"
  | "direct_purchase_request"
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

## Free Delivery / Add-More Edge Case
- After `get_cart`, backend checks bill breakdown and delivery-fee/free-delivery threshold.
- If a small amount can unlock free delivery, bot opens one add-more window:
  - Message: “₹20 more for free delivery — kuch aur chahiye? 2 min.”
  - Status: `upsell_open`.
  - Timeout: 2 minutes.
- During the window, flatmate messages are classified for `flatmate_cart_addition`.
- If a flatmate adds milk/curd/etc., rebuild cart and increment cart revision.
- After timeout or successful addition, send a new cart preview.
- Expire previous approval buttons by revision check and Telegram reply-markup edit.
- Cap this to one upsell loop per cart session for MVP.

## Approval + Checkout Rules
- Checkout must never happen automatically.
- Only the `owner` role can approve.
- Approval callback payload must include `cartSessionId` and `revision`.
- Backend must reject stale approval callbacks.
- Backend must reject approval if cart status is not `approval_pending`.
- Backend must call `get_cart` before checkout.
- Real Swiggy checkout later uses the household owner’s connected Swiggy OAuth session.
- Group confirmation should include order ID, items summary, total, and tracking status.

## Swiggy Account Connection
- One Swiggy account must be connected per household.
- The household owner connects their Swiggy account from Telegram by tapping `Connect Swiggy`.
- Bot sends the owner a private auth link.
- This is **delegated user auth**: Flatmeal acts on behalf of the household owner’s Swiggy account, not on behalf of a Flatmeal-owned Swiggy account.
- In real Swiggy OAuth, the owner enters phone + OTP only on Swiggy’s browser-hosted authorization page.
- Flatmeal must never collect, ask for, store, or proxy a Swiggy OTP or Swiggy password in Telegram, the backend, logs, traces, or any Flatmeal UI.
- The OAuth access token lets the backend/agent call Swiggy MCP tools on behalf of that connected household owner account.
- Local MVP mimics Swiggy OAuth 2.0 PKCE with a fake authorize/callback/token flow.
- Fake local OAuth stores an encrypted fake access token against the household owner/household.
- Local Instamart MCP stub accepts the fake token and behaves like a connected Swiggy account.
- Real Swiggy later replaces the fake auth server with Swiggy OAuth endpoints and the real `POST https://mcp.swiggy.com/im` MCP endpoint.
- If no Swiggy connection exists, or token is expired/invalid, bot asks the owner to reconnect before cart checkout.

Local auth flow:

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

## Swiggy MCP Contract
- Keep the existing Swiggy MCP contract plan.
- Before implementation, read and follow Swiggy authentication, errors, and production shipping docs:
  - https://mcp.swiggy.com/builders/llms.txt
  - https://mcp.swiggy.com/builders/llms-full.txt
  - https://mcp.swiggy.com/builders/docs/start/authenticate/
  - https://mcp.swiggy.com/builders/docs/start/enterprise/delegated-auth/
  - https://mcp.swiggy.com/builders/docs/reference/errors/
  - https://mcp.swiggy.com/builders/docs/build/ship-to-production/
  - https://mcp.swiggy.com/builders/docs/operate/access/
  - https://mcp.swiggy.com/builders/docs/operate/rate-limits/
  - https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/
- Local stub must still mirror every Instamart tool page under: https://mcp.swiggy.com/builders/docs/reference/instamart/
- The coding agent must read each individual tool doc before implementing the stub: `create_address`, `delete_address`, `get_addresses`, `search_products`, `your_go_to_items`, `clear_cart`, `get_cart`, `update_cart`, `checkout`, `get_order_details`, `get_orders`, `track_order`, and `report_error`.
- The coding agent must extract the important contract facts into `docs/swiggy-instamart-tool-contracts.md` and implement from that local contract, not from memory or guessed schemas.
- Do not paste entire Swiggy docs into the repo; keep a concise local contract summary with arguments, response shape, behavior, retry rule, local stub behavior, and required tests per tool.
- Hard gate: no Swiggy tool implementation starts until that tool’s local contract section includes exact Swiggy agent guidance/workflow rules and tests derived from those rules.
- If the Swiggy docs do not specify a field or data shape, write `not specified by docs`; do not invent it.
- Real Swiggy remains one MCP endpoint: `POST https://mcp.swiggy.com/im`.
- Required flow remains:
```text
get_addresses → search_products → update_cart → get_cart → checkout → track_order
```
- Cart updates must use product variant `spinId`.
- `update_cart` replaces the full cart.
- `checkout` remains gated by explicit Telegram approval.
- `checkout` is non-idempotent; on 5xx/network failure, call `get_orders` to check whether the order succeeded before retrying.
- `401` or JSON-RPC `-32001` means re-run OAuth/reconnect Swiggy; do not retry with the same token.
- `400` bad input means fix arguments; do not retry.
- `502/503/504` and upstream timeouts use exponential backoff with jitter within a user-facing retry budget.
- Domain failures like out of stock, address not serviceable, minimum order not met, or cart expired should be surfaced in Telegram and not blindly retried.
- Log Swiggy MCP `session_id`, latency, tool name, status, and sanitized user/household correlation IDs for every tool call.
- Replacing local MCP with real Swiggy should require credentials/OAuth/config only, not workflow rewrites.
- This strict local MCP contract exists to make Swiggy onboarding/access review easier and to avoid rewriting the integration after approval.

## Swiggy Access Readiness
Swiggy access review expects more than a sandbox mock. The MVP must be demoed as a concrete real-user use case with respectful user confirmation, safe auth, safe retries, realistic QPS expectations, HTTPS redirects, and minimal PII storage.

Build the demo so the application can provide:
- Integration name and one-paragraph use case: Telegram-first food coordination for shared flats with cook/flatmate requests and owner approval.
- Short video: bot added to real Telegram group, roles selected, fake Swiggy connected, voice request processed, cart built, latest revision approved, checkout simulated.
- Redirect URIs: exact-match HTTPS production callback plus `http://localhost` only for local dev.
- Requested server: `instamart`; scopes: `mcp:tools` initially, with `mcp:resources`/`mcp:prompts` only if actually used.
- Expected volume estimate: MVP target around `1-3 orders/day/household`, `8-20 Instamart tool calls/order`, and low peak QPS because each household flow is human-triggered.
- Traffic discipline: cache addresses per session, avoid repeated searches where `your_go_to_items` works, do not poll tracking faster than 10 seconds, and honor future `429 Retry-After`.
- Security baseline: HTTPS, encrypted tokens, no raw tokens in logs, no full addresses/transcripts in traces, and only necessary PII retained.

## Database MVP
Use Supabase Postgres with these tables:
- `households`: household profile, status, plan, language defaults.
- `telegram_chats`: group chat ID, title, linked household.
- `telegram_users`: Telegram ID, username, display name.
- `household_members`: household-user-role mapping.
- `cook_profiles`: cook member, preferred language, TTS voice preference.
- `swiggy_connections`: household owner connection, encrypted token, mode `fake | real`, token status.
- `oauth_sessions`: fake/real OAuth PKCE state, code verifier hash, household, owner, expiry.
- `message_events`: raw Telegram update metadata and idempotency keys.
- `voice_assets`: Telegram file IDs, local/transcoded paths, STT transcript.
- `agent_runs`: intent classification and workflow run records.
- `cart_sessions`: current cart, revision, approval status, expiration.
- `cart_items`: requested item, selected Swiggy product/variant, `spinId`, quantity.
- `orders`: checkout result, order ID, status.
- `agent_events`: sanitized timeline and debugging events.

Supabase implementation requirements:
- Keep all schema changes in migrations.
- Enable RLS on exposed tables by default.
- Backend service-role access stays server-only.
- Hash or minimize sensitive external identifiers where possible.
- Encrypt Swiggy fake/real OAuth tokens before storage.
- Add deletion/retention paths for transcripts, voice assets, and Swiggy-derived data.
- Use Supabase advisors before production demo freeze.

## Observability
- Use OpenAI Agents SDK tracing for agent runs, model calls, structured outputs, and tool calls.
- Add custom spans for Telegram webhook handling, Sarvam STT/TTS, local/real Swiggy OAuth, and Swiggy MCP tool calls.
- Keep `agent_events` as the product-visible timeline in Telegram/admin UI.
- Export operational logs/metrics from the backend separately from OpenAI traces so product debugging does not depend on trace UI access.
- Add OpenTelemetry-compatible spans around every MCP `callTool` so Swiggy `session_id` can be correlated with backend logs.
- Every run should carry:
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
- Never log Telegram bot token, Swiggy OAuth token, Supabase service key, phone numbers, full addresses, or raw sensitive transcripts in unsafe logs.

## Evaluation Plan
- Add fixture-based evals for all intent classes, including Hindi/Hinglish/Tamil/Telugu cook messages.
- Add extraction evals for missing grocery items, quantity/unit handling, and irrelevant group chatter.
- Add safety evals proving checkout never happens without latest explicit approval.
- Add tool-trajectory evals for the Swiggy flow: `get_addresses → search_products → update_cart → get_cart → checkout → track_order`.
- Add MCP contract tests for all 13 local Instamart tools against extracted docs-derived schemas.
- Add regression scenarios for token expiry, 401, planned 429, upstream 5xx, out-of-stock, stale approval, duplicate checkout, and add-more revision changes.
- Use OpenAI traces for model/tool-call inspection and Supabase `agent_events` for product timeline verification.

## Required API Keys And Local Config
- Telegram bot token from BotFather.
- Telegram privacy mode disabled for the bot.
- Public webhook URL for local development, usually ngrok or cloudflared.
- OpenAI API key.
- Sarvam API key.
- Google TTS credentials only if Sarvam TTS is not enough.
- Supabase project URL.
- Supabase anon/publishable key for server-side public client use if needed.
- Supabase service-role key for backend-only jobs and migrations; never expose it to Telegram/web clients.
- Supabase database URL for migrations.
- Encryption secret for storing fake/real Swiggy tokens.
- Fake Swiggy OAuth base URL and callback URL.
- Local Instamart MCP stub URL.
- Real Swiggy credentials later: `client_id`, approved redirect URI, scopes, and Instamart server allowlist.
- Production HTTPS base URL for Telegram webhook and OAuth redirect.

## MVP v1 Exclusions
- No Razorpay.
- No pricing page.
- No subscription enforcement.
- No paid onboarding.
- No React Native app.
- No Bolna outbound calls.
- No production Swiggy checkout until access is granted.
- No phone-number based Telegram identity matching.
- No slash-command onboarding.

## Test Plan
- Case 1 E2E: flatmate voice meal request → cook prompt text+voice → cook reply → cart → free-delivery add-more → owner approval → checkout.
- Case 2 E2E: cook sends meal+missing items → skip cook ping → cart → owner approval → checkout.
- Case 3 E2E: cook sends restock request → cart → owner approval → checkout.
- Case 4 E2E: owner/flatmate directly requests groceries → cart → owner approval → checkout.
- Telegram tests: voice note ingestion, text ingestion, callback approval, stale button rejection, privacy-mode setup detection.
- Onboarding tests: bot-added household creation, setup card buttons, owner/cook/flatmate role capture, cook language selection, new-member role prompt.
- OpenAI agent tests: classify all intent types, reject unrelated group chatter, extract multilingual missing items, and emit valid structured outputs.
- Cart tests: use Swiggy MCP local stub, `spinId`, cart revisioning, old approval expiry, checkout gating.
- Swiggy connection tests: fake PKCE start/callback/token storage, missing-token reconnect prompt, token-expired reconnect prompt.
- Supabase tests: migrations apply cleanly, RLS is enabled, service-role-only operations are not exposed to clients, and sensitive fields are encrypted/minimized.
- Swiggy readiness tests: OAuth redirect exact-match, 401 reconnect branch, planned 429 `Retry-After` branch, 5xx retry budget, and check-then-retry for checkout.

## Assumptions
- Telegram group is the MVP product surface; React Native app is deferred.
- Bolna outbound calling is deferred; Telegram voice notes replace calls for MVP.
- Razorpay and paid onboarding are deferred.
- Website and phone-number onboarding are deferred.
- OpenAI Agents SDK is the primary agent/orchestration framework.
- Sarvam handles incoming STT and preferably outgoing TTS.
- Supabase/Postgres is the canonical MVP DB for production readiness; SQLite is optional fallback only.
- Swiggy MCP compatibility remains non-negotiable.

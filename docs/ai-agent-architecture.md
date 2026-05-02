# Flatmeal AI Agent Architecture

This is the source of truth for how the Flatmeal AI agent is architected. Keep it aligned with `docs/telegram-firstflatmeal MVP PLan.md`, `docs/flatmeal-agent-context.md`, and `docs/swiggy-mcp-and-agent-observability-plan.md`.

## Architecture Decision

Flatmeal uses a deterministic backend workflow with OpenAI Agents SDK inside controlled phases.

The backend owns:

- Telegram webhook intake, idempotency, role lookup, and workflow routing.
- Supabase state, Swiggy OAuth state, cart sessions, revisions, approvals, and orders.
- Sarvam STT/TTS calls and Telegram message/voice/button delivery.
- Swiggy MCP tool phase selection, tool wrappers, retries, and checkout gating.

OpenAI agents own:

- Intent classification.
- Structured extraction from flatmate/cook messages.
- Cook-facing prompt drafting.
- Cart search/product planning.
- Read-only support answers.

OpenAI agents must not own:

- Role permissions.
- Swiggy OAuth state.
- Cart truth.
- Cart revision state.
- Approval state.
- Checkout execution.
- Retry decisions for non-idempotent checkout.

## Agent Runtime

- Language/runtime: TypeScript backend.
- Agent framework: OpenAI Agents SDK TypeScript.
- Persistence: Supabase Postgres is authoritative memory.
- Speech: Sarvam STT for incoming Telegram voice notes; Sarvam TTS for cook-facing voice notes.
- Commerce: local Swiggy Instamart MCP-compatible stub now; real `POST https://mcp.swiggy.com/im` later.
- Orchestration pattern: backend-managed phases, not a single autonomous free-running agent.

Do not add LangGraph for MVP v1. Reconsider only if the workflow needs complex branching that cannot stay readable in backend code.

## Specialist Agents

### `message_intent_agent`

Purpose: classify one Telegram text/transcript into exactly one intent.

Allowed inputs:

- Sanitized message text.
- Sender role: `owner`, `flatmate`, `cook`, or unknown.
- Cook language preference when relevant.
- Active workflow/cart summary.
- Recent sanitized relevant messages.

Allowed output:

- A validated structured intent envelope.

No tools:

- No Swiggy tools.
- No Telegram send tools.
- No checkout/order tools.

### `meal_request_agent`

Purpose: extract a flatmate meal request.

Allowed output:

- Dish.
- Servings.
- Meal time.
- Spice level.
- Notes for cook.
- Clarification question if confidence is too low.

No tools.

### `cook_prompt_agent`

Purpose: write the cook-facing Telegram text and voice-note script.

Allowed input:

- Parsed meal request.
- Cook preferred language.
- Cook Telegram user ID.

Allowed output:

- Cook prompt text.
- Language code.
- `voiceRequired: true`.
- Target cook Telegram ID.

No Swiggy tools. The backend sends the message and calls TTS.

### `missing_items_agent`

Purpose: extract missing grocery items from cook voice/text replies.

Allowed output:

- Missing item names.
- Quantity and unit when present.
- Confidence per item.
- Clarification question if too ambiguous.

No Swiggy tools.

### `cart_planner_agent`

Purpose: convert missing grocery items into a Swiggy cart build plan.

Allowed work:

- Produce search queries.
- Choose candidate products/variants from Swiggy MCP search results.
- Return `spinId` and quantity selections for backend validation.

Allowed tools by phase:

- `get_addresses`
- `search_products`
- `your_go_to_items`
- `update_cart`
- `get_cart`

Backend must enforce Swiggy workflow rules before and after these tools, including address selection STOP rules and cart truth re-read.

### `cart_addition_agent`

Purpose: handle flatmate add-more messages during the free-delivery/add-more window.

Allowed only when:

- `cart_sessions.status = "upsell_open"`.
- Sender role is `owner` or `flatmate`.
- The add-more window has not expired.

Allowed output:

- Additional grocery items.
- Quantity/unit when present.
- `ignore` if the message is ordinary group chatter.

### `order_support_agent`

Purpose: answer cart/order status questions.

Allowed tools:

- `get_orders`
- `get_order_details`
- `track_order`
- `report_error`

Restrictions:

- Read-only by default.
- Must not cancel orders.
- Must not call checkout.

## Intent Contract

`message_intent_agent` must return exactly one of:

- `flatmate_meal_request`: flatmate asks to cook/eat something.
- `cook_meal_missing_items`: cook reports meal plus required/missing items.
- `cook_restock_request`: cook asks only for grocery restock.
- `direct_purchase_request`: owner or flatmate clearly asks to buy/order grocery items directly.
- `cook_question_to_flatmates`: cook asks what to cook or asks a clarification.
- `flatmate_cart_addition`: flatmate adds items during an active add-more window.
- `cart_approval_context_message`: user asks about cart/order state.
- `ignore`: unrelated group chat.

Backend must validate sender role and active workflow before acting on the intent.

## Structured Output Schemas

Implementation should define strict Zod schemas or equivalent runtime validation for these outputs.

```ts
type SenderRole = "owner" | "flatmate" | "cook" | "unknown";

type ParsedMessageIntent =
  | "flatmate_meal_request"
  | "cook_meal_missing_items"
  | "cook_restock_request"
  | "direct_purchase_request"
  | "cook_question_to_flatmates"
  | "flatmate_cart_addition"
  | "cart_approval_context_message"
  | "ignore";

type IntentEnvelope = {
  intent: ParsedMessageIntent;
  confidence: number;
  language?: "hi" | "en" | "hinglish" | "ta" | "te" | "mixed";
  reason: string;
  requiresClarification: boolean;
  clarificationQuestion?: string;
};

type MealRequest = {
  dish: string;
  servings?: number;
  mealTime?: string;
  spiceLevel?: "less" | "medium" | "spicy";
  notes: string[];
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

Invalid structured output must stop the workflow, create `run_failed`, and ask for clarification or fail safely in Telegram.

## Workflow State Machine

```text
telegram_message_received
  → message_deduplicated
  → role_and_household_loaded
  → voice_transcribed? 
  → intent_extracted
  → workflow_branch_selected
```

Flatmate meal request:

```text
flatmate_meal_request
  → meal_request_extracted
  → cook_prompt_created
  → tts_created
  → cook_prompt_sent
  → wait_for_cook_reply
```

Cook missing items/restock or direct grocery purchase:

```text
cook_reply_restock_or_direct_purchase
  → missing_items_extracted
  → cart_session_created
  → address_selected_or_requested
  → products_searched
  → cart_updated
  → cart_re_read
  → upsell_window_or_cart_preview
```

Approval and checkout:

```text
cart_ready_for_approval
  → latest_revision_approved
  → get_cart_re_read
  → checkout_guard_passed
  → checkout_called
  → order_created
  → track_order_called
  → group_confirmed
```

## Tool Exposure By Phase

Intent/extraction phase:

- No Swiggy tools.
- No mutating tools.

Cook prompt phase:

- No Swiggy tools.
- Backend may call TTS after structured prompt output validates.

Cart build phase:

- `get_addresses`
- `search_products`
- `your_go_to_items`
- `update_cart`
- `get_cart`

Approval/checkout phase:

- `get_cart`
- `checkout`
- `track_order`

Support/debug phase:

- `get_orders`
- `get_order_details`
- `track_order`
- `report_error`

Never expose `checkout` before backend has stored latest explicit Telegram approval.

## Guardrails

All tool wrappers must enforce:

- Correct workflow phase.
- Correct sender role.
- Active household.
- Valid fake/real Swiggy connection.
- Latest cart revision.
- Owner-only approval before checkout.
- Approval present before checkout.
- No stale approval callback.
- No duplicate checkout for an already checked-out cart session.
- No blind retry for non-idempotent checkout.
- No raw tokens, OTPs, full addresses, or sensitive transcript data in logs/traces.

If any guard fails, the backend writes a sanitized `agent_events` record and sends a respectful Telegram message when user-visible.

## Memory Strategy

Supabase is the authoritative memory.

Store in Supabase:

- Household, chat, member, and cook profile state.
- Swiggy connection and OAuth session state.
- Telegram message idempotency.
- Voice asset/transcript metadata.
- Agent run metadata.
- Cart sessions, cart items, approvals, and order records.
- Sanitized `agent_events`.

Agent input context may include:

- Sender role.
- Cook language.
- Active workflow state.
- Active cart summary.
- Last few relevant sanitized messages.
- Current text/transcript.

Agents SDK sessions are optional for short conversational continuity only. Never trust an SDK session or model memory for cart truth, approval state, checkout state, OAuth state, selected address, or order state.

No vector memory for MVP v1.

## Reasoning Defaults

- Intent/extraction agents: low to medium reasoning, strict structured output, cheap/fast model where quality is acceptable.
- Cook prompt agent: low reasoning, constrained by cook language and tone.
- Missing items agent: medium reasoning for multilingual grocery extraction.
- Cart planner agent: medium reasoning because product matching needs judgment.
- Order support agent: low reasoning with read-only tools.
- Checkout path: minimal model reasoning; backend rules dominate.

If confidence is low, ask a Telegram clarification instead of guessing.

## Observability

Use one OpenAI trace per Telegram order flow.

Recommended trace name:

```text
flatmeal.telegram_order_flow
```

Create or capture spans for:

- Telegram webhook intake.
- Telegram voice download.
- Sarvam STT.
- Intent classification.
- Meal extraction.
- Cook prompt generation.
- Sarvam TTS.
- Swiggy OAuth/fake OAuth checks.
- Swiggy MCP tool calls.
- Add-more window.
- Telegram approval callback.
- Checkout guard.
- Checkout call.
- Tracking call.

Store sanitized product timeline events in `agent_events`. Correlate with:

- `householdId`
- `telegramChatId`
- `messageEventId`
- `agentRunId`
- `traceId`
- `cartSessionId`
- `cartRevision`
- `mcpSessionId`
- `swiggyConnectionId`

## Evaluation Plan

Add fixture-based evals for:

- All intent classes.
- Hindi, Hinglish, Tamil, Telugu, English, and mixed-language messages.
- Cook replies with missing items and quantities.
- Flatmate add-more messages during and outside `upsell_open`.
- Irrelevant group chatter.
- Low-confidence clarification behavior.
- Stale approval rejection.
- Duplicate checkout prevention.
- Checkout blocked before latest approval.
- Swiggy 401/reconnect, planned 429, domain failures, and checkout uncertainty.
- Correct MCP tool trajectory for cart build and checkout.

Add contract tests for every local Instamart tool after extracting its Swiggy page into `docs/swiggy-instamart-tool-contracts.md`.

## References

OpenAI Agents SDK capabilities to check before implementation:

- Tools: https://openai.github.io/openai-agents-js/guides/tools
- Sessions: https://openai.github.io/openai-agents-js/guides/sessions
- Guardrails: https://openai.github.io/openai-agents-js/guides/guardrails
- Tracing: https://openai.github.io/openai-agents-js/guides/tracing/

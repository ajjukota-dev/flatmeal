# AGENTS.md

Project instructions for Codex and other coding agents working in this repository.

These instructions apply to the entire repository. Merge them with direct user instructions. Direct user instructions win if there is a conflict.

## 1. Product Source Of Truth

Always read the planning docs before implementation work:

- `docs/telegram-firstflatmeal MVP PLan.md`
- `docs/ai-agent-architecture.md`
- `docs/flatmeal-agent-context.md`
- `docs/swiggy-mcp-and-agent-observability-plan.md`
- `docs/swiggy-instamart-tool-contracts.md`
- `docs/milestone-tracker.md`

Treat files under `docs/` as the canonical product and integration context. Do not invent architecture from memory if a doc already defines the decision.

Current product direction:

- Telegram-first MVP, not mobile-app-first.
- No Razorpay, no subscription enforcement, no phone-number onboarding, no website-first onboarding, no slash-command dependency.
- No Bolna outbound calls in MVP v1; use Telegram text plus generated voice notes.
- TypeScript backend with Telegram Bot API, Sarvam STT/TTS, OpenAI Agents SDK, Supabase Postgres, fake Swiggy OAuth, and local Swiggy Instamart MCP-compatible stub.
- AI architecture is backend-managed orchestration with small OpenAI specialist agents; never a free-running autonomous checkout agent.
- The local Swiggy MCP stub must be contract-faithful, not a loose mock.

## 2. Required Documentation Review

Before implementing any code change, re-read the relevant local `.md` files first, then follow the links inside those files to the applicable live documentation. Do this per implementation task, not only once per session.

Before implementing external integrations, read the relevant official docs linked from the project docs.

For Swiggy work, read thoroughly before coding:

- The relevant local planning/contract `.md` files and every Swiggy documentation link they reference for the tool or workflow being implemented
- Swiggy docs index: `https://mcp.swiggy.com/builders/llms.txt`
- Swiggy full docs context: `https://mcp.swiggy.com/builders/llms-full.txt` when broad context is needed
- Per-page Markdown by appending `.md` to any Swiggy docs URL when implementing a specific tool
- Swiggy Instamart overview and every individual tool page under `https://mcp.swiggy.com/builders/docs/reference/instamart/`
- Swiggy authentication: `https://mcp.swiggy.com/builders/docs/start/authenticate/`
- Swiggy delegated auth: `https://mcp.swiggy.com/builders/docs/start/enterprise/delegated-auth/`
- Swiggy errors: `https://mcp.swiggy.com/builders/docs/reference/errors/`
- Swiggy ship-to-production: `https://mcp.swiggy.com/builders/docs/build/ship-to-production/`
- Swiggy access/onboarding: `https://mcp.swiggy.com/builders/docs/operate/access/`
- Swiggy rate limits: `https://mcp.swiggy.com/builders/docs/operate/rate-limits/`
- Swiggy data/compliance: `https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/`

For OpenAI work, check the current official OpenAI docs before implementing Agents SDK, tracing, structured outputs, or tool calls. Do not rely on stale memory.

For Flatmeal agent architecture work, follow `docs/ai-agent-architecture.md`. Do not introduce LangGraph, vector memory, autonomous checkout, or global model-owned workflow state unless the product docs are updated first.

For Supabase work, check current Supabase docs and use Supabase MCP when available. Enable RLS by default on exposed tables and never expose the service-role key to clients.

If network/docs access is blocked, stop and say exactly which docs could not be checked instead of guessing silently.

## 3. Swiggy MCP Contract Rules

The local Instamart MCP stub must mirror Swiggy’s tool flow and documented tool contracts.

Maintain `docs/swiggy-instamart-tool-contracts.md` as the concise local contract extraction. Verify live Swiggy docs first, update that local contract summary, then implement against it. Do not paste whole Swiggy docs into the repo.

Hard gate:

- Do not implement or modify any Swiggy tool until that tool has a completed section in `docs/swiggy-instamart-tool-contracts.md`.
- The completed section must include the exact Swiggy agent guidance/workflow rules from that tool page.
- If the docs do not specify a field or data shape, write `not specified by docs`; do not invent it.
- Write or update contract tests from the extracted local contract before implementing stub behavior.
- If live docs cannot be fetched, stop and report which tool/page is blocked instead of guessing.

Support every Instamart tool page:

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

Rules:

- Swiggy is one MCP endpoint shape, not fake REST endpoints per action.
- Swiggy OAuth is delegated user auth: calls are made on behalf of the connected household owner’s Swiggy account.
- Swiggy’s browser-hosted OAuth page collects phone + OTP; Flatmeal must never collect, store, proxy, or log Swiggy OTP/password.
- The OAuth token authorizes MCP tool calls on behalf of that connected owner account.
- Use documented argument names and response envelopes.
- Use product variant `spinId`.
- `update_cart` replaces the full cart.
- `checkout` is non-idempotent and must never be blind-retried.
- Checkout must be impossible before explicit latest Telegram cart approval.
- On checkout 5xx/network uncertainty, call `get_orders` before retrying.
- `401` or JSON-RPC `-32001` means reconnect OAuth; do not retry with the same token.
- Domain failures must be surfaced to Telegram, not retried blindly.

## 4. Think Before Coding

Do not assume. Do not hide confusion. Surface tradeoffs.

Before implementing:

- State assumptions explicitly when they matter.
- If multiple interpretations exist, present them instead of picking silently.
- If a simpler approach exists, say so.
- Push back when a requested approach conflicts with the docs or product safety.
- If something is unclear and risky, stop, name what is confusing, and ask.

## 5. Simplicity First

Write the minimum code that solves the problem.

- No features beyond what was asked.
- No abstractions for single-use code.
- No speculative flexibility or configurability.
- No unnecessary provider coupling.
- If a solution can be 50 lines instead of 200, prefer the 50-line version.

Provider SDKs should sit behind small adapters only when that boundary is already useful:

- `TelegramProvider`
- `SpeechToTextProvider`
- `TextToSpeechProvider`
- `IntentParser`
- `InstamartClient`
- `TraceProvider`

## 6. Surgical Changes

Touch only what the task requires.

- Do not “improve” adjacent code, comments, or formatting.
- Do not refactor unrelated code.
- Match the existing style.
- Remove imports/variables/functions made unused by your own changes.
- Mention unrelated dead code or bugs instead of deleting/fixing them.

Every changed line should trace directly to the user’s request.

## 7. Goal-Driven Execution

Turn work into verifiable goals.

For multi-step tasks, keep a short plan:

```text
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Examples:

- “Add validation” → add tests for invalid inputs, then make them pass.
- “Fix bug” → reproduce with a test or script, then fix.
- “Implement flow” → verify the end-to-end path, not just isolated helpers.

Loop until the success criteria are verified or a real blocker is documented.

## 8. Safety And Approval Rules

For the Flatmeal product:

- The model/agent may classify, extract, and suggest tool calls.
- Backend code owns role checks, workflow state, cart revision checks, OAuth checks, and checkout gating.
- Supabase is authoritative memory; model memory and Agents SDK sessions must never be trusted for cart truth, approval state, OAuth state, selected address, or order state.
- Never let the agent directly own checkout.
- Telegram approval callback must include `cartSessionId` and `revision`.
- Reject stale approval callbacks.
- Only `owner` or `flatmate` roles may approve checkout.
- Store sanitized `agent_events` for product-visible state.
- Never log Telegram tokens, OpenAI keys, Sarvam keys, Supabase service keys, Swiggy OAuth tokens, full addresses, payment details, or raw sensitive transcripts.

## 9. Observability And Evaluation

Build observability as part of the feature, not as an afterthought.

- Use OpenAI Agents SDK tracing for agent runs, model calls, structured outputs, tool calls, and custom spans.
- Store sanitized product timeline events in Supabase `agent_events`.
- Correlate runs with `householdId`, `telegramChatId`, `messageEventId`, `agentRunId`, `traceId`, `cartSessionId`, `cartRevision`, `mcpSessionId`, and `swiggyConnectionId`.
- Add evals/fixtures for intent classification, multilingual extraction, checkout safety, stale approvals, duplicate checkout, Swiggy error branches, and MCP tool trajectory.

## 10. Verification Expectations

When implementation changes code, run the narrowest useful checks first, then broader checks.

Expected checks when relevant:

- TypeScript typecheck.
- Unit tests for parsing, state transitions, and Swiggy MCP adapter behavior.
- Contract tests for all local Instamart tools.
- E2E-style test for the Telegram order flow where practical.
- Supabase migration verification and RLS checks for database changes.
- Manual demo checklist for Telegram group onboarding, fake Swiggy connect, voice request, cook reply, cart build, approval, and simulated checkout.

If a check cannot be run, state why and list the exact command the user should run.

## 11. Milestones, Commits, And GitHub

Work milestone by milestone.

- Before coding, read `docs/milestone-tracker.md` and identify the current milestone.
- Plan the next 3-5 concrete steps and how each will be verified.
- Update `docs/milestone-tracker.md` after every meaningful feature, checkpoint, blocker, or verification run.
- Keep tracker updates concise: what changed, what was verified, what remains, and any blocker.
- After a significant milestone, summarize changed files, verification run, and the commit message used or planned.
- Use clear commit messages such as `feat: add telegram onboarding flow`, `test: add instamart contract tests`, or `docs: update milestone tracker`.
- After a significant milestone, commit and push without asking again if the repo has a configured remote and the working tree only contains changes relevant to the milestone.
- Commit only relevant files and push only the intended current branch/remote.
- Do not commit or push if unrelated user changes are present, verification is failing for milestone-related reasons, no remote is configured, credentials are unavailable, or the user explicitly says not to commit/push.
- Record each agent-created commit/push in `docs/milestone-tracker.md`.

## 12. Production-Ready Bias

This MVP should look production-ready even while Swiggy production access is unavailable.

That means:

- Real Telegram bot flow.
- Real Sarvam STT/TTS calls in the demo path.
- Real OpenAI agent runs and traces.
- Real Supabase persistence.
- Fake Swiggy OAuth that mirrors PKCE shape.
- Local Swiggy MCP stub that follows documented contracts.
- HTTPS webhook/OAuth callback shape for production.
- Minimal PII and encrypted token storage.
- Clear QPS/rate-limit/retry posture for Swiggy review.

These guidelines are working if diffs are smaller, assumptions are explicit, docs are checked before integration work, and the end-to-end demo can be trusted.

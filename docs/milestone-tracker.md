# Flatmeal Milestone Tracker

Persistent progress tracker for coding agents. Update this file after every meaningful feature, checkpoint, blocker, verification run, or agent-created commit/push.

## Current Milestone

- **Current:** M1 — TypeScript backend scaffold, environment config, Supabase schema/migrations.
- **Status:** Ready to start.
- **Goal:** Create the production-shaped TypeScript backend foundation without implementing Swiggy tool behavior before contract tests.

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

## In Progress

- M1 is ready to begin:
  - Scaffold Node.js + Express + TypeScript backend.
  - Add environment/config validation for Telegram, OpenAI, Sarvam, Supabase, fake Swiggy OAuth, and local MCP stub.
  - Add test runner and first contract-test placeholders before local Instamart behavior.
  - Add Supabase migration skeleton for MVP state tables.

## Next Tasks

1. Start M1 by scaffolding the TypeScript backend.
2. Add environment/config conventions for Telegram, OpenAI, Sarvam, Supabase, fake Swiggy OAuth, and local MCP stub.
3. Add Supabase schema/migration plan before implementing database access.
4. Add contract-test scaffolding for all 13 Instamart tools from `docs/swiggy-instamart-tool-contracts.md`.
5. Keep local Instamart stub behavior blocked until the relevant contract tests exist.

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

## Commit / Push History

- 2026-05-01: Agent created and pushed a docs-only update on `main` covering the milestone Git workflow in `AGENTS.md`, `docs/new-session-prompt.md`, and this tracker.
- 2026-05-01: Agent created and pushed a docs-only M0 completion update on `main` covering completed Swiggy Instamart per-tool contract gates in `docs/swiggy-instamart-tool-contracts.md` and this tracker.

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

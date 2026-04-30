# Flatmeal Milestone Tracker

Persistent progress tracker for coding agents. Update this file after every meaningful feature, checkpoint, blocker, verification run, or agent-created commit/push.

## Current Milestone

- **Current:** M0 — Docs and Swiggy contract readiness.
- **Status:** In progress.
- **Goal:** Keep the product plan, Swiggy contract rules, agent workflow, and session handoff docs complete enough for autonomous implementation.

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

- None yet.

## In Progress

- M0 docs are being prepared:
  - `AGENTS.md` defines repo-wide coding-agent behavior.
  - `docs/ai-agent-architecture.md` defines backend-managed OpenAI specialist-agent architecture, memory policy, tool exposure, reasoning defaults, observability, and eval requirements.
  - `docs/swiggy-instamart-tool-contracts.md` defines Swiggy contract extraction and implementation gates.
  - `docs/new-session-prompt.md` should be used to start future sessions.

## Next Tasks

1. Confirm M0 docs are complete and internally consistent.
2. Complete/verify Swiggy per-tool contract extraction before implementing local MCP stub behavior.
3. Start M1 by scaffolding the TypeScript backend.
4. Add environment/config conventions for Telegram, OpenAI, Sarvam, Supabase, fake Swiggy OAuth, and local MCP stub.
5. Add Supabase schema/migration plan before implementing database access.

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

## Commit / Push History

- 2026-05-01: Agent created and pushed a docs-only update on `main` covering the milestone Git workflow in `AGENTS.md`, `docs/new-session-prompt.md`, and this tracker.

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

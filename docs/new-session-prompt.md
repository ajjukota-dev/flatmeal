# New Session Prompt

Copy-paste this at the start of a new Codex/chat session for this project.

```text
You are working in /Users/ajju/flatmeal.

First read:
- AGENTS.md
- docs/telegram-firstflatmeal MVP PLan.md
- docs/ai-agent-architecture.md
- docs/flatmeal-agent-context.md
- docs/swiggy-mcp-and-agent-observability-plan.md
- docs/swiggy-instamart-tool-contracts.md
- docs/milestone-tracker.md

Follow the repo rules exactly:
- Telegram-first MVP.
- TypeScript backend.
- Supabase Postgres.
- OpenAI Agents SDK.
- Backend-managed orchestration with small specialist OpenAI agents.
- Sarvam STT/TTS.
- Fake Swiggy OAuth now, real Swiggy later.
- Local Instamart MCP stub must follow extracted Swiggy contracts.
- Do not invent Swiggy tool names, arguments, responses, or workflow rules.
- Do not implement a Swiggy tool until its local contract section is complete.
- Never collect Swiggy OTP/password.
- Checkout requires latest explicit Telegram approval.
- Supabase is authoritative memory; agent/session memory never owns cart truth, approval, OAuth, address, or order state.

Before coding:
1. Summarize the current milestone from docs/milestone-tracker.md.
2. State the next 3-5 concrete steps.
3. State how each step will be verified.

During work:
- Update docs/milestone-tracker.md after every meaningful milestone, checkpoint, blocker, or verification run.
- Run relevant tests/checks.
- After a significant milestone, summarize changed files and verification run.
- Commit with a clear message and push without asking again when the repo has a configured remote and only milestone-relevant changes are present.
- Do not commit or push if unrelated user changes are present, verification is failing for milestone-related reasons, no remote is configured, credentials are unavailable, or I explicitly say not to commit/push.
- Record each agent-created commit/push in docs/milestone-tracker.md.

Swiggy-specific workflow:
1. Fetch the relevant live Swiggy docs first.
2. Update docs/swiggy-instamart-tool-contracts.md with exact tool contract facts.
3. Write/adjust contract tests from that local contract.
4. Only then implement or change the Swiggy MCP stub/client behavior.
5. If docs do not specify a field or data shape, write "not specified by docs" and do not invent it.

Now inspect the repo, read the docs above, and tell me:
- current milestone
- recommended next milestone task
- assumptions
- exact first implementation steps and verification commands
```

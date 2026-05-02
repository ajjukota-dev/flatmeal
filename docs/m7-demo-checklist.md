# M7 Demo Checklist

Use this checklist for the Telegram-first demo rehearsal before M8 recording.

## Preconditions

- Telegram bot is added to the target group and privacy mode is disabled in BotFather.
- Backend is running with a public HTTPS tunnel configured as the Telegram webhook URL.
- Supabase env vars, OpenAI API key, Sarvam API key, Telegram bot token, and encryption secret are set.
- Fake Swiggy OAuth public callback URL points to the same backend.

## Script

1. Add the bot to a Telegram group.
   - Verify: bot posts the setup card and `message_events` records the group update.
2. Select roles from inline buttons: owner, cook, and flatmate.
   - Verify: owner is first-owner-wins, cook language is set, and `household_members` has all roles.
3. Owner taps `Connect Swiggy` and completes fake OAuth.
   - Verify: `swiggy_connections.status = connected` and no OTP/password is collected by Flatmeal.
4. Flatmate sends a voice meal request in the group.
   - Verify: `voice_assets.stt_status = transcribed`, `agent_runs` contains intent and meal extraction, and `agent_events` includes `message_intake`, `voice_transcribed`, and `intent_classified`.
5. Bot sends cook prompt as text plus voice note.
   - Verify: the cook prompt uses the cook language and no checkout/cart action occurs yet.
6. Cook replies with missing items or restock request.
   - Verify: cart build follows `get_addresses -> search_products -> update_cart -> get_cart`, `cart_sessions.revision = 1`, and `agent_events` includes `cart_build_started` and `cart_built`.
7. If prompted, flatmate adds one item during the add-more window.
   - Verify: cart is rebuilt by full replacement, revision increments, and `agent_events` includes `upsell_opened` and `cart_revision_updated`.
8. Flatmate or owner taps the latest approval button.
   - Verify: stale revision buttons are rejected, latest approval records `approval_received`, checkout records `checkout_started` and `checkout_succeeded`, and order tracking records `order_tracking_checked`.
9. Confirm the group receives the order summary.
   - Verify: message includes order ID, total, and tracking status.

## Local Verification Commands

```bash
npm run smoke:m6
npm run smoke:m7
npm test -- src/telegram/message-workflow.test.ts
```

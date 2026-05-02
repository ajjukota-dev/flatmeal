import fixtures from "../evals/m7-fixtures.json" with { type: "json" };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const requiredIntentIds = ["hinglish-cook-restock", "hindi-flatmate-meal", "english-add-more-window"];
const requiredSafetyIds = ["stale-approval-rejected", "duplicate-checkout-rejected", "latest-owner-approval-checks-out"];
const requiredErrorIds = ["auth-401-reconnect", "checkout-uncertain-get-orders", "domain-failure-surface"];
const requiredEvents = [
  "message_intake",
  "voice_transcribed",
  "intent_classified",
  "cart_build_started",
  "cart_built",
  "upsell_opened",
  "cart_revision_updated",
  "cart_approval_requested",
  "approval_received",
  "approval_rejected",
  "checkout_started",
  "checkout_succeeded",
  "order_tracking_checked",
];

for (const id of requiredIntentIds) {
  assert(fixtures.intentExtraction.some((item) => item.id === id), `Missing intent fixture ${id}`);
}

for (const id of requiredSafetyIds) {
  assert(fixtures.cartSafety.some((item) => item.id === id), `Missing cart safety fixture ${id}`);
}

for (const id of requiredErrorIds) {
  assert(fixtures.swiggyErrorBranches.some((item) => item.id === id), `Missing Swiggy error fixture ${id}`);
}

for (const event of requiredEvents) {
  assert(fixtures.expectedAgentEvents.includes(event), `Missing expected agent event ${event}`);
}

assert(
  fixtures.cartSafety.some((item) => item.expectedCheckout === false && item.expectedEvent === "approval_rejected"),
  "Cart safety fixtures must include rejected approval coverage",
);
assert(
  fixtures.swiggyErrorBranches.some((item) => item.tool === "checkout" && item.expectedToolBeforeRetry === "get_orders"),
  "Swiggy fixtures must cover get_orders before retrying uncertain checkout",
);

console.log("PASS M7 fixtures: multilingual extraction, cart safety, Swiggy error branches, and event coverage are present");

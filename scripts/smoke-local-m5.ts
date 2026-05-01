import type { Agent } from "@openai/agents";
import { INSTAMART_TOOL_NAMES } from "../src/instamart/contract-tools.js";
import { LocalInstamartMcpStub } from "../src/instamart/local-mcp-stub.js";
import {
  OpenAISpecialistAgents,
  type SpecialistAgentRunOptions,
  type StructuredAgentRunner,
} from "../src/agents/specialists.js";

type AnyStructuredAgent = Agent<any, any>;

type ToolEnvelope =
  | { success: true; data: Record<string, unknown>; message?: string }
  | { success: false; error: { message: string } };

class SmokeRunner implements StructuredAgentRunner {
  readonly calls: Array<{ agentName: string; input: string; options: SpecialistAgentRunOptions }> = [];

  async run<TOutput>(agent: AnyStructuredAgent, input: string, options: SpecialistAgentRunOptions): Promise<TOutput> {
    this.calls.push({ agentName: agent.name, input, options });

    const outputs: Record<string, unknown> = {
      message_intent_agent: {
        intent: "flatmate_meal_request",
        confidence: 0.9,
        language: "hinglish",
        reason: "Smoke input asks for dinner.",
        requiresClarification: false,
      },
      meal_request_agent: {
        dish: "dal chawal",
        servings: 3,
        mealTime: "dinner",
        spiceLevel: "medium",
        notes: [],
      },
      cook_prompt_agent: {
        text: "Dal chawal banana hai. Missing items bata do.",
        language: "hinglish",
        voiceRequired: true,
        targetTelegramUserId: "cook_telegram_1",
      },
      missing_items_agent: {
        items: [{ name: "rice", quantity: 1, unit: "kg", confidence: 0.9 }],
        requiresClarification: false,
      },
      cart_planner_agent: {
        addressId: "addr_home",
        items: [{ requestedName: "rice", searchQuery: "rice", selectedSpinId: "spin_rice_1kg", quantity: 1 }],
      },
    };

    return outputs[agent.name] as TOutput;
  }
}

const expectedTools = [
  "create_address",
  "delete_address",
  "get_addresses",
  "search_products",
  "your_go_to_items",
  "clear_cart",
  "get_cart",
  "update_cart",
  "checkout",
  "get_order_details",
  "get_orders",
  "track_order",
  "report_error",
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function success(result: ToolEnvelope, label: string): Record<string, unknown> {
  assert(result.success, `${label} failed: ${result.success ? "" : result.error.message}`);
  return result.data;
}

function failure(result: ToolEnvelope, label: string): string {
  assert(!result.success, `${label} unexpectedly succeeded`);
  return result.error.message;
}

async function smokeInstamartTrajectory(): Promise<void> {
  assert(JSON.stringify(INSTAMART_TOOL_NAMES) === JSON.stringify(expectedTools), "Instamart tool names changed unexpectedly");

  const stub = new LocalInstamartMcpStub();
  const listedTools = stub.listTools().map((tool) => tool.name);
  assert(JSON.stringify(listedTools) === JSON.stringify(expectedTools), "Instamart listTools order changed unexpectedly");

  const context = { accessToken: "smoke_fake_swiggy_token" };
  const call = (name: string, args: Record<string, unknown> = {}, extraContext: Record<string, unknown> = {}) =>
    stub.callTool({ name, arguments: args, context: { ...context, ...extraContext } });

  const addresses = success(await call("get_addresses"), "get_addresses").addresses as Array<{ id: string }>;
  assert(addresses[0]?.id === "addr_home", "get_addresses did not return the seeded address");

  const search = success(await call("search_products", { addressId: "addr_home", query: "rice" }), "search_products");
  const products = search.products as Array<{ variants: Array<{ spinId: string }> }>;
  const spinId = products[0]?.variants[0]?.spinId;
  assert(spinId === "spin_rice_1kg", "search_products did not expose the expected spinId");

  const cart = success(
    await call("update_cart", {
      selectedAddressId: "addr_home",
      items: [{ spinId, quantity: 1 }],
    }),
    "update_cart",
  );
  assert((cart.items as unknown[]).length === 1, "update_cart did not replace the cart with one item");

  const readCart = success(await call("get_cart"), "get_cart");
  assert((readCart.availablePaymentMethods as string[]).includes("COD"), "get_cart did not expose COD as the local payment method");

  const missingApproval = failure(await call("checkout", { addressId: "addr_home", paymentMethod: "COD" }), "checkout without approval");
  assert(missingApproval.includes("latest explicit Telegram approval"), "checkout did not enforce approval");

  const staleApproval = failure(
    await call("checkout", { addressId: "addr_home", paymentMethod: "COD" }, { checkoutApproval: { revision: 0, latestRevision: 1 } }),
    "checkout with stale approval",
  );
  assert(staleApproval.includes("stale"), "checkout did not reject stale approval");

  const checkout = success(
    await call("checkout", { addressId: "addr_home", paymentMethod: "COD" }, { checkoutApproval: { revision: 1, latestRevision: 1 } }),
    "checkout",
  );
  const orderId = (checkout.orders as Array<{ orderId: string }>)[0]?.orderId;
  assert(typeof orderId === "string" && orderId.startsWith("IM-"), "checkout did not return a local orderId");

  const tracking = success(await call("track_order", { orderId, lat: 12.9716, lng: 77.6412 }), "track_order");
  assert((tracking.tracking as { orderId: string }).orderId === orderId, "track_order did not return the checked-out order");
}

async function smokeAgents(): Promise<void> {
  const runner = new SmokeRunner();
  const agents = new OpenAISpecialistAgents({ runner });

  await agents.classifyMessage(
    { text: "Aaj dinner ke liye dal chawal bana do", senderRole: "flatmate", activeWorkflow: "idle" },
    { householdId: "household_smoke", telegramChatId: "telegram_chat_smoke", messageEventId: "message_smoke", traceId: "trace_smoke" },
  );
  await agents.extractMealRequest({ text: "3 log ke liye dal chawal" });
  await agents.createCookPrompt({
    mealRequest: { dish: "dal chawal", servings: 3, notes: [] },
    cookLanguage: "hinglish",
    targetTelegramUserId: "cook_telegram_1",
  });
  await agents.extractMissingItems({ text: "rice khatam hai" });
  await agents.planCart({
    addressId: "addr_home",
    missingItems: [{ name: "rice", quantity: 1, unit: "kg", confidence: 0.9 }],
    candidateProducts: [{ variants: [{ spinId: "spin_rice_1kg" }] }],
  });

  assert(
    JSON.stringify(runner.calls.map((call) => call.agentName)) ===
      JSON.stringify(["message_intent_agent", "meal_request_agent", "cook_prompt_agent", "missing_items_agent", "cart_planner_agent"]),
    "OpenAI specialist wrapper did not invoke the expected specialist sequence",
  );
  assert(runner.calls.every((call) => call.options.maxTurns === 1), "OpenAI specialist runs must remain single-turn");
  assert(runner.calls.every((call) => call.options.traceIncludeSensitiveData === false), "OpenAI tracing must exclude sensitive data");
}

await smokeInstamartTrajectory();
console.log("PASS local Instamart MCP trajectory: addresses -> search_products -> update_cart -> get_cart -> checkout gate -> checkout -> track_order");

await smokeAgents();
console.log("PASS local OpenAI specialist wrapper: deterministic runner invoked all M5 specialist phases with backend-owned trace settings");

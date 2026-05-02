import type { Agent } from "@openai/agents";
import { OpenAISpecialistAgents, type SpecialistAgentRunOptions, type StructuredAgentRunner } from "../src/agents/specialists.js";
import { encryptSecret } from "../src/crypto/secrets.js";
import { LocalInstamartMcpStub } from "../src/instamart/local-mcp-stub.js";
import type {
  AgentEventInsert,
  AgentRunInsert,
  CartItemInsert,
  OrderInsert,
  StoredCartItem,
  StoredCartSession,
  StoredCookMember,
  StoredHouseholdChat,
  StoredHouseholdMember,
  StoredSwiggyConnection,
  StoredTelegramUser,
  TelegramOnboardingRepository,
  VoiceAssetInsert,
  MessageEventInsert,
} from "../src/telegram/repository.js";
import { TelegramMessageWorkflowService } from "../src/telegram/message-workflow.js";
import type { CookLanguage, HouseholdRole, TelegramChat, TelegramMessage, TelegramUser } from "../src/telegram/types.js";
import type {
  SpeechToTextProvider,
  TextToSpeechInput,
  TextToSpeechProvider,
  TextToSpeechResult,
  TranscribeAudioInput,
  TranscriptionResult,
} from "../src/speech/types.js";

type AnyStructuredAgent = Agent<any, any>;

class SmokeRunner implements StructuredAgentRunner {
  readonly calls: string[] = [];

  private readonly outputs: Record<string, unknown[]> = {
    message_intent_agent: [
      {
        intent: "cook_restock_request",
        confidence: 0.9,
        language: "hinglish",
        reason: "Cook reported missing grocery.",
        requiresClarification: false,
      },
      {
        intent: "flatmate_cart_addition",
        confidence: 0.95,
        language: "hinglish",
        reason: "Flatmate added grocery during add-more.",
        requiresClarification: false,
      },
    ],
    missing_items_agent: [
      { items: [{ name: "chicken", quantity: 1, unit: "pack", confidence: 0.9 }], requiresClarification: false },
    ],
    cart_addition_agent: [
      { items: [{ name: "milk", quantity: 1, unit: "l", confidence: 0.9 }], requiresClarification: false },
    ],
    cart_planner_agent: [
      {
        addressId: "addr_home",
        items: [{ requestedName: "chicken", searchQuery: "chicken", selectedSpinId: "spin_chicken_500g", quantity: 1 }],
      },
      {
        addressId: "addr_home",
        items: [{ requestedName: "milk", searchQuery: "milk", selectedSpinId: "spin_milk_1l", quantity: 1 }],
      },
    ],
  };

  async run<TOutput>(agent: AnyStructuredAgent, _input: string, _options: SpecialistAgentRunOptions): Promise<TOutput> {
    this.calls.push(agent.name);
    const output = this.outputs[agent.name]?.shift();
    if (!output) {
      throw new Error(`No smoke output configured for ${agent.name}`);
    }
    return output as TOutput;
  }
}

class SmokeSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  async transcribe(_input: TranscribeAudioInput): Promise<TranscriptionResult> {
    return { requestId: "unused", transcript: "", languageCode: null };
  }

  async synthesize(_input: TextToSpeechInput): Promise<TextToSpeechResult> {
    return { requestId: "unused", audioBase64: "", audio: Buffer.from("") };
  }
}

class SmokeRepository implements TelegramOnboardingRepository {
  readonly connection: StoredSwiggyConnection;
  readonly cartSessions: StoredCartSession[] = [];
  cartItems: StoredCartItem[] = [];
  orders: OrderInsert[] = [];
  agentRuns: Array<AgentRunInsert & { id: string }> = [];
  agentEvents: AgentEventInsert[] = [];

  constructor(encryptionSecret: string) {
    this.connection = {
      id: "swiggy-connection-smoke",
      encryptedAccessToken: encryptSecret("fake-swiggy-smoke-token", encryptionSecret),
    };
  }

  async recordMessageEvent(_input: MessageEventInsert): Promise<{ id?: string; duplicate: boolean }> {
    return { id: "message-event-smoke", duplicate: false };
  }

  async recordAgentEvent(input: AgentEventInsert): Promise<void> {
    this.agentEvents.push(input);
  }

  async ensureHouseholdForChat(chat: TelegramChat): Promise<StoredHouseholdChat> {
    return { id: "chat-smoke", householdId: `household-${chat.id}`, telegramChatId: String(chat.id) };
  }

  async upsertTelegramUser(user: TelegramUser): Promise<StoredTelegramUser> {
    return { id: `user-${user.id}`, telegramUserId: String(user.id) };
  }

  async findOwnerMember(_householdId: string): Promise<StoredHouseholdMember | null> {
    return null;
  }

  async findHouseholdMember(_input: { householdId: string; telegramUserId: string }): Promise<StoredHouseholdMember | null> {
    return null;
  }

  async upsertHouseholdMember(input: { householdId: string; telegramUserId: string; role: HouseholdRole }): Promise<StoredHouseholdMember> {
    return { id: "member-smoke", ...input };
  }

  async setCookLanguage(_input: { householdMemberId: string; language: CookLanguage }): Promise<void> {}

  async findCookForHousehold(_householdId: string): Promise<StoredCookMember | null> {
    return null;
  }

  async recordVoiceAsset(_input: VoiceAssetInsert): Promise<{ id: string }> {
    return { id: "voice-smoke" };
  }

  async markVoiceAssetTranscribed(_input: { id: string; transcript: string; languageCode?: string | null }): Promise<void> {}

  async markVoiceAssetFailed(_input: { id: string }): Promise<void> {}

  async createAgentRun(input: AgentRunInsert): Promise<{ id: string }> {
    const run = { ...input, id: `agent-run-${this.agentRuns.length + 1}` };
    this.agentRuns.push(run);
    return { id: run.id };
  }

  async completeAgentRun(_input: { id: string; intent?: string; sanitizedOutput: Record<string, unknown> }): Promise<void> {}

  async failAgentRun(_input: { id: string; errorSummary: string }): Promise<void> {}

  async findActiveSwiggyConnection(_householdId: string): Promise<StoredSwiggyConnection | null> {
    return this.connection;
  }

  async createCartSession(input: {
    householdId: string;
    swiggyConnectionId: string;
    selectedAddressId: string;
  }): Promise<StoredCartSession> {
    const session: StoredCartSession = {
      id: "cart-smoke",
      householdId: input.householdId,
      swiggyConnectionId: input.swiggyConnectionId,
      status: "building",
      revision: 1,
      selectedAddressId: input.selectedAddressId,
    };
    this.cartSessions.push(session);
    return session;
  }

  async replaceCartItems(input: { cartSessionId: string; revision: number; items: CartItemInsert[] }): Promise<void> {
    this.cartItems = this.cartItems.filter((item) => item.cartSessionId !== input.cartSessionId || item.revision !== input.revision);
    this.cartItems.push(...input.items.map((item) => ({ ...item, cartSessionId: input.cartSessionId, revision: input.revision })));
  }

  async findCartItems(input: { cartSessionId: string; revision: number }): Promise<StoredCartItem[]> {
    return this.cartItems.filter((item) => item.cartSessionId === input.cartSessionId && item.revision === input.revision);
  }

  async openCartUpsellWindow(input: { cartSessionId: string; revision: number; expiresAt: Date }): Promise<void> {
    const session = this.cartSessions.find((candidate) => candidate.id === input.cartSessionId && candidate.revision === input.revision);
    if (session) {
      session.status = "upsell_open";
      session.expiresAt = input.expiresAt.toISOString();
    }
  }

  async moveCartToRevision(input: {
    cartSessionId: string;
    expectedRevision: number;
    nextRevision: number;
    status: StoredCartSession["status"];
  }): Promise<StoredCartSession | null> {
    const session = this.cartSessions.find((candidate) => candidate.id === input.cartSessionId && candidate.revision === input.expectedRevision);
    if (!session) {
      return null;
    }
    session.revision = input.nextRevision;
    session.status = input.status;
    session.expiresAt = null;
    return session;
  }

  async markCartApprovalPending(input: { cartSessionId: string; revision: number }): Promise<void> {
    const session = this.cartSessions.find((candidate) => candidate.id === input.cartSessionId && candidate.revision === input.revision);
    if (session) {
      session.status = "approval_pending";
    }
  }

  async findCartSession(cartSessionId: string): Promise<StoredCartSession | null> {
    return this.cartSessions.find((session) => session.id === cartSessionId) ?? null;
  }

  async findActiveCartSession(householdId: string): Promise<StoredCartSession | null> {
    return this.cartSessions.find((session) => session.householdId === householdId && ["building", "upsell_open", "approval_pending"].includes(session.status)) ?? null;
  }

  async approveCartSession(input: { cartSessionId: string; revision: number; approvedByMemberId: string }): Promise<StoredCartSession | null> {
    const session = this.cartSessions.find((candidate) => candidate.id === input.cartSessionId && candidate.revision === input.revision && candidate.status === "approval_pending");
    if (!session) {
      return null;
    }
    session.status = "approved";
    return session;
  }

  async markCartCheckedOut(cartSessionId: string): Promise<void> {
    const session = this.cartSessions.find((candidate) => candidate.id === cartSessionId);
    if (session) {
      session.status = "checked_out";
    }
  }

  async recordOrder(input: OrderInsert): Promise<{ id: string }> {
    this.orders.push(input);
    return { id: `order-row-${this.orders.length}` };
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function textMessage(text: string, fromId: number): TelegramMessage {
  return { message_id: fromId, chat: { id: -100, type: "supergroup" }, from: { id: fromId }, text };
}

const encryptionSecret = "m6-smoke-secret";
const repository = new SmokeRepository(encryptionSecret);
const runner = new SmokeRunner();
const speech = new SmokeSpeechProvider();
const workflow = new TelegramMessageWorkflowService(
  repository,
  new OpenAISpecialistAgents({ runner }),
  speech,
  speech,
  { async downloadVoice() { throw new Error("voice not used in M6 smoke"); } },
  { instamartClient: new LocalInstamartMcpStub(), encryptionSecret },
);
const chat: StoredHouseholdChat = { id: "chat-smoke", householdId: "household-smoke", telegramChatId: "-100" };

const addMoreActions = await workflow.handleMessage({
  chat,
  member: { id: "member-cook", householdId: "household-smoke", telegramUserId: "cook", role: "cook" },
  messageEventId: "message-cook",
  message: textMessage("chicken nahi hai", 1),
});
assert(addMoreActions[0]?.type === "send_text_message", "Cook restock did not open add-more text action");
assert(repository.cartSessions[0]?.status === "upsell_open", "Cart did not enter upsell_open");

const approvalActions = await workflow.handleMessage({
  chat,
  member: { id: "member-flatmate", householdId: "household-smoke", telegramUserId: "flatmate", role: "flatmate" },
  messageEventId: "message-flatmate",
  message: textMessage("milk bhi add kar do", 2),
});
assert(approvalActions[0]?.type === "send_cart_approval_card", "Flatmate addition did not produce approval card");
assert(approvalActions[0].revision === 2, "Approval card did not advance to revision 2");
assert(repository.cartItems.filter((item) => item.revision === 2).length === 2, "Revision 2 cart does not contain full replacement items");

const checkoutActions = await workflow.handleCartApproval({
  chat,
  member: { id: "member-owner", householdId: "household-smoke", telegramUserId: "owner", role: "owner" },
  callbackQueryId: "callback-smoke",
  cartSessionId: "cart-smoke",
  revision: 2,
});
assert(checkoutActions.some((action) => action.type === "send_text_message"), "Approval did not send order confirmation");
const checkedOutSession: StoredCartSession | undefined = repository.cartSessions[0];
assert(checkedOutSession?.status === "checked_out", "Cart did not move to checked_out after approval");
assert(repository.orders[0]?.swiggyOrderId?.startsWith("IM-"), "Checkout did not persist a local Instamart order");
assert(
  JSON.stringify(repository.agentEvents.map((event) => event.eventType)) === JSON.stringify([
    "message_intake",
    "intent_classified",
    "agent_run_completed",
    "cart_build_started",
    "agent_run_completed",
    "cart_built",
    "upsell_opened",
    "message_intake",
    "intent_classified",
    "agent_run_completed",
    "agent_run_completed",
    "cart_revision_updated",
    "cart_approval_requested",
    "approval_received",
    "checkout_started",
    "checkout_succeeded",
    "order_tracking_checked",
  ]),
  "M7 agent event trajectory changed unexpectedly",
);

assert(
  JSON.stringify(runner.calls) === JSON.stringify([
    "message_intent_agent",
    "missing_items_agent",
    "cart_planner_agent",
    "message_intent_agent",
    "cart_addition_agent",
    "cart_planner_agent",
  ]),
  "M6 smoke specialist sequence changed unexpectedly",
);

console.log("PASS local M6 flow: cook restock -> add-more window -> flatmate addition -> revisioned owner approval -> guarded checkout");

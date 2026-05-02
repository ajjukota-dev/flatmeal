import type { Agent } from "@openai/agents";
import { describe, expect, it } from "vitest";
import { OpenAISpecialistAgents, type SpecialistAgentRunOptions, type StructuredAgentRunner } from "../agents/specialists.js";
import { encryptSecret } from "../crypto/secrets.js";
import { LocalInstamartMcpStub } from "../instamart/local-mcp-stub.js";
import type {
  SpeechToTextProvider,
  TextToSpeechInput,
  TextToSpeechProvider,
  TextToSpeechResult,
  TranscribeAudioInput,
  TranscriptionResult,
} from "../speech/types.js";
import { TelegramMessageWorkflowService, type TelegramVoiceDownloader } from "./message-workflow.js";
import type {
  AgentEventInsert,
  AgentRunInsert,
  CartItemInsert,
  MessageEventInsert,
  OrderInsert,
  StoredCartSession,
  StoredCookMember,
  StoredHouseholdChat,
  StoredHouseholdMember,
  StoredSwiggyConnection,
  StoredTelegramUser,
  TelegramOnboardingRepository,
  VoiceAssetInsert,
} from "./repository.js";
import type { CookLanguage, HouseholdRole, TelegramChat, TelegramMessage, TelegramUser } from "./types.js";

type AnyStructuredAgent = Agent<any, any>;

class FakeRunner implements StructuredAgentRunner {
  readonly calls: Array<{ agentName: string; input: string; options: SpecialistAgentRunOptions }> = [];

  constructor(private readonly outputs: unknown[]) {}

  async run<TOutput>(agent: AnyStructuredAgent, input: string, options: SpecialistAgentRunOptions): Promise<TOutput> {
    this.calls.push({ agentName: agent.name, input, options });
    return this.outputs.shift() as TOutput;
  }
}

class FakeSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  transcriptions: TranscriptionResult[] = [];
  syntheses: TextToSpeechInput[] = [];

  async transcribe(_input: TranscribeAudioInput): Promise<TranscriptionResult> {
    return this.transcriptions.shift() ?? { requestId: "stt-1", transcript: "", languageCode: null };
  }

  async synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    this.syntheses.push(input);
    return {
      requestId: "tts-1",
      audioBase64: Buffer.from("voice").toString("base64"),
      audio: Buffer.from("voice"),
    };
  }
}

class FakeVoiceDownloader implements TelegramVoiceDownloader {
  downloads: string[] = [];

  async downloadVoice(fileId: string) {
    this.downloads.push(fileId);
    return {
      file: { file_id: fileId, file_unique_id: "voice-unique", file_path: "voice/file_1.oga" },
      filename: "file_1.oga",
      data: Buffer.from("voice-bytes"),
    };
  }
}

class FakeRepository implements TelegramOnboardingRepository {
  cook: StoredCookMember | null = {
    memberId: "member-cook",
    telegramUserRowId: "user-cook-row",
    telegramUserId: "777",
    preferredLanguage: "hinglish",
  };
  voiceAssets: Array<{ id: string; telegramFileId: string; status: string; transcript?: string; languageCode?: string | null }> = [];
  agentRuns: Array<AgentRunInsert & { id: string; status: string; sanitizedOutput?: Record<string, unknown>; intent?: string }> = [];
  agentEvents: AgentEventInsert[] = [];
  swiggyConnection: StoredSwiggyConnection | null = null;
  cartSessions: StoredCartSession[] = [];
  cartItems: Array<CartItemInsert & { cartSessionId: string; revision: number }> = [];
  orders: OrderInsert[] = [];

  async recordMessageEvent(_input: MessageEventInsert): Promise<{ id?: string; duplicate: boolean }> {
    return { id: "message-event-1", duplicate: false };
  }

  async recordAgentEvent(input: AgentEventInsert): Promise<void> {
    this.agentEvents.push(input);
  }

  async ensureHouseholdForChat(chat: TelegramChat): Promise<StoredHouseholdChat> {
    return { id: "chat-row", householdId: `household-${chat.id}`, telegramChatId: String(chat.id) };
  }

  async upsertTelegramUser(user: TelegramUser): Promise<StoredTelegramUser> {
    return { id: `user-row-${user.id}`, telegramUserId: String(user.id) };
  }

  async findOwnerMember(_householdId: string): Promise<StoredHouseholdMember | null> {
    return null;
  }

  async findHouseholdMember(_input: { householdId: string; telegramUserId: string }): Promise<StoredHouseholdMember | null> {
    return null;
  }

  async upsertHouseholdMember(input: { householdId: string; telegramUserId: string; role: HouseholdRole }): Promise<StoredHouseholdMember> {
    return { id: "member-1", ...input };
  }

  async setCookLanguage(_input: { householdMemberId: string; language: CookLanguage }): Promise<void> {}

  async findCookForHousehold(_householdId: string): Promise<StoredCookMember | null> {
    return this.cook;
  }

  async recordVoiceAsset(input: VoiceAssetInsert): Promise<{ id: string }> {
    const asset = {
      id: `voice-asset-${this.voiceAssets.length + 1}`,
      telegramFileId: input.telegramFileId,
      status: "pending",
    };
    this.voiceAssets.push(asset);
    return { id: asset.id };
  }

  async markVoiceAssetTranscribed(input: { id: string; transcript: string; languageCode?: string | null }): Promise<void> {
    const asset = this.voiceAssets.find((candidate) => candidate.id === input.id);
    if (asset) {
      asset.status = "transcribed";
      asset.transcript = input.transcript;
      asset.languageCode = input.languageCode;
    }
  }

  async markVoiceAssetFailed(input: { id: string }): Promise<void> {
    const asset = this.voiceAssets.find((candidate) => candidate.id === input.id);
    if (asset) {
      asset.status = "failed";
    }
  }

  async createAgentRun(input: AgentRunInsert): Promise<{ id: string }> {
    const run = { ...input, id: `agent-run-${this.agentRuns.length + 1}`, status: "started" };
    this.agentRuns.push(run);
    return { id: run.id };
  }

  async completeAgentRun(input: { id: string; intent?: string; sanitizedOutput: Record<string, unknown> }): Promise<void> {
    const run = this.agentRuns.find((candidate) => candidate.id === input.id);
    if (run) {
      run.status = "succeeded";
      run.intent = input.intent;
      run.sanitizedOutput = input.sanitizedOutput;
    }
  }

  async failAgentRun(input: { id: string; errorSummary: string }): Promise<void> {
    const run = this.agentRuns.find((candidate) => candidate.id === input.id);
    if (run) {
      run.status = "failed";
      run.sanitizedOutput = { errorSummary: input.errorSummary };
    }
  }

  async findActiveSwiggyConnection(_householdId: string): Promise<StoredSwiggyConnection | null> {
    return this.swiggyConnection;
  }

  async createCartSession(input: {
    householdId: string;
    swiggyConnectionId: string;
    selectedAddressId: string;
  }): Promise<StoredCartSession> {
    const session: StoredCartSession = {
      id: `cart-${this.cartSessions.length + 1}`,
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
    this.cartItems = this.cartItems.filter(
      (item) => item.cartSessionId !== input.cartSessionId || item.revision !== input.revision,
    );
    this.cartItems.push(...input.items.map((item) => ({ ...item, cartSessionId: input.cartSessionId, revision: input.revision })));
  }

  async findCartItems(input: { cartSessionId: string; revision: number }) {
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
    const session = this.cartSessions.find(
      (candidate) => candidate.id === input.cartSessionId && candidate.revision === input.expectedRevision,
    );
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
    return this.cartSessions.find(
      (session) => session.householdId === householdId && ["building", "upsell_open", "approval_pending"].includes(session.status),
    ) ?? null;
  }

  async approveCartSession(input: { cartSessionId: string; revision: number; approvedByMemberId: string }): Promise<StoredCartSession | null> {
    const session = this.cartSessions.find(
      (candidate) =>
        candidate.id === input.cartSessionId && candidate.revision === input.revision && candidate.status === "approval_pending",
    );
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

const chat: StoredHouseholdChat = { id: "chat-row", householdId: "household-1", telegramChatId: "-100" };

describe("TelegramMessageWorkflowService", () => {
  it("classifies flatmate text, creates a cook prompt, synthesizes voice, and records agent runs", async () => {
    const repository = new FakeRepository();
    const speech = new FakeSpeechProvider();
    const runner = new FakeRunner([
      {
        intent: "flatmate_meal_request",
        confidence: 0.93,
        language: "hinglish",
        reason: "Flatmate requested dinner.",
        requiresClarification: false,
      },
      { dish: "dal chawal", servings: 3, mealTime: "dinner", spiceLevel: "medium", notes: [] },
      {
        text: "Dal chawal banana hai. Missing items bata do.",
        language: "hinglish",
        voiceRequired: true,
        targetTelegramUserId: "777",
      },
    ]);
    const workflow = new TelegramMessageWorkflowService(
      repository,
      new OpenAISpecialistAgents({ runner }),
      speech,
      speech,
      new FakeVoiceDownloader(),
    );

    const actions = await workflow.handleMessage({
      chat,
      member: { id: "member-flatmate", householdId: "household-1", telegramUserId: "user-flatmate", role: "flatmate" },
      messageEventId: "message-event-1",
      message: textMessage("Aaj dinner ke liye dal chawal bana do"),
    });

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      type: "send_text_message",
      chatId: "-100",
      text: "Dal chawal banana hai. Missing items bata do.",
    });
    expect(actions[1]).toMatchObject({
      type: "send_voice_note",
      chatId: "-100",
      filename: "cook_prompt.ogg",
      caption: "Cook prompt",
    });
    expect(speech.syntheses).toEqual([
      {
        text: "Dal chawal banana hai. Missing items bata do.",
        targetLanguageCode: "hi-IN",
        outputAudioCodec: "opus",
      },
    ]);
    expect(repository.agentRuns.map((run) => [run.agentName, run.status, run.intent])).toEqual([
      ["message_intent_agent", "succeeded", "flatmate_meal_request"],
      ["meal_request_agent", "succeeded", undefined],
      ["cook_prompt_agent", "succeeded", undefined],
    ]);
    expect(repository.agentEvents.map((event) => event.eventType)).toEqual([
      "message_intake",
      "intent_classified",
      "agent_run_completed",
      "agent_run_completed",
    ]);
    expect(runner.calls.every((call) => call.options.traceIncludeSensitiveData === false)).toBe(true);
  });

  it("downloads voice, stores STT transcript, extracts cook missing items, and stops before cart build when M6 is not configured", async () => {
    const repository = new FakeRepository();
    const speech = new FakeSpeechProvider();
    speech.transcriptions.push({ requestId: "stt-1", transcript: "chawal khatam hai", languageCode: "hi-IN" });
    const voiceDownloader = new FakeVoiceDownloader();
    const runner = new FakeRunner([
      {
        intent: "cook_restock_request",
        confidence: 0.88,
        language: "hinglish",
        reason: "Cook reported missing grocery.",
        requiresClarification: false,
      },
      { items: [{ name: "rice", quantity: 1, unit: "kg", confidence: 0.9 }], requiresClarification: false },
    ]);
    const workflow = new TelegramMessageWorkflowService(
      repository,
      new OpenAISpecialistAgents({ runner }),
      speech,
      speech,
      voiceDownloader,
    );

    const actions = await workflow.handleMessage({
      chat,
      member: { id: "member-cook", householdId: "household-1", telegramUserId: "user-cook", role: "cook" },
      messageEventId: "message-event-2",
      message: {
        message_id: 11,
        chat: { id: -100, type: "group" },
        from: { id: 777 },
        voice: { file_id: "voice-file-1" },
      },
    });

    expect(voiceDownloader.downloads).toEqual(["voice-file-1"]);
    expect(repository.voiceAssets).toEqual([
      {
        id: "voice-asset-1",
        telegramFileId: "voice-file-1",
        status: "transcribed",
        transcript: "chawal khatam hai",
        languageCode: "hi-IN",
      },
    ]);
    expect(actions).toEqual([
      {
        type: "send_text_message",
        chatId: "-100",
        text: "Noted missing items: rice. Cart build is next.",
      },
    ]);
    expect(repository.agentRuns.map((run) => run.agentName)).toEqual(["message_intent_agent", "missing_items_agent"]);
    expect(repository.agentEvents.map((event) => event.eventType)).toEqual([
      "message_intake",
      "voice_transcribed",
      "intent_classified",
      "agent_run_completed",
    ]);
  });

  it("builds a revisioned Instamart cart from cook missing items and sends approval card", async () => {
    const repository = new FakeRepository();
    const encryptionSecret = "m6-secret";
    repository.swiggyConnection = {
      id: "swiggy-connection-1",
      encryptedAccessToken: encryptSecret("fake-swiggy-token", encryptionSecret),
    };
    const speech = new FakeSpeechProvider();
    const runner = new FakeRunner([
      {
        intent: "cook_restock_request",
        confidence: 0.91,
        language: "hinglish",
        reason: "Cook reported missing grocery.",
        requiresClarification: false,
      },
      { items: [{ name: "rice", quantity: 1, unit: "kg", confidence: 0.9 }], requiresClarification: false },
      {
        addressId: "addr_home",
        items: [{ requestedName: "rice", searchQuery: "rice", selectedSpinId: "spin_rice_1kg", quantity: 1 }],
      },
    ]);
    const workflow = new TelegramMessageWorkflowService(
      repository,
      new OpenAISpecialistAgents({ runner }),
      speech,
      speech,
      new FakeVoiceDownloader(),
      { instamartClient: new LocalInstamartMcpStub(), encryptionSecret },
    );

    const actions = await workflow.handleMessage({
      chat,
      member: { id: "member-cook", householdId: "household-1", telegramUserId: "user-cook", role: "cook" },
      messageEventId: "message-event-3",
      message: textMessage("chawal khatam hai"),
    });

    expect(actions).toEqual([
      expect.objectContaining({
        type: "send_cart_approval_card",
        chatId: "-100",
        cartSessionId: "cart-1",
        revision: 1,
        text: expect.stringContaining("Instamart cart revision 1"),
      }),
    ]);
    expect(repository.cartSessions[0]).toMatchObject({
      id: "cart-1",
      status: "approval_pending",
      selectedAddressId: "addr_home",
    });
    expect(repository.cartItems).toEqual([
      expect.objectContaining({
        cartSessionId: "cart-1",
        revision: 1,
        requestedName: "rice",
        selectedProductName: "Sona Masoori Rice 1 kg",
        spinId: "spin_rice_1kg",
        quantity: 1,
      }),
    ]);
    expect(repository.agentRuns.map((run) => run.agentName)).toEqual([
      "message_intent_agent",
      "missing_items_agent",
      "cart_planner_agent",
    ]);
    expect(repository.agentEvents.map((event) => event.eventType)).toEqual([
      "message_intake",
      "intent_classified",
      "agent_run_completed",
      "cart_build_started",
      "agent_run_completed",
      "cart_built",
      "cart_approval_requested",
    ]);
    expect(repository.agentEvents.at(-1)).toMatchObject({
      cartSessionId: "cart-1",
      sanitizedPayload: expect.objectContaining({ revision: 1 }),
    });
  });

  it("opens one add-more window and rebuilds a full replacement cart at the next revision", async () => {
    const repository = new FakeRepository();
    const encryptionSecret = "m6-secret";
    repository.swiggyConnection = {
      id: "swiggy-connection-1",
      encryptedAccessToken: encryptSecret("fake-swiggy-token", encryptionSecret),
    };
    const speech = new FakeSpeechProvider();
    const runner = new FakeRunner([
      {
        intent: "cook_restock_request",
        confidence: 0.91,
        language: "hinglish",
        reason: "Cook reported missing grocery.",
        requiresClarification: false,
      },
      { items: [{ name: "chicken", quantity: 1, unit: "pack", confidence: 0.9 }], requiresClarification: false },
      {
        addressId: "addr_home",
        items: [{ requestedName: "chicken", searchQuery: "chicken", selectedSpinId: "spin_chicken_500g", quantity: 1 }],
      },
      {
        intent: "flatmate_cart_addition",
        confidence: 0.95,
        language: "hinglish",
        reason: "Flatmate added one more grocery during add-more window.",
        requiresClarification: false,
      },
      { items: [{ name: "milk", quantity: 1, unit: "l", confidence: 0.9 }], requiresClarification: false },
      {
        addressId: "addr_home",
        items: [{ requestedName: "milk", searchQuery: "milk", selectedSpinId: "spin_milk_1l", quantity: 1 }],
      },
    ]);
    const workflow = new TelegramMessageWorkflowService(
      repository,
      new OpenAISpecialistAgents({ runner }),
      speech,
      speech,
      new FakeVoiceDownloader(),
      { instamartClient: new LocalInstamartMcpStub(), encryptionSecret },
    );

    const firstActions = await workflow.handleMessage({
      chat,
      member: { id: "member-cook", householdId: "household-1", telegramUserId: "user-cook", role: "cook" },
      messageEventId: "message-event-4",
      message: textMessage("chicken nahi hai"),
    });

    expect(firstActions).toEqual([
      {
        type: "send_text_message",
        chatId: "-100",
        text: "₹20 more for free delivery — kuch aur chahiye? 2 min.",
      },
    ]);
    expect(repository.cartSessions[0]).toMatchObject({ status: "upsell_open", revision: 1 });

    const secondActions = await workflow.handleMessage({
      chat,
      member: { id: "member-flatmate", householdId: "household-1", telegramUserId: "user-flatmate", role: "flatmate" },
      messageEventId: "message-event-5",
      message: textMessage("milk bhi add kar do"),
    });

    expect(secondActions).toEqual([
      expect.objectContaining({
        type: "send_cart_approval_card",
        chatId: "-100",
        cartSessionId: "cart-1",
        revision: 2,
        text: expect.stringContaining("Instamart cart revision 2"),
      }),
    ]);
    expect(repository.cartSessions[0]).toMatchObject({ status: "approval_pending", revision: 2, expiresAt: null });
    expect(repository.cartItems.filter((item) => item.revision === 2)).toEqual([
      expect.objectContaining({ spinId: "spin_chicken_500g", quantity: 1 }),
      expect.objectContaining({ spinId: "spin_milk_1l", quantity: 1 }),
    ]);
    expect(repository.agentRuns.map((run) => run.agentName)).toEqual([
      "message_intent_agent",
      "missing_items_agent",
      "cart_planner_agent",
      "message_intent_agent",
      "cart_addition_agent",
      "cart_planner_agent",
    ]);
    expect(repository.agentEvents.map((event) => event.eventType)).toEqual([
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
    ]);
  });

  it("rejects stale approval callbacks and checks out only the latest revision", async () => {
    const repository = new FakeRepository();
    const encryptionSecret = "m6-secret";
    repository.swiggyConnection = {
      id: "swiggy-connection-1",
      encryptedAccessToken: encryptSecret("fake-swiggy-token", encryptionSecret),
    };
    repository.cartSessions.push({
      id: "cart-1",
      householdId: "household-1",
      swiggyConnectionId: "swiggy-connection-1",
      status: "approval_pending",
      revision: 2,
      selectedAddressId: "addr_home",
    });
    const stub = new LocalInstamartMcpStub();
    await stub.callTool({
      name: "update_cart",
      arguments: { selectedAddressId: "addr_home", items: [{ spinId: "spin_rice_1kg", quantity: 1 }] },
      context: { accessToken: "fake-swiggy-token" },
    });
    const workflow = new TelegramMessageWorkflowService(
      repository,
      new OpenAISpecialistAgents({ runner: new FakeRunner([]) }),
      new FakeSpeechProvider(),
      new FakeSpeechProvider(),
      new FakeVoiceDownloader(),
      { instamartClient: stub, encryptionSecret },
    );

    await expect(
      workflow.handleCartApproval({
        chat,
        member: { id: "member-flatmate", householdId: "household-1", telegramUserId: "user-flatmate", role: "flatmate" },
        callbackQueryId: "cb-stale",
        cartSessionId: "cart-1",
        revision: 1,
      }),
    ).resolves.toEqual([
      {
        type: "answer_callback",
        callbackQueryId: "cb-stale",
        text: "This approval button is stale. Please approve the latest cart.",
      },
    ]);

    const actions = await workflow.handleCartApproval({
      chat,
      member: { id: "member-flatmate", householdId: "household-1", telegramUserId: "user-flatmate", role: "flatmate" },
      callbackQueryId: "cb-ok",
      cartSessionId: "cart-1",
      revision: 2,
    });

    expect(actions).toEqual([
      {
        type: "answer_callback",
        callbackQueryId: "cb-ok",
        text: "Cart approved. Checkout completed.",
      },
      {
        type: "send_text_message",
        chatId: "-100",
        text: expect.stringContaining("Instamart order placed successfully"),
      },
    ]);
    expect(repository.cartSessions[0]?.status).toBe("checked_out");
    expect(repository.orders).toEqual([
      expect.objectContaining({
        cartSessionId: "cart-1",
        swiggyConnectionId: "swiggy-connection-1",
        swiggyOrderId: "IM-000001",
        status: "confirmed",
      }),
    ]);
    expect(repository.agentEvents.map((event) => event.eventType)).toEqual([
      "approval_rejected",
      "approval_received",
      "checkout_started",
      "checkout_succeeded",
      "order_tracking_checked",
    ]);
    expect(repository.agentEvents.find((event) => event.eventType === "checkout_succeeded")).toMatchObject({
      orderId: "order-row-1",
    });
  });
});

function textMessage(text: string): TelegramMessage {
  return {
    message_id: 10,
    chat: { id: -100, type: "group" },
    from: { id: 123 },
    text,
  };
}

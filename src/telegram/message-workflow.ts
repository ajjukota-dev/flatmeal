import type {
  AgentTraceContext,
  CookPromptInput,
  IntentClassificationInput,
  MealRequestExtractionInput,
  MissingItemsInput,
  OpenAISpecialistAgents,
  SpecialistAgentName,
} from "../agents/specialists.js";
import type { CookPrompt, IntentEnvelope, MealRequest, MissingItemsExtraction } from "../agents/schemas.js";
import { decryptSecret } from "../crypto/secrets.js";
import type { InstamartMcpClient, ToolEnvelope } from "../instamart/local-mcp-stub.js";
import type { TextToSpeechProvider, SpeechToTextProvider, SarvamTextToSpeechLanguage } from "../speech/types.js";
import type { DownloadedTelegramFile } from "./bot-api.js";
import type {
  CartItemInsert,
  StoredHouseholdChat,
  StoredHouseholdMember,
  TelegramOnboardingRepository,
} from "./repository.js";
import type { CookLanguage, TelegramAction, TelegramMessage } from "./types.js";

export type TelegramVoiceDownloader = {
  downloadVoice(fileId: string): Promise<DownloadedTelegramFile>;
};

export type TelegramMessageWorkflowInput = {
  chat: StoredHouseholdChat;
  member: StoredHouseholdMember | null;
  messageEventId: string;
  message: TelegramMessage;
};

type MessageText = {
  text: string;
  source: "text" | "voice";
  languageCode?: string | null;
};

type CartWorkflowOptions = {
  instamartClient: InstamartMcpClient;
  encryptionSecret: string;
};

export class TelegramMessageWorkflowService {
  constructor(
    private readonly repository: TelegramOnboardingRepository,
    private readonly agents: OpenAISpecialistAgents,
    private readonly speechToText: SpeechToTextProvider,
    private readonly textToSpeech: TextToSpeechProvider,
    private readonly voiceDownloader: TelegramVoiceDownloader,
    private readonly cartOptions?: CartWorkflowOptions,
  ) {}

  async handleMessage(input: TelegramMessageWorkflowInput): Promise<TelegramAction[]> {
    if (!input.member) {
      return [];
    }

    const messageText = await this.readMessageText(input);
    if (!messageText?.text.trim()) {
      return [];
    }

    const traceBase = {
      householdId: input.chat.householdId,
      telegramChatId: input.chat.telegramChatId,
      messageEventId: input.messageEventId,
    };
    const activeCart = await this.repository.findActiveCartSession(input.chat.householdId);
    const activeWorkflow = activeCart?.status ?? "idle";
    const intentInput: IntentClassificationInput = {
      text: messageText.text,
      senderRole: input.member.role,
      activeWorkflow,
    };
    const intent = await this.runRecordedAgent(
      "message_intent_agent",
      input,
      {
        source: messageText.source,
        textLength: messageText.text.length,
        senderRole: input.member.role,
        activeWorkflow,
      },
      (trace) => this.agents.classifyMessage(intentInput, trace),
      sanitizeIntent,
      traceBase,
    );

    if (intent.requiresClarification && intent.clarificationQuestion) {
      return [{ type: "send_text_message", chatId: input.chat.telegramChatId, text: intent.clarificationQuestion }];
    }

    if (intent.intent === "flatmate_meal_request" && (input.member.role === "flatmate" || input.member.role === "owner")) {
      return this.handleFlatmateMealRequest(input, messageText.text, traceBase);
    }

    if ((intent.intent === "cook_meal_missing_items" || intent.intent === "cook_restock_request") && input.member.role === "cook") {
      return this.handleCookMissingItems(input, messageText.text, traceBase);
    }

    return [];
  }

  async handleCartApproval(input: {
    chat: StoredHouseholdChat;
    member: StoredHouseholdMember | null;
    callbackQueryId: string;
    cartSessionId: string;
    revision: number;
  }): Promise<TelegramAction[]> {
    const answer = (text: string): TelegramAction => ({
      type: "answer_callback",
      callbackQueryId: input.callbackQueryId,
      text,
    });

    if (!input.member || (input.member.role !== "owner" && input.member.role !== "flatmate")) {
      return [answer("Only owner or flatmate can approve checkout.")];
    }

    const cartSession = await this.repository.findCartSession(input.cartSessionId);
    if (!cartSession || cartSession.householdId !== input.chat.householdId) {
      return [answer("Cart session was not found.")];
    }
    if (cartSession.status === "checked_out") {
      return [answer("Cart is already checked out.")];
    }
    if (cartSession.revision !== input.revision) {
      return [answer("This approval button is stale. Please approve the latest cart.")];
    }
    if (cartSession.status !== "approval_pending") {
      return [answer("Cart is not waiting for approval.")];
    }
    if (!cartSession.selectedAddressId) {
      return [answer("Cart address is missing.")];
    }

    const connection = await this.repository.findActiveSwiggyConnection(input.chat.householdId);
    if (!connection) {
      return [
        answer("Swiggy is not connected."),
        {
          type: "send_text_message",
          chatId: input.chat.telegramChatId,
          text: "Swiggy is not connected for this household. Owner should reconnect Swiggy before checkout.",
        },
      ];
    }

    const approved = await this.repository.approveCartSession({
      cartSessionId: cartSession.id,
      revision: cartSession.revision,
      approvedByMemberId: input.member.id,
    });
    if (!approved) {
      return [answer("This cart is no longer waiting for approval.")];
    }

    const accessToken = decryptSecret(connection.encryptedAccessToken, this.requireCartOptions().encryptionSecret);
    const cart = await this.callInstamart("get_cart", {}, accessToken);
    if (!cart.success) {
      return this.cartFailureActions(input.chat.telegramChatId, answer, "Could not re-read cart before checkout", cart);
    }

    const cartData = cart.data;
    const bill = readBill(cartData.bill);
    if (bill.grandTotal !== undefined && bill.grandTotal >= 1000) {
      return [
        answer("Cart total is above the checkout limit."),
        {
          type: "send_text_message",
          chatId: input.chat.telegramChatId,
          text: "Cart total is above the documented Instamart checkout limit for this flow. Please use the Swiggy Instamart app for this larger order.",
        },
      ];
    }

    const paymentMethod = readPaymentMethods(cartData.availablePaymentMethods)[0];
    if (!paymentMethod) {
      return [answer("No payment method is available for this cart.")];
    }

    const checkout = await this.callInstamart(
      "checkout",
      { addressId: cartSession.selectedAddressId, paymentMethod },
      accessToken,
      { checkoutApproval: { revision: cartSession.revision, latestRevision: cartSession.revision } },
    );

    if (!checkout.success) {
      if (checkout.error.message.includes("uncertain")) {
        const orders = await this.callInstamart("get_orders", { activeOnly: true }, accessToken);
        if (orders.success && readOrders(orders.data.orders).length > 0) {
          await this.persistOrdersFromTool({
            householdId: input.chat.householdId,
            cartSessionId: cartSession.id,
            swiggyConnectionId: connection.id,
            orders: readOrders(orders.data.orders),
          });
          await this.repository.markCartCheckedOut(cartSession.id);
          return [
            answer("Order found after checkout check."),
            {
              type: "send_text_message",
              chatId: input.chat.telegramChatId,
              text: formatOrderConfirmation("Instamart order placed successfully.", readOrders(orders.data.orders), cartData),
            },
          ];
        }
      }
      return this.cartFailureActions(input.chat.telegramChatId, answer, "Checkout failed", checkout);
    }

    const orders = readOrders(checkout.data.orders);
    await this.persistOrdersFromTool({
      householdId: input.chat.householdId,
      cartSessionId: cartSession.id,
      swiggyConnectionId: connection.id,
      orders,
    });
    await this.repository.markCartCheckedOut(cartSession.id);

    const tracking = await this.trackFirstOrder(accessToken, orders);
    const message = formatOrderConfirmation(checkout.message ?? "Instamart order placed successfully.", orders, cartData, tracking);

    return [
      answer("Cart approved. Checkout completed."),
      { type: "send_text_message", chatId: input.chat.telegramChatId, text: message },
    ];
  }

  private async handleFlatmateMealRequest(
    input: TelegramMessageWorkflowInput,
    text: string,
    traceBase: AgentTraceContext,
  ): Promise<TelegramAction[]> {
    const meal = await this.runRecordedAgent(
      "meal_request_agent",
      input,
      { textLength: text.length },
      (trace) => this.agents.extractMealRequest({ text } satisfies MealRequestExtractionInput, trace),
      sanitizeMealRequest,
      traceBase,
    );

    const cook = await this.repository.findCookForHousehold(input.chat.householdId);
    if (!cook) {
      return [
        {
          type: "send_text_message",
          chatId: input.chat.telegramChatId,
          text: "Cook role is not set yet. Ask the cook to choose role first.",
        },
      ];
    }

    const promptInput: CookPromptInput = {
      mealRequest: meal,
      cookLanguage: cook.preferredLanguage,
      targetTelegramUserId: cook.telegramUserId,
    };
    const prompt = await this.runRecordedAgent(
      "cook_prompt_agent",
      input,
      {
        dish: meal.dish,
        servings: meal.servings,
        cookLanguage: cook.preferredLanguage,
        targetTelegramUserId: cook.telegramUserId,
      },
      (trace) => this.agents.createCookPrompt(promptInput, trace),
      sanitizeCookPrompt,
      traceBase,
    );

    const voice = await this.textToSpeech.synthesize({
      text: prompt.text,
      targetLanguageCode: toSarvamTtsLanguage(prompt.language),
      outputAudioCodec: "opus",
    });

    return [
      {
        type: "send_text_message",
        chatId: input.chat.telegramChatId,
        text: prompt.text,
      },
      {
        type: "send_voice_note",
        chatId: input.chat.telegramChatId,
        voice: new Blob([new Uint8Array(voice.audio)], { type: "audio/ogg" }),
        filename: "cook_prompt.ogg",
        caption: "Cook prompt",
      },
    ];
  }

  private async handleCookMissingItems(
    input: TelegramMessageWorkflowInput,
    text: string,
    traceBase: AgentTraceContext,
  ): Promise<TelegramAction[]> {
    const missing = await this.runRecordedAgent(
      "missing_items_agent",
      input,
      { textLength: text.length },
      (trace) => this.agents.extractMissingItems({ text } satisfies MissingItemsInput, trace),
      sanitizeMissingItems,
      traceBase,
    );

    if (missing.requiresClarification && missing.clarificationQuestion) {
      return [{ type: "send_text_message", chatId: input.chat.telegramChatId, text: missing.clarificationQuestion }];
    }

    if (missing.items.length === 0) {
      return [];
    }

    if (this.cartOptions) {
      return this.buildCartFromMissingItems(input, missing, traceBase);
    }

    return [
      {
        type: "send_text_message",
        chatId: input.chat.telegramChatId,
        text: `Noted missing items: ${missing.items.map((item) => item.name).join(", ")}. Cart build is next.`,
      },
    ];
  }

  private async buildCartFromMissingItems(
    input: TelegramMessageWorkflowInput,
    missing: MissingItemsExtraction,
    traceBase: AgentTraceContext,
  ): Promise<TelegramAction[]> {
    const options = this.requireCartOptions();
    const connection = await this.repository.findActiveSwiggyConnection(input.chat.householdId);
    if (!connection) {
      return [
        {
          type: "send_text_message",
          chatId: input.chat.telegramChatId,
          text: "Swiggy is not connected for this household. Owner should connect Swiggy before I build the cart.",
        },
      ];
    }

    const accessToken = decryptSecret(connection.encryptedAccessToken, options.encryptionSecret);
    const addresses = await this.callInstamart("get_addresses", {}, accessToken);
    if (!addresses.success) {
      return this.cartFailureActions(input.chat.telegramChatId, undefined, "Could not load saved Swiggy addresses", addresses);
    }

    const address = chooseAddress(readAddresses(addresses.data.addresses));
    if (!address) {
      return [
        {
          type: "send_text_message",
          chatId: input.chat.telegramChatId,
          text: "No saved Swiggy address is available. Add an address in Swiggy first, then try again.",
        },
      ];
    }

    const cartSession = await this.repository.createCartSession({
      householdId: input.chat.householdId,
      swiggyConnectionId: connection.id,
      selectedAddressId: address.id,
    });

    const candidateProducts: Array<{ requestedName: string; products: unknown[] }> = [];
    for (const item of missing.items) {
      const search = await this.callInstamart("search_products", { addressId: address.id, query: item.name }, accessToken);
      if (!search.success) {
        return this.cartFailureActions(input.chat.telegramChatId, undefined, `Could not find ${item.name} on Instamart`, search);
      }
      candidateProducts.push({ requestedName: item.name, products: readProducts(search.data.products) });
    }

    const plan = await this.runRecordedAgent(
      "cart_planner_agent",
      input,
      {
        cartSessionId: cartSession.id,
        cartRevision: cartSession.revision,
        addressId: address.id,
        itemCount: missing.items.length,
        candidateProductGroups: candidateProducts.length,
      },
      (trace) =>
        this.agents.planCart(
          {
            addressId: address.id,
            missingItems: missing.items,
            candidateProducts,
          },
          { ...trace, cartSessionId: cartSession.id, cartRevision: cartSession.revision },
        ),
      sanitizeCartPlan,
      { ...traceBase, cartSessionId: cartSession.id, cartRevision: cartSession.revision },
    );

    const validSpinIds = collectSpinIds(candidateProducts);
    const invalidSelection = plan.items.find((item) => !validSpinIds.has(item.selectedSpinId));
    if (invalidSelection) {
      return [
        {
          type: "send_text_message",
          chatId: input.chat.telegramChatId,
          text: `I could not safely match ${invalidSelection.requestedName} to an available Instamart variant. Please rephrase the item.`,
        },
      ];
    }

    const updateCart = await this.callInstamart(
      "update_cart",
      {
        selectedAddressId: address.id,
        items: plan.items.map((item) => ({ spinId: item.selectedSpinId, quantity: item.quantity })),
      },
      accessToken,
    );
    if (!updateCart.success) {
      return this.cartFailureActions(input.chat.telegramChatId, undefined, "Could not update Instamart cart", updateCart);
    }

    const cart = await this.callInstamart("get_cart", {}, accessToken);
    if (!cart.success) {
      return this.cartFailureActions(input.chat.telegramChatId, undefined, "Could not re-read Instamart cart", cart);
    }

    const cartItems = buildCartItemRows(plan.items, readCartItems(cart.data.items));
    await this.repository.replaceCartItems({ cartSessionId: cartSession.id, revision: cartSession.revision, items: cartItems });
    await this.repository.markCartApprovalPending({ cartSessionId: cartSession.id, revision: cartSession.revision });

    return [
      {
        type: "send_cart_approval_card",
        chatId: input.chat.telegramChatId,
        cartSessionId: cartSession.id,
        revision: cartSession.revision,
        text: formatCartApprovalText({
          revision: cartSession.revision,
          address,
          cartData: cart.data,
        }),
      },
    ];
  }

  private async readMessageText(input: TelegramMessageWorkflowInput): Promise<MessageText | null> {
    if (input.message.text) {
      return { text: input.message.text, source: "text" };
    }

    if (!input.message.voice) {
      return null;
    }

    const voiceAsset = await this.repository.recordVoiceAsset({
      messageEventId: input.messageEventId,
      telegramFileId: input.message.voice.file_id,
    });

    try {
      const downloaded = await this.voiceDownloader.downloadVoice(input.message.voice.file_id);
      const transcription = await this.speechToText.transcribe({
        data: new Blob([new Uint8Array(downloaded.data)]),
        filename: downloaded.filename,
      });
      await this.repository.markVoiceAssetTranscribed({
        id: voiceAsset.id,
        transcript: transcription.transcript,
        languageCode: transcription.languageCode,
      });
      return { text: transcription.transcript, source: "voice", languageCode: transcription.languageCode };
    } catch (error) {
      await this.repository.markVoiceAssetFailed({ id: voiceAsset.id });
      throw error;
    }
  }

  private async runRecordedAgent<TOutput>(
    agentName: SpecialistAgentName,
    input: TelegramMessageWorkflowInput,
    sanitizedInput: Record<string, unknown>,
    run: (trace: AgentTraceContext) => Promise<TOutput>,
    sanitizeOutput: (output: TOutput) => Record<string, unknown>,
    traceBase: AgentTraceContext,
  ): Promise<TOutput> {
    const traceId = `${input.messageEventId}:${agentName}`;
    const agentRun = await this.repository.createAgentRun({
      householdId: input.chat.householdId,
      messageEventId: input.messageEventId,
      agentName,
      traceId,
      sanitizedInput,
    });

    try {
      const output = await run({ ...traceBase, traceId, agentRunId: agentRun.id });
      const sanitizedOutput = sanitizeOutput(output);
      await this.repository.completeAgentRun({
        id: agentRun.id,
        intent: agentName === "message_intent_agent" ? String(sanitizedOutput.intent) : undefined,
        sanitizedOutput,
      });
      return output;
    } catch (error) {
      await this.repository.failAgentRun({
        id: agentRun.id,
        errorSummary: error instanceof Error ? error.message : "Agent run failed",
      });
      throw error;
    }
  }

  private requireCartOptions(): CartWorkflowOptions {
    if (!this.cartOptions) {
      throw new Error("Cart workflow options are not configured");
    }
    return this.cartOptions;
  }

  private async callInstamart(
    name: string,
    args: Record<string, unknown>,
    accessToken: string,
    context: Record<string, unknown> = {},
  ): Promise<ToolEnvelope> {
    return this.requireCartOptions().instamartClient.callTool({
      name,
      arguments: args,
      context: { accessToken, ...context },
    });
  }

  private cartFailureActions(
    chatId: string,
    answer: ((text: string) => TelegramAction) | undefined,
    summary: string,
    result: Extract<ToolEnvelope, { success: false }>,
  ): TelegramAction[] {
    const actions: TelegramAction[] = [];
    if (answer) {
      actions.push(answer(summary));
    }
    actions.push({
      type: "send_text_message",
      chatId,
      text: `${summary}: ${result.error.message}`,
    });
    return actions;
  }

  private async persistOrdersFromTool(input: {
    householdId: string;
    cartSessionId: string;
    swiggyConnectionId: string;
    orders: ToolOrder[];
  }): Promise<void> {
    for (const order of input.orders) {
      await this.repository.recordOrder({
        householdId: input.householdId,
        cartSessionId: input.cartSessionId,
        swiggyConnectionId: input.swiggyConnectionId,
        localOrderId: order.orderId,
        swiggyOrderId: order.orderId,
        status: "confirmed",
        totalMinor: order.bill?.grandTotal === undefined ? undefined : Math.round(order.bill.grandTotal * 100),
        trackingState: { source: "local_instamart_mcp", status: order.status, coordinates: order.coordinates },
      });
    }
  }

  private async trackFirstOrder(accessToken: string, orders: ToolOrder[]): Promise<Record<string, unknown> | undefined> {
    const order = orders[0];
    if (!order?.coordinates) {
      return undefined;
    }
    const tracking = await this.callInstamart(
      "track_order",
      { orderId: order.orderId, lat: order.coordinates.lat, lng: order.coordinates.lng },
      accessToken,
    );
    return tracking.success && isRecord(tracking.data.tracking) ? tracking.data.tracking : undefined;
  }
}

function sanitizeIntent(intent: IntentEnvelope): Record<string, unknown> {
  return {
    intent: intent.intent,
    confidence: intent.confidence,
    language: intent.language,
    requiresClarification: intent.requiresClarification,
  };
}

function sanitizeMealRequest(meal: MealRequest): Record<string, unknown> {
  return {
    dish: meal.dish,
    servings: meal.servings,
    mealTime: meal.mealTime,
    spiceLevel: meal.spiceLevel,
    noteCount: meal.notes.length,
  };
}

function sanitizeCookPrompt(prompt: CookPrompt): Record<string, unknown> {
  return {
    language: prompt.language,
    voiceRequired: prompt.voiceRequired,
    targetTelegramUserId: prompt.targetTelegramUserId,
    textLength: prompt.text.length,
  };
}

function sanitizeMissingItems(missing: MissingItemsExtraction): Record<string, unknown> {
  return {
    items: missing.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      confidence: item.confidence,
    })),
    requiresClarification: missing.requiresClarification,
  };
}

function sanitizeCartPlan(plan: { addressId: string; items: Array<{ requestedName: string; searchQuery: string; selectedSpinId: string; quantity: number }> }): Record<string, unknown> {
  return {
    addressId: plan.addressId,
    items: plan.items.map((item) => ({
      requestedName: item.requestedName,
      searchQuery: item.searchQuery,
      selectedSpinId: item.selectedSpinId,
      quantity: item.quantity,
    })),
  };
}

function toSarvamTtsLanguage(language: CookLanguage): SarvamTextToSpeechLanguage {
  const mapping: Record<CookLanguage, SarvamTextToSpeechLanguage> = {
    hi: "hi-IN",
    hinglish: "hi-IN",
    ta: "ta-IN",
    te: "te-IN",
    en: "en-IN",
  };
  return mapping[language];
}

type ToolAddress = { id: string; label?: string; fullAddress?: string };
type ToolCartItem = { spinId: string; quantity: number; name?: string; unitPrice?: number; lineTotal?: number };
type ToolBill = { itemTotal?: number; deliveryFee?: number; handlingFee?: number; grandTotal?: number; freeDeliveryThreshold?: number };
type ToolOrder = {
  orderId: string;
  status?: string;
  items?: Array<{ name?: string; quantity?: number }>;
  bill?: ToolBill;
  coordinates?: { lat: number; lng: number };
};

function readAddresses(value: unknown): ToolAddress[] {
  return Array.isArray(value)
    ? value.flatMap((item) => (isRecord(item) && typeof item.id === "string" ? [{ ...item, id: item.id } as ToolAddress] : []))
    : [];
}

function chooseAddress(addresses: ToolAddress[]): ToolAddress | undefined {
  return addresses.find((address) => address.label === "Home") ?? addresses[0];
}

function readProducts(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function collectSpinIds(candidateProducts: Array<{ products: unknown[] }>): Set<string> {
  const spinIds = new Set<string>();
  for (const group of candidateProducts) {
    for (const product of group.products) {
      if (!isRecord(product) || !Array.isArray(product.variants)) {
        continue;
      }
      for (const variant of product.variants) {
        if (isRecord(variant) && typeof variant.spinId === "string") {
          spinIds.add(variant.spinId);
        }
      }
    }
  }
  return spinIds;
}

function readCartItems(value: unknown): ToolCartItem[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (!isRecord(item) || typeof item.spinId !== "string") {
          return [];
        }
        return [
          {
            spinId: item.spinId,
            quantity: Number(item.quantity),
            name: typeof item.name === "string" ? item.name : undefined,
            unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : undefined,
            lineTotal: typeof item.lineTotal === "number" ? item.lineTotal : undefined,
          },
        ];
      })
    : [];
}

function buildCartItemRows(
  planItems: Array<{ requestedName: string; selectedSpinId: string; quantity: number }>,
  cartItems: ToolCartItem[],
): CartItemInsert[] {
  const cartItemsBySpinId = new Map(cartItems.map((item) => [item.spinId, item]));
  return planItems.map((item) => {
    const cartItem = cartItemsBySpinId.get(item.selectedSpinId);
    return {
      requestedName: item.requestedName,
      selectedProductName: cartItem?.name,
      spinId: item.selectedSpinId,
      quantity: item.quantity,
      priceMinor: cartItem?.unitPrice === undefined ? undefined : Math.round(cartItem.unitPrice * 100),
    };
  });
}

function readBill(value: unknown): ToolBill {
  if (!isRecord(value)) {
    return {};
  }
  return {
    itemTotal: typeof value.itemTotal === "number" ? value.itemTotal : undefined,
    deliveryFee: typeof value.deliveryFee === "number" ? value.deliveryFee : undefined,
    handlingFee: typeof value.handlingFee === "number" ? value.handlingFee : undefined,
    grandTotal: typeof value.grandTotal === "number" ? value.grandTotal : undefined,
    freeDeliveryThreshold: typeof value.freeDeliveryThreshold === "number" ? value.freeDeliveryThreshold : undefined,
  };
}

function readPaymentMethods(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readOrders(value: unknown): ToolOrder[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (!isRecord(item) || typeof item.orderId !== "string") {
          return [];
        }
        const coordinates = isRecord(item.coordinates)
          && typeof item.coordinates.lat === "number"
          && typeof item.coordinates.lng === "number"
          ? { lat: item.coordinates.lat, lng: item.coordinates.lng }
          : undefined;
        return [
          {
            orderId: item.orderId,
            status: typeof item.status === "string" ? item.status : undefined,
            bill: readBill(item.bill),
            coordinates,
          },
        ];
      })
    : [];
}

function formatCartApprovalText(input: { revision: number; address: ToolAddress; cartData: Record<string, unknown> }): string {
  const items = readCartItems(input.cartData.items);
  const bill = readBill(input.cartData.bill);
  const paymentMethods = readPaymentMethods(input.cartData.availablePaymentMethods);
  const lines = [
    `Instamart cart revision ${input.revision}`,
    `Address: ${input.address.fullAddress ?? input.address.label ?? input.address.id}`,
    ...items.map((item) => `- ${item.name ?? item.spinId} x ${item.quantity}`),
    `Total: ${formatRupees(bill.grandTotal)}`,
    `Payment: ${paymentMethods.join(", ") || "not specified by docs"}`,
    "Approve only if this latest cart looks correct.",
  ];
  return lines.join("\n");
}

function formatOrderConfirmation(
  message: string,
  orders: ToolOrder[],
  cartData: Record<string, unknown>,
  tracking?: Record<string, unknown>,
): string {
  const bill = readBill(cartData.bill);
  const orderIds = orders.map((order) => order.orderId).join(", ");
  const trackingStatus = isRecord(tracking) && typeof tracking.status === "string" ? `\nTracking: ${tracking.status}` : "";
  return [message, `Order: ${orderIds || "not specified by docs"}`, `Total: ${formatRupees(bill.grandTotal)}${trackingStatus}`].join("\n");
}

function formatRupees(value: number | undefined): string {
  return value === undefined ? "not specified by docs" : `₹${value}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

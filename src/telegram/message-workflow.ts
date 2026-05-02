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
  AgentEventInsert,
  CartItemInsert,
  StoredCartItem,
  StoredCartSession,
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
    await this.recordEvent(input, {
      eventType: "message_intake",
      sanitizedPayload: {
        messageKind: input.message.voice ? "voice" : "text",
        senderRole: input.member?.role ?? "unknown",
        telegramMessageId: String(input.message.message_id),
      },
    });

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

    if (activeCart?.status === "upsell_open") {
      if (isExpired(activeCart.expiresAt)) {
        return this.finalizeUpsellCart(input.chat, activeCart);
      }
      if (
        intent.intent === "flatmate_cart_addition"
        && (input.member.role === "owner" || input.member.role === "flatmate")
      ) {
        return this.handleCartAddition(input, messageText.text, activeCart, traceBase);
      }
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
      await this.recordEventForChat(input.chat, {
        eventType: "approval_rejected",
        cartSessionId: input.cartSessionId,
        status: "warning",
        userSafeMessage: "Only owner or flatmate can approve checkout.",
        sanitizedPayload: { revision: input.revision, reason: "role_not_allowed" },
      });
      return [answer("Only owner or flatmate can approve checkout.")];
    }

    const cartSession = await this.repository.findCartSession(input.cartSessionId);
    if (!cartSession || cartSession.householdId !== input.chat.householdId) {
      await this.recordEventForChat(input.chat, {
        eventType: "approval_rejected",
        cartSessionId: input.cartSessionId,
        status: "warning",
        sanitizedPayload: { revision: input.revision, reason: "cart_session_not_found" },
      });
      return [answer("Cart session was not found.")];
    }
    if (cartSession.status === "checked_out") {
      await this.recordEventForChat(input.chat, {
        eventType: "approval_rejected",
        cartSessionId: cartSession.id,
        status: "warning",
        sanitizedPayload: { revision: input.revision, reason: "already_checked_out" },
      });
      return [answer("Cart is already checked out.")];
    }
    if (cartSession.revision !== input.revision) {
      await this.recordEventForChat(input.chat, {
        eventType: "approval_rejected",
        cartSessionId: cartSession.id,
        status: "warning",
        sanitizedPayload: { requestedRevision: input.revision, latestRevision: cartSession.revision, reason: "stale_revision" },
      });
      return [answer("This approval button is stale. Please approve the latest cart.")];
    }
    if (cartSession.status !== "approval_pending") {
      await this.recordEventForChat(input.chat, {
        eventType: "approval_rejected",
        cartSessionId: cartSession.id,
        status: "warning",
        sanitizedPayload: { revision: input.revision, cartStatus: cartSession.status, reason: "cart_not_pending" },
      });
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
      await this.recordEventForChat(input.chat, {
        eventType: "approval_rejected",
        cartSessionId: cartSession.id,
        status: "warning",
        sanitizedPayload: { revision: cartSession.revision, reason: "approval_race_lost" },
      });
      return [answer("This cart is no longer waiting for approval.")];
    }
    await this.recordEventForChat(input.chat, {
      eventType: "approval_received",
      cartSessionId: cartSession.id,
      userSafeMessage: "Latest cart revision approved.",
      sanitizedPayload: {
        revision: cartSession.revision,
        approvedByMemberId: input.member.id,
      },
    });

    const accessToken = decryptSecret(connection.encryptedAccessToken, this.requireCartOptions().encryptionSecret);
    await this.recordEventForChat(input.chat, {
      eventType: "checkout_started",
      cartSessionId: cartSession.id,
      sanitizedPayload: { revision: cartSession.revision },
    });
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
          const persistedOrders = await this.persistOrdersFromTool({
            householdId: input.chat.householdId,
            cartSessionId: cartSession.id,
            swiggyConnectionId: connection.id,
            orders: readOrders(orders.data.orders),
          });
          await this.repository.markCartCheckedOut(cartSession.id);
          await this.recordEventForChat(input.chat, {
            eventType: "checkout_succeeded",
            cartSessionId: cartSession.id,
            orderId: persistedOrders[0]?.rowId,
            userSafeMessage: "Order found after checkout uncertainty check.",
            sanitizedPayload: { revision: cartSession.revision, source: "get_orders_after_uncertain_checkout" },
          });
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
    const persistedOrders = await this.persistOrdersFromTool({
      householdId: input.chat.householdId,
      cartSessionId: cartSession.id,
      swiggyConnectionId: connection.id,
      orders,
    });
    await this.repository.markCartCheckedOut(cartSession.id);
    await this.recordEventForChat(input.chat, {
      eventType: "checkout_succeeded",
      cartSessionId: cartSession.id,
      orderId: persistedOrders[0]?.rowId,
      userSafeMessage: "Instamart checkout completed.",
      sanitizedPayload: {
        revision: cartSession.revision,
        orderCount: orders.length,
        orderIds: orders.map((order) => order.orderId),
      },
    });

    const tracking = await this.trackFirstOrder(accessToken, orders);
    if (tracking) {
      const firstOrder = orders[0];
      const firstPersistedOrder = firstOrder
        ? persistedOrders.find((order) => order.localOrderId === firstOrder.orderId)
        : undefined;
      await this.recordEventForChat(input.chat, {
        eventType: "order_tracking_checked",
        cartSessionId: cartSession.id,
        orderId: firstPersistedOrder?.rowId,
        sanitizedPayload: {
          orderId: firstOrder?.orderId,
          status: typeof tracking.status === "string" ? tracking.status : undefined,
        },
      });
    }
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
    await this.recordEvent(input, {
      eventType: "cart_build_started",
      cartSessionId: cartSession.id,
      userSafeMessage: "Started Instamart cart build.",
      sanitizedPayload: {
        revision: cartSession.revision,
        itemCount: missing.items.length,
        addressId: address.id,
      },
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
    await this.recordEvent(input, {
      eventType: "cart_built",
      cartSessionId: cartSession.id,
      userSafeMessage: "Instamart cart built.",
      sanitizedPayload: {
        revision: cartSession.revision,
        itemCount: cartItems.length,
        totalMinor: readTotalMinor(cart.data.bill),
      },
    });

    const addMoreGap = readAddMoreGap(cart.data.bill);
    if (addMoreGap !== null) {
      await this.repository.openCartUpsellWindow({
        cartSessionId: cartSession.id,
        revision: cartSession.revision,
        expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      });
      await this.recordEvent(input, {
        eventType: "upsell_opened",
        cartSessionId: cartSession.id,
        userSafeMessage: "Add-more window opened.",
        sanitizedPayload: {
          revision: cartSession.revision,
          addMoreGap,
          expiresInSeconds: 120,
        },
      });
      return [
        {
          type: "send_text_message",
          chatId: input.chat.telegramChatId,
          text: `₹${addMoreGap} more for free delivery — kuch aur chahiye? 2 min.`,
        },
      ];
    }

    await this.repository.markCartApprovalPending({ cartSessionId: cartSession.id, revision: cartSession.revision });
    await this.recordEvent(input, {
      eventType: "cart_approval_requested",
      cartSessionId: cartSession.id,
      userSafeMessage: "Cart approval requested.",
      sanitizedPayload: {
        revision: cartSession.revision,
        totalMinor: readTotalMinor(cart.data.bill),
      },
    });

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

  private async handleCartAddition(
    input: TelegramMessageWorkflowInput,
    text: string,
    cartSession: StoredCartSession,
    traceBase: AgentTraceContext,
  ): Promise<TelegramAction[]> {
    if (!cartSession.selectedAddressId) {
      return [{ type: "send_text_message", chatId: input.chat.telegramChatId, text: "Cart address is missing." }];
    }

    const addition = await this.runRecordedAgent(
      "cart_addition_agent",
      input,
      {
        textLength: text.length,
        cartSessionId: cartSession.id,
        cartRevision: cartSession.revision,
      },
      (trace) => this.agents.extractCartAddition({ text } satisfies MissingItemsInput, trace),
      sanitizeMissingItems,
      { ...traceBase, cartSessionId: cartSession.id, cartRevision: cartSession.revision },
    );

    if (addition.requiresClarification && addition.clarificationQuestion) {
      return [{ type: "send_text_message", chatId: input.chat.telegramChatId, text: addition.clarificationQuestion }];
    }
    if (addition.items.length === 0) {
      return [];
    }

    const connection = await this.repository.findActiveSwiggyConnection(input.chat.householdId);
    if (!connection) {
      return [
        {
          type: "send_text_message",
          chatId: input.chat.telegramChatId,
          text: "Swiggy is not connected for this household. Owner should reconnect Swiggy before I update the cart.",
        },
      ];
    }

    const accessToken = decryptSecret(connection.encryptedAccessToken, this.requireCartOptions().encryptionSecret);
    const existingItems = await this.repository.findCartItems({
      cartSessionId: cartSession.id,
      revision: cartSession.revision,
    });

    const candidateProducts: Array<{ requestedName: string; products: unknown[] }> = [];
    for (const item of addition.items) {
      const search = await this.callInstamart(
        "search_products",
        { addressId: cartSession.selectedAddressId, query: item.name },
        accessToken,
      );
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
        addressId: cartSession.selectedAddressId,
        itemCount: addition.items.length,
        candidateProductGroups: candidateProducts.length,
      },
      (trace) =>
        this.agents.planCart(
          {
            addressId: cartSession.selectedAddressId ?? "",
            missingItems: addition.items,
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

    const mergedItems = mergeCartItems(existingItems, plan.items);
    const updateCart = await this.callInstamart(
      "update_cart",
      {
        selectedAddressId: cartSession.selectedAddressId,
        items: mergedItems.map((item) => ({ spinId: item.spinId, quantity: item.quantity })),
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

    const nextRevision = cartSession.revision + 1;
    const moved = await this.repository.moveCartToRevision({
      cartSessionId: cartSession.id,
      expectedRevision: cartSession.revision,
      nextRevision,
      status: "approval_pending",
    });
    if (!moved) {
      return [{ type: "send_text_message", chatId: input.chat.telegramChatId, text: "Cart changed while updating. Please use the latest cart." }];
    }

    await this.repository.replaceCartItems({
      cartSessionId: cartSession.id,
      revision: nextRevision,
      items: buildCartItemRows(
        mergedItems.map((item) => ({ requestedName: item.requestedName, selectedSpinId: item.spinId, quantity: item.quantity })),
        readCartItems(cart.data.items),
      ),
    });
    await this.recordEvent(input, {
      eventType: "cart_revision_updated",
      cartSessionId: cartSession.id,
      userSafeMessage: "Cart revision updated with add-more item.",
      sanitizedPayload: {
        previousRevision: cartSession.revision,
        revision: nextRevision,
        addedItemCount: addition.items.length,
        totalMinor: readTotalMinor(cart.data.bill),
      },
    });
    await this.recordEvent(input, {
      eventType: "cart_approval_requested",
      cartSessionId: cartSession.id,
      userSafeMessage: "Cart approval requested.",
      sanitizedPayload: {
        revision: nextRevision,
        totalMinor: readTotalMinor(cart.data.bill),
      },
    });

    return [
      {
        type: "send_cart_approval_card",
        chatId: input.chat.telegramChatId,
        cartSessionId: cartSession.id,
        revision: nextRevision,
        text: formatCartApprovalText({
          revision: nextRevision,
          address: { id: cartSession.selectedAddressId },
          cartData: cart.data,
        }),
      },
    ];
  }

  private async finalizeUpsellCart(chat: StoredHouseholdChat, cartSession: StoredCartSession): Promise<TelegramAction[]> {
    if (!cartSession.selectedAddressId) {
      return [{ type: "send_text_message", chatId: chat.telegramChatId, text: "Cart address is missing." }];
    }

    const connection = await this.repository.findActiveSwiggyConnection(chat.householdId);
    if (!connection) {
      return [
        {
          type: "send_text_message",
          chatId: chat.telegramChatId,
          text: "Swiggy is not connected for this household. Owner should reconnect Swiggy before checkout.",
        },
      ];
    }

    const accessToken = decryptSecret(connection.encryptedAccessToken, this.requireCartOptions().encryptionSecret);
    const cart = await this.callInstamart("get_cart", {}, accessToken);
    if (!cart.success) {
      return this.cartFailureActions(chat.telegramChatId, undefined, "Could not re-read Instamart cart", cart);
    }

    const moved = await this.repository.moveCartToRevision({
      cartSessionId: cartSession.id,
      expectedRevision: cartSession.revision,
      nextRevision: cartSession.revision,
      status: "approval_pending",
    });
    if (!moved) {
      return [{ type: "send_text_message", chatId: chat.telegramChatId, text: "Cart changed while finalizing. Please use the latest cart." }];
    }
    await this.recordEventForChat(chat, {
      eventType: "cart_approval_requested",
      cartSessionId: cartSession.id,
      userSafeMessage: "Cart approval requested after add-more window.",
      sanitizedPayload: {
        revision: cartSession.revision,
        totalMinor: readTotalMinor(cart.data.bill),
      },
    });

    return [
      {
        type: "send_cart_approval_card",
        chatId: chat.telegramChatId,
        cartSessionId: cartSession.id,
        revision: cartSession.revision,
        text: formatCartApprovalText({
          revision: cartSession.revision,
          address: { id: cartSession.selectedAddressId },
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
      await this.recordEvent(input, {
        eventType: "voice_transcribed",
        userSafeMessage: "Voice note transcribed.",
        sanitizedPayload: {
          voiceAssetId: voiceAsset.id,
          transcriptLength: transcription.transcript.length,
          languageCode: transcription.languageCode,
        },
      });
      return { text: transcription.transcript, source: "voice", languageCode: transcription.languageCode };
    } catch (error) {
      await this.repository.markVoiceAssetFailed({ id: voiceAsset.id });
      await this.recordEvent(input, {
        eventType: "voice_transcription_failed",
        status: "failed",
        retryable: true,
        sanitizedPayload: {
          voiceAssetId: voiceAsset.id,
          errorSummary: error instanceof Error ? error.message : "Voice transcription failed",
        },
      });
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
      await this.recordEvent(input, {
        eventType: agentName === "message_intent_agent" ? "intent_classified" : "agent_run_completed",
        agentRunId: agentRun.id,
        cartSessionId: traceBase.cartSessionId,
        sanitizedPayload: {
          agentName,
          traceId,
          ...sanitizedOutput,
        },
      });
      return output;
    } catch (error) {
      await this.repository.failAgentRun({
        id: agentRun.id,
        errorSummary: error instanceof Error ? error.message : "Agent run failed",
      });
      await this.recordEvent(input, {
        eventType: "agent_run_failed",
        agentRunId: agentRun.id,
        cartSessionId: traceBase.cartSessionId,
        status: "failed",
        retryable: false,
        sanitizedPayload: {
          agentName,
          traceId,
          errorSummary: error instanceof Error ? error.message : "Agent run failed",
        },
      });
      throw error;
    }
  }

  private async recordEvent(input: TelegramMessageWorkflowInput, event: Omit<AgentEventInsert, "householdId" | "telegramChatRowId" | "messageEventId">): Promise<void> {
    await this.recordEventForChat(input.chat, {
      messageEventId: input.messageEventId,
      ...event,
    });
  }

  private async recordEventForChat(
    chat: StoredHouseholdChat,
    event: Omit<AgentEventInsert, "householdId" | "telegramChatRowId">,
  ): Promise<void> {
    try {
      const sanitizedPayload = {
        telegramChatId: chat.telegramChatId,
        ...(event.sanitizedPayload ?? {}),
      };
      await this.repository.recordAgentEvent({
        householdId: chat.householdId,
        telegramChatRowId: chat.id,
        status: "ok",
        ...event,
        sanitizedPayload,
      });
    } catch (error) {
      console.warn("agent_event_record_failed", {
        eventType: event.eventType,
        errorSummary: error instanceof Error ? error.message : "Agent event insert failed",
      });
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
  }): Promise<Array<{ localOrderId: string; rowId: string }>> {
    const persistedOrders: Array<{ localOrderId: string; rowId: string }> = [];
    for (const order of input.orders) {
      const persisted = await this.repository.recordOrder({
        householdId: input.householdId,
        cartSessionId: input.cartSessionId,
        swiggyConnectionId: input.swiggyConnectionId,
        localOrderId: order.orderId,
        swiggyOrderId: order.orderId,
        status: "confirmed",
        totalMinor: order.bill?.grandTotal === undefined ? undefined : Math.round(order.bill.grandTotal * 100),
        trackingState: { source: "local_instamart_mcp", status: order.status, coordinates: order.coordinates },
      });
      persistedOrders.push({ localOrderId: order.orderId, rowId: persisted.id });
    }
    return persistedOrders;
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

function readTotalMinor(value: unknown): number | undefined {
  const grandTotal = readBill(value).grandTotal;
  return grandTotal === undefined ? undefined : Math.round(grandTotal * 100);
}

function readAddMoreGap(value: unknown): number | null {
  const bill = readBill(value);
  if (
    bill.itemTotal === undefined
    || bill.freeDeliveryThreshold === undefined
    || bill.deliveryFee === undefined
    || bill.deliveryFee <= 0
  ) {
    return null;
  }

  const gap = bill.freeDeliveryThreshold - bill.itemTotal;
  return gap > 0 && gap <= 50 ? Math.ceil(gap) : null;
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

function mergeCartItems(
  existingItems: StoredCartItem[],
  additions: Array<{ requestedName: string; selectedSpinId: string; quantity: number }>,
): Array<{ requestedName: string; spinId: string; quantity: number }> {
  const merged = new Map<string, { requestedName: string; spinId: string; quantity: number }>();
  for (const item of existingItems) {
    merged.set(item.spinId, { requestedName: item.requestedName, spinId: item.spinId, quantity: item.quantity });
  }
  for (const item of additions) {
    const existing = merged.get(item.selectedSpinId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(item.selectedSpinId, {
        requestedName: item.requestedName,
        spinId: item.selectedSpinId,
        quantity: item.quantity,
      });
    }
  }
  return [...merged.values()];
}

function isExpired(expiresAt: string | null | undefined): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

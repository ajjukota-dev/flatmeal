import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentEventInsert,
  AgentRunInsert,
  CartItemInsert,
  MessageEventInsert,
  OrderInsert,
  StoredCartSession,
  StoredCartItem,
  StoredHouseholdChat,
  StoredCookMember,
  StoredHouseholdMember,
  StoredSwiggyConnection,
  StoredTelegramUser,
  TelegramOnboardingRepository,
  VoiceAssetInsert,
} from "./repository.js";
import type { CookLanguage, HouseholdRole, TelegramChat, TelegramUser } from "./types.js";

type RowId = { id: string };

export class SupabaseTelegramRepository implements TelegramOnboardingRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async recordMessageEvent(input: MessageEventInsert): Promise<{ id?: string; duplicate: boolean }> {
    const result = await this.supabase
      .from("message_events")
      .insert({
        household_id: input.householdId,
        telegram_chat_id: input.telegramChatRowId,
        telegram_user_id: input.telegramUserRowId,
        telegram_update_id: String(input.update.update_id),
        telegram_message_id: String(input.message.message_id),
        message_kind: input.message.voice ? "voice" : "text",
        sanitized_text: input.message.text,
      })
      .select("id")
      .single<RowId>();

    if (result.error?.code === "23505") {
      return { duplicate: true };
    }

    if (result.error) {
      throw result.error;
    }

    return { id: result.data.id, duplicate: false };
  }

  async recordAgentEvent(input: AgentEventInsert): Promise<void> {
    const result = await this.supabase.from("agent_events").insert({
      household_id: input.householdId,
      telegram_chat_id: input.telegramChatRowId,
      message_event_id: input.messageEventId,
      agent_run_id: input.agentRunId,
      cart_session_id: input.cartSessionId,
      order_id: input.orderId,
      event_type: input.eventType,
      status: input.status ?? "ok",
      user_safe_message: input.userSafeMessage,
      sanitized_payload: input.sanitizedPayload ?? {},
      retryable: input.retryable,
    });

    if (result.error) {
      throw result.error;
    }
  }

  async ensureHouseholdForChat(chat: TelegramChat): Promise<StoredHouseholdChat> {
    const telegramChatId = String(chat.id);
    const existing = await this.supabase
      .from("telegram_chats")
      .select("id, household_id, telegram_chat_id")
      .eq("telegram_chat_id", telegramChatId)
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (existing.data) {
      return {
        id: existing.data.id,
        householdId: existing.data.household_id,
        telegramChatId: existing.data.telegram_chat_id,
      };
    }

    const household = await this.supabase.from("households").insert({}).select("id").single<RowId>();
    if (household.error) {
      throw household.error;
    }

    const createdChat = await this.supabase
      .from("telegram_chats")
      .insert({
        household_id: household.data.id,
        telegram_chat_id: telegramChatId,
        title: chat.title,
        type: chat.type,
      })
      .select("id, household_id, telegram_chat_id")
      .single();

    if (createdChat.error) {
      throw createdChat.error;
    }

    return {
      id: createdChat.data.id,
      householdId: createdChat.data.household_id,
      telegramChatId: createdChat.data.telegram_chat_id,
    };
  }

  async upsertTelegramUser(user: TelegramUser): Promise<StoredTelegramUser> {
    const telegramUserId = String(user.id);
    const result = await this.supabase
      .from("telegram_users")
      .upsert(
        {
          telegram_user_id: telegramUserId,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
        },
        { onConflict: "telegram_user_id" },
      )
      .select("id, telegram_user_id")
      .single();

    if (result.error) {
      throw result.error;
    }

    return { id: result.data.id, telegramUserId: result.data.telegram_user_id };
  }

  async findOwnerMember(householdId: string): Promise<StoredHouseholdMember | null> {
    const result = await this.supabase
      .from("household_members")
      .select("id, household_id, telegram_user_id, role")
      .eq("household_id", householdId)
      .eq("role", "owner")
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data ? toStoredMember(result.data) : null;
  }

  async findHouseholdMember(input: {
    householdId: string;
    telegramUserId: string;
  }): Promise<StoredHouseholdMember | null> {
    const result = await this.supabase
      .from("household_members")
      .select("id, household_id, telegram_user_id, role")
      .eq("household_id", input.householdId)
      .eq("telegram_user_id", input.telegramUserId)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data ? toStoredMember(result.data) : null;
  }

  async upsertHouseholdMember(input: {
    householdId: string;
    telegramUserId: string;
    role: HouseholdRole;
  }): Promise<StoredHouseholdMember> {
    const result = await this.supabase
      .from("household_members")
      .upsert(
        {
          household_id: input.householdId,
          telegram_user_id: input.telegramUserId,
          role: input.role,
        },
        { onConflict: "household_id,telegram_user_id" },
      )
      .select("id, household_id, telegram_user_id, role")
      .single();

    if (result.error) {
      throw result.error;
    }

    return toStoredMember(result.data);
  }

  async setCookLanguage(input: { householdMemberId: string; language: CookLanguage }): Promise<void> {
    const result = await this.supabase.from("cook_profiles").upsert(
      {
        household_member_id: input.householdMemberId,
        preferred_language: input.language,
      },
      { onConflict: "household_member_id" },
    );

    if (result.error) {
      throw result.error;
    }
  }

  async findCookForHousehold(householdId: string): Promise<StoredCookMember | null> {
    const result = await this.supabase
      .from("household_members")
      .select("id, telegram_user_id, telegram_users!inner(telegram_user_id), cook_profiles(preferred_language)")
      .eq("household_id", householdId)
      .eq("role", "cook")
      .limit(1)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    if (!result.data) {
      return null;
    }

    const row = result.data as {
      id: string;
      telegram_user_id: string;
      telegram_users: { telegram_user_id: string } | Array<{ telegram_user_id: string }>;
      cook_profiles?: { preferred_language?: CookLanguage } | Array<{ preferred_language?: CookLanguage }>;
    };
    const telegramUser = Array.isArray(row.telegram_users) ? row.telegram_users[0] : row.telegram_users;
    const cookProfile = Array.isArray(row.cook_profiles) ? row.cook_profiles[0] : row.cook_profiles;

    return {
      memberId: row.id,
      telegramUserRowId: row.telegram_user_id,
      telegramUserId: telegramUser.telegram_user_id,
      preferredLanguage: cookProfile?.preferred_language ?? "hinglish",
    };
  }

  async recordVoiceAsset(input: VoiceAssetInsert): Promise<{ id: string }> {
    const result = await this.supabase
      .from("voice_assets")
      .insert({
        message_event_id: input.messageEventId,
        telegram_file_id: input.telegramFileId,
        provider: "sarvam",
        stt_status: "pending",
      })
      .select("id")
      .single<RowId>();

    if (result.error) {
      throw result.error;
    }

    return { id: result.data.id };
  }

  async markVoiceAssetTranscribed(input: { id: string; transcript: string; languageCode?: string | null }): Promise<void> {
    const result = await this.supabase
      .from("voice_assets")
      .update({
        stt_status: "transcribed",
        transcript: input.transcript,
        transcript_language: input.languageCode,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);

    if (result.error) {
      throw result.error;
    }
  }

  async markVoiceAssetFailed(input: { id: string }): Promise<void> {
    const result = await this.supabase
      .from("voice_assets")
      .update({
        stt_status: "failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id);

    if (result.error) {
      throw result.error;
    }
  }

  async createAgentRun(input: AgentRunInsert): Promise<{ id: string }> {
    const result = await this.supabase
      .from("agent_runs")
      .insert({
        household_id: input.householdId,
        message_event_id: input.messageEventId,
        agent_name: input.agentName,
        trace_id: input.traceId,
        model: input.model,
        sanitized_input: input.sanitizedInput,
        status: "started",
      })
      .select("id")
      .single<RowId>();

    if (result.error) {
      throw result.error;
    }

    return { id: result.data.id };
  }

  async completeAgentRun(input: { id: string; intent?: string; sanitizedOutput: Record<string, unknown> }): Promise<void> {
    const result = await this.supabase
      .from("agent_runs")
      .update({
        intent: input.intent,
        status: "succeeded",
        sanitized_output: input.sanitizedOutput,
        completed_at: new Date().toISOString(),
      })
      .eq("id", input.id);

    if (result.error) {
      throw result.error;
    }
  }

  async failAgentRun(input: { id: string; errorSummary: string }): Promise<void> {
    const result = await this.supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error_summary: input.errorSummary,
        completed_at: new Date().toISOString(),
      })
      .eq("id", input.id);

    if (result.error) {
      throw result.error;
    }
  }

  async findActiveSwiggyConnection(householdId: string): Promise<StoredSwiggyConnection | null> {
    const result = await this.supabase
      .from("swiggy_connections")
      .select("id, encrypted_access_token")
      .eq("household_id", householdId)
      .eq("status", "connected")
      .gt("token_expires_at", new Date().toISOString())
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    if (!result.data?.encrypted_access_token) {
      return null;
    }

    return {
      id: result.data.id,
      encryptedAccessToken: result.data.encrypted_access_token,
    };
  }

  async createCartSession(input: {
    householdId: string;
    swiggyConnectionId: string;
    selectedAddressId: string;
  }): Promise<StoredCartSession> {
    const result = await this.supabase
      .from("cart_sessions")
      .insert({
        household_id: input.householdId,
        swiggy_connection_id: input.swiggyConnectionId,
        selected_address_id: input.selectedAddressId,
        status: "building",
        revision: 1,
      })
      .select("id, household_id, swiggy_connection_id, status, revision, selected_address_id, expires_at")
      .single();

    if (result.error) {
      throw result.error;
    }

    return toStoredCartSession(result.data);
  }

  async replaceCartItems(input: { cartSessionId: string; revision: number; items: CartItemInsert[] }): Promise<void> {
    const deleteResult = await this.supabase
      .from("cart_items")
      .delete()
      .eq("cart_session_id", input.cartSessionId)
      .eq("revision", input.revision);

    if (deleteResult.error) {
      throw deleteResult.error;
    }

    if (input.items.length === 0) {
      return;
    }

    const insertResult = await this.supabase.from("cart_items").insert(
      input.items.map((item) => ({
        cart_session_id: input.cartSessionId,
        revision: input.revision,
        requested_name: item.requestedName,
        selected_product_name: item.selectedProductName,
        spin_id: item.spinId,
        quantity: item.quantity,
        unit: item.unit,
        price_minor: item.priceMinor,
      })),
    );

    if (insertResult.error) {
      throw insertResult.error;
    }
  }

  async findCartItems(input: { cartSessionId: string; revision: number }): Promise<StoredCartItem[]> {
    const result = await this.supabase
      .from("cart_items")
      .select("cart_session_id, revision, requested_name, selected_product_name, spin_id, quantity, unit, price_minor")
      .eq("cart_session_id", input.cartSessionId)
      .eq("revision", input.revision);

    if (result.error) {
      throw result.error;
    }

    return result.data.map((row) => ({
      cartSessionId: row.cart_session_id,
      revision: row.revision,
      requestedName: row.requested_name,
      selectedProductName: row.selected_product_name ?? undefined,
      spinId: row.spin_id,
      quantity: row.quantity,
      unit: row.unit ?? undefined,
      priceMinor: row.price_minor ?? undefined,
    }));
  }

  async openCartUpsellWindow(input: { cartSessionId: string; revision: number; expiresAt: Date }): Promise<void> {
    const result = await this.supabase
      .from("cart_sessions")
      .update({
        status: "upsell_open",
        upsell_opened_at: new Date().toISOString(),
        expires_at: input.expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.cartSessionId)
      .eq("revision", input.revision)
      .eq("status", "building");

    if (result.error) {
      throw result.error;
    }
  }

  async moveCartToRevision(input: {
    cartSessionId: string;
    expectedRevision: number;
    nextRevision: number;
    status: StoredCartSession["status"];
  }): Promise<StoredCartSession | null> {
    const result = await this.supabase
      .from("cart_sessions")
      .update({
        revision: input.nextRevision,
        status: input.status,
        expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.cartSessionId)
      .eq("revision", input.expectedRevision)
      .select("id, household_id, swiggy_connection_id, status, revision, selected_address_id, expires_at")
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data ? toStoredCartSession(result.data) : null;
  }

  async markCartApprovalPending(input: { cartSessionId: string; revision: number; approvalMessageId?: string }): Promise<void> {
    const result = await this.supabase
      .from("cart_sessions")
      .update({
        status: "approval_pending",
        approval_message_id: input.approvalMessageId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.cartSessionId)
      .eq("revision", input.revision);

    if (result.error) {
      throw result.error;
    }
  }

  async findCartSession(cartSessionId: string): Promise<StoredCartSession | null> {
    const result = await this.supabase
      .from("cart_sessions")
      .select("id, household_id, swiggy_connection_id, status, revision, selected_address_id, expires_at")
      .eq("id", cartSessionId)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data ? toStoredCartSession(result.data) : null;
  }

  async findActiveCartSession(householdId: string): Promise<StoredCartSession | null> {
    const result = await this.supabase
      .from("cart_sessions")
      .select("id, household_id, swiggy_connection_id, status, revision, selected_address_id, expires_at")
      .eq("household_id", householdId)
      .in("status", ["building", "upsell_open", "approval_pending"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data ? toStoredCartSession(result.data) : null;
  }

  async approveCartSession(input: { cartSessionId: string; revision: number; approvedByMemberId: string }): Promise<StoredCartSession | null> {
    const result = await this.supabase
      .from("cart_sessions")
      .update({
        status: "approved",
        approved_by_member_id: input.approvedByMemberId,
        approved_revision: input.revision,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.cartSessionId)
      .eq("revision", input.revision)
      .eq("status", "approval_pending")
      .select("id, household_id, swiggy_connection_id, status, revision, selected_address_id, expires_at")
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data ? toStoredCartSession(result.data) : null;
  }

  async markCartCheckedOut(cartSessionId: string): Promise<void> {
    const result = await this.supabase
      .from("cart_sessions")
      .update({ status: "checked_out", updated_at: new Date().toISOString() })
      .eq("id", cartSessionId);

    if (result.error) {
      throw result.error;
    }
  }

  async recordOrder(input: OrderInsert): Promise<{ id: string }> {
    const result = await this.supabase
      .from("orders")
      .upsert({
        household_id: input.householdId,
        cart_session_id: input.cartSessionId,
        swiggy_connection_id: input.swiggyConnectionId,
        local_order_id: input.localOrderId,
        swiggy_order_id: input.swiggyOrderId,
        status: input.status,
        total_minor: input.totalMinor,
        tracking_state: input.trackingState,
      }, { onConflict: "local_order_id" })
      .select("id")
      .single<RowId>();

    if (result.error) {
      throw result.error;
    }

    return { id: result.data.id };
  }
}

function toStoredMember(row: {
  id: string;
  household_id: string;
  telegram_user_id: string;
  role: HouseholdRole;
}): StoredHouseholdMember {
  return {
    id: row.id,
    householdId: row.household_id,
    telegramUserId: row.telegram_user_id,
    role: row.role,
  };
}

function toStoredCartSession(row: {
  id: string;
  household_id: string;
  swiggy_connection_id: string | null;
  status: StoredCartSession["status"];
  revision: number;
  selected_address_id: string | null;
  expires_at?: string | null;
}): StoredCartSession {
  return {
    id: row.id,
    householdId: row.household_id,
    swiggyConnectionId: row.swiggy_connection_id,
    status: row.status,
    revision: row.revision,
    selectedAddressId: row.selected_address_id,
    expiresAt: row.expires_at,
  };
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentRunInsert,
  MessageEventInsert,
  StoredHouseholdChat,
  StoredCookMember,
  StoredHouseholdMember,
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

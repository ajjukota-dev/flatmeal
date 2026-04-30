import { describe, expect, it } from "vitest";
import { TelegramOnboardingService } from "./onboarding.js";
import type {
  MessageEventInsert,
  StoredHouseholdChat,
  StoredHouseholdMember,
  StoredTelegramUser,
  TelegramOnboardingRepository,
} from "./repository.js";
import type { CookLanguage, HouseholdRole, TelegramChat, TelegramUser } from "./types.js";

class InMemoryTelegramRepository implements TelegramOnboardingRepository {
  messageUpdateIds = new Set<string>();
  chats = new Map<string, StoredHouseholdChat>();
  users = new Map<string, StoredTelegramUser>();
  members = new Map<string, StoredHouseholdMember>();
  cookLanguages = new Map<string, CookLanguage>();

  async recordMessageEvent(input: MessageEventInsert): Promise<{ duplicate: boolean }> {
    const updateId = String(input.update.update_id);
    if (this.messageUpdateIds.has(updateId)) {
      return { duplicate: true };
    }
    this.messageUpdateIds.add(updateId);
    return { duplicate: false };
  }

  async ensureHouseholdForChat(chat: TelegramChat): Promise<StoredHouseholdChat> {
    const key = String(chat.id);
    const existing = this.chats.get(key);
    if (existing) {
      return existing;
    }
    const created = { id: `chat-${key}`, householdId: `household-${key}`, telegramChatId: key };
    this.chats.set(key, created);
    return created;
  }

  async upsertTelegramUser(user: TelegramUser): Promise<StoredTelegramUser> {
    const key = String(user.id);
    const existing = this.users.get(key);
    if (existing) {
      return existing;
    }
    const created = { id: `user-${key}`, telegramUserId: key };
    this.users.set(key, created);
    return created;
  }

  async findOwnerMember(householdId: string): Promise<StoredHouseholdMember | null> {
    return [...this.members.values()].find((member) => member.householdId === householdId && member.role === "owner") ?? null;
  }

  async findHouseholdMember(input: {
    householdId: string;
    telegramUserId: string;
  }): Promise<StoredHouseholdMember | null> {
    return this.members.get(`${input.householdId}:${input.telegramUserId}`) ?? null;
  }

  async upsertHouseholdMember(input: {
    householdId: string;
    telegramUserId: string;
    role: HouseholdRole;
  }): Promise<StoredHouseholdMember> {
    const key = `${input.householdId}:${input.telegramUserId}`;
    const existing = this.members.get(key);
    if (existing) {
      existing.role = input.role;
      return existing;
    }
    const created = {
      id: `member-${this.members.size + 1}`,
      householdId: input.householdId,
      telegramUserId: input.telegramUserId,
      role: input.role,
    };
    this.members.set(key, created);
    return created;
  }

  async setCookLanguage(input: { householdMemberId: string; language: CookLanguage }): Promise<void> {
    this.cookLanguages.set(input.householdMemberId, input.language);
  }
}

describe("TelegramOnboardingService", () => {
  it("creates a household and setup-card action when the bot is added to a group", async () => {
    const repository = new InMemoryTelegramRepository();
    const service = new TelegramOnboardingService(repository, { botUserId: "999" });

    const result = await service.handleUpdate({
      update_id: 1,
      message: {
        message_id: 10,
        chat: { id: -100, type: "group", title: "Flat" },
        from: { id: 123, first_name: "A" },
        new_chat_members: [{ id: 999, is_bot: true, first_name: "Flatmeal" }],
      },
    });

    expect(result).toEqual({
      duplicate: false,
      actions: [{ type: "send_setup_card", chatId: "-100", householdId: "household--100" }],
    });
  });

  it("deduplicates repeated Telegram update ids", async () => {
    const repository = new InMemoryTelegramRepository();
    const service = new TelegramOnboardingService(repository, { botUserId: "999" });
    const update = {
      update_id: 1,
      message: {
        message_id: 10,
        chat: { id: -100, type: "group" as const },
        from: { id: 123 },
        text: "hello",
      },
    };

    await service.handleUpdate(update);
    const duplicate = await service.handleUpdate(update);

    expect(duplicate).toEqual({ duplicate: true, actions: [] });
  });

  it("uses first-owner-wins for role callbacks", async () => {
    const repository = new InMemoryTelegramRepository();
    const service = new TelegramOnboardingService(repository, { botUserId: "999" });
    const message = { message_id: 20, chat: { id: -100, type: "group" as const } };

    await service.handleUpdate({
      update_id: 2,
      callback_query: { id: "cb1", from: { id: 1 }, message, data: "fm:role:owner" },
    });
    const second = await service.handleUpdate({
      update_id: 3,
      callback_query: { id: "cb2", from: { id: 2 }, message, data: "fm:role:owner" },
    });

    expect(second.actions).toEqual([
      {
        type: "answer_callback",
        callbackQueryId: "cb2",
        text: "Owner is already set for this household.",
      },
    ]);
  });

  it("stores cook language from callback data", async () => {
    const repository = new InMemoryTelegramRepository();
    const service = new TelegramOnboardingService(repository, { botUserId: "999" });
    const message = { message_id: 20, chat: { id: -100, type: "group" as const } };

    await service.handleUpdate({
      update_id: 4,
      callback_query: { id: "cb3", from: { id: 7 }, message, data: "fm:role:cook" },
    });
    await service.handleUpdate({
      update_id: 5,
      callback_query: { id: "cb4", from: { id: 7 }, message, data: "fm:lang:hinglish" },
    });

    expect([...repository.cookLanguages.values()]).toEqual(["hinglish"]);
  });

  it("rejects cook language callback before cook role is selected", async () => {
    const repository = new InMemoryTelegramRepository();
    const service = new TelegramOnboardingService(repository, { botUserId: "999" });
    const message = { message_id: 20, chat: { id: -100, type: "group" as const } };

    const result = await service.handleUpdate({
      update_id: 6,
      callback_query: { id: "cb5", from: { id: 8 }, message, data: "fm:lang:hi" },
    });

    expect(result.actions).toEqual([
      {
        type: "answer_callback",
        callbackQueryId: "cb5",
        text: "Select cook role before choosing cook language.",
      },
    ]);
    expect(repository.cookLanguages.size).toBe(0);
  });
});

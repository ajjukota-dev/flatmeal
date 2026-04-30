import type { CookLanguage, HouseholdRole, TelegramChat, TelegramMessage, TelegramUpdate, TelegramUser } from "./types.js";

export type StoredHouseholdChat = {
  id: string;
  householdId: string;
  telegramChatId: string;
};

export type StoredTelegramUser = {
  id: string;
  telegramUserId: string;
};

export type StoredHouseholdMember = {
  id: string;
  householdId: string;
  telegramUserId: string;
  role: HouseholdRole;
};

export type MessageEventInsert = {
  update: TelegramUpdate;
  message: TelegramMessage;
  householdId?: string;
  telegramChatRowId?: string;
  telegramUserRowId?: string;
};

export interface TelegramOnboardingRepository {
  recordMessageEvent(input: MessageEventInsert): Promise<{ duplicate: boolean }>;
  ensureHouseholdForChat(chat: TelegramChat): Promise<StoredHouseholdChat>;
  upsertTelegramUser(user: TelegramUser): Promise<StoredTelegramUser>;
  findOwnerMember(householdId: string): Promise<StoredHouseholdMember | null>;
  findHouseholdMember(input: {
    householdId: string;
    telegramUserId: string;
  }): Promise<StoredHouseholdMember | null>;
  upsertHouseholdMember(input: {
    householdId: string;
    telegramUserId: string;
    role: HouseholdRole;
  }): Promise<StoredHouseholdMember>;
  setCookLanguage(input: { householdMemberId: string; language: CookLanguage }): Promise<void>;
}

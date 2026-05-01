import type { CookLanguage, HouseholdRole, TelegramChat, TelegramMessage, TelegramUpdate, TelegramUser } from "./types.js";
import type { SpecialistAgentName } from "../agents/specialists.js";

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

export type StoredCookMember = {
  memberId: string;
  telegramUserRowId: string;
  telegramUserId: string;
  preferredLanguage: CookLanguage;
};

export type MessageEventInsert = {
  update: TelegramUpdate;
  message: TelegramMessage;
  householdId?: string;
  telegramChatRowId?: string;
  telegramUserRowId?: string;
};

export type VoiceAssetInsert = {
  messageEventId: string;
  telegramFileId: string;
};

export type AgentRunInsert = {
  householdId: string;
  messageEventId: string;
  agentName: SpecialistAgentName;
  traceId?: string;
  model?: string;
  sanitizedInput: Record<string, unknown>;
};

export interface TelegramOnboardingRepository {
  recordMessageEvent(input: MessageEventInsert): Promise<{ id?: string; duplicate: boolean }>;
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
  findCookForHousehold(householdId: string): Promise<StoredCookMember | null>;
  recordVoiceAsset(input: VoiceAssetInsert): Promise<{ id: string }>;
  markVoiceAssetTranscribed(input: { id: string; transcript: string; languageCode?: string | null }): Promise<void>;
  markVoiceAssetFailed(input: { id: string }): Promise<void>;
  createAgentRun(input: AgentRunInsert): Promise<{ id: string }>;
  completeAgentRun(input: { id: string; intent?: string; sanitizedOutput: Record<string, unknown> }): Promise<void>;
  failAgentRun(input: { id: string; errorSummary: string }): Promise<void>;
}

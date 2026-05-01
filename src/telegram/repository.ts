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

export type StoredSwiggyConnection = {
  id: string;
  encryptedAccessToken: string;
};

export type StoredCartSession = {
  id: string;
  householdId: string;
  swiggyConnectionId: string | null;
  status: "building" | "upsell_open" | "approval_pending" | "approved" | "checked_out" | "expired" | "failed";
  revision: number;
  selectedAddressId: string | null;
};

export type CartItemInsert = {
  requestedName: string;
  selectedProductName?: string;
  spinId: string;
  quantity: number;
  unit?: string;
  priceMinor?: number;
};

export type OrderInsert = {
  householdId: string;
  cartSessionId: string;
  swiggyConnectionId?: string | null;
  localOrderId: string;
  swiggyOrderId?: string;
  status: "created" | "confirmed" | "tracking" | "delivered" | "failed";
  totalMinor?: number;
  trackingState: Record<string, unknown>;
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
  findActiveSwiggyConnection(householdId: string): Promise<StoredSwiggyConnection | null>;
  createCartSession(input: {
    householdId: string;
    swiggyConnectionId: string;
    selectedAddressId: string;
  }): Promise<StoredCartSession>;
  replaceCartItems(input: { cartSessionId: string; revision: number; items: CartItemInsert[] }): Promise<void>;
  markCartApprovalPending(input: { cartSessionId: string; revision: number; approvalMessageId?: string }): Promise<void>;
  findCartSession(cartSessionId: string): Promise<StoredCartSession | null>;
  findActiveCartSession(householdId: string): Promise<StoredCartSession | null>;
  approveCartSession(input: { cartSessionId: string; revision: number; approvedByMemberId: string }): Promise<StoredCartSession | null>;
  markCartCheckedOut(cartSessionId: string): Promise<void>;
  recordOrder(input: OrderInsert): Promise<{ id: string }>;
}

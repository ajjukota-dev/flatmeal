import { parseCallbackData } from "./callback-data.js";
import type { TelegramOnboardingRepository } from "./repository.js";
import type { TelegramAction, TelegramMessage, TelegramUpdate } from "./types.js";

type OnboardingOptions = {
  botUserId: string;
  publicBaseUrl: string;
};

export type TelegramUpdateResult = {
  duplicate: boolean;
  actions: TelegramAction[];
};

export class TelegramOnboardingService {
  constructor(
    private readonly repository: TelegramOnboardingRepository,
    private readonly options: OnboardingOptions,
  ) {}

  async handleUpdate(update: TelegramUpdate): Promise<TelegramUpdateResult> {
    if (update.message) {
      return this.handleMessage(update, update.message);
    }

    if (update.callback_query) {
      const intent = parseCallbackData(update.callback_query.data);
      if (intent.type === "unknown" || !update.callback_query.message) {
        return { duplicate: false, actions: [] };
      }

      const chat = await this.repository.ensureHouseholdForChat(update.callback_query.message.chat);
      const user = await this.repository.upsertTelegramUser(update.callback_query.from);

      if (intent.type === "select_role") {
        if (intent.role === "owner") {
          const existingOwner = await this.repository.findOwnerMember(chat.householdId);
          if (existingOwner && existingOwner.telegramUserId !== user.id) {
            return {
              duplicate: false,
              actions: [
                {
                  type: "answer_callback",
                  callbackQueryId: update.callback_query.id,
                  text: "Owner is already set for this household.",
                },
              ],
            };
          }
        }

        const member = await this.repository.upsertHouseholdMember({
          householdId: chat.householdId,
          telegramUserId: user.id,
          role: intent.role,
        });

        const actions: TelegramAction[] = [
          {
            type: "answer_callback",
            callbackQueryId: update.callback_query.id,
            text: `Role saved: ${intent.role}.`,
          },
        ];

        if (intent.role === "owner") {
          const authUrl = new URL("/swiggy/connect/start", this.options.publicBaseUrl);
          authUrl.searchParams.set("householdId", chat.householdId);
          authUrl.searchParams.set("ownerMemberId", member.id);
          actions.push({
            type: "send_swiggy_connect_link",
            telegramUserId: user.telegramUserId,
            authUrl: authUrl.toString(),
          });
        }

        if (intent.role === "cook") {
          actions.push({
            type: "send_cook_language_card",
            chatId: chat.telegramChatId,
            householdId: chat.householdId,
            memberId: member.id,
          });
        }

        return { duplicate: false, actions };
      }

      const member = await this.repository.findHouseholdMember({
        householdId: chat.householdId,
        telegramUserId: user.id,
      });
      if (!member || member.role !== "cook") {
        return {
          duplicate: false,
          actions: [
            {
              type: "answer_callback",
              callbackQueryId: update.callback_query.id,
              text: "Select cook role before choosing cook language.",
            },
          ],
        };
      }

      await this.repository.setCookLanguage({ householdMemberId: member.id, language: intent.language });

      return {
        duplicate: false,
        actions: [
          {
            type: "answer_callback",
            callbackQueryId: update.callback_query.id,
            text: "Cook language saved.",
          },
        ],
      };
    }

    return { duplicate: false, actions: [] };
  }

  private async handleMessage(update: TelegramUpdate, message: TelegramMessage): Promise<TelegramUpdateResult> {
    const chat = await this.repository.ensureHouseholdForChat(message.chat);
    const user = message.from ? await this.repository.upsertTelegramUser(message.from) : undefined;
    const event = await this.repository.recordMessageEvent({
      update,
      message,
      householdId: chat.householdId,
      telegramChatRowId: chat.id,
      telegramUserRowId: user?.id,
    });

    if (event.duplicate) {
      return { duplicate: true, actions: [] };
    }

    if (this.wasBotAdded(message)) {
      return {
        duplicate: false,
        actions: [
          {
            type: "send_setup_card",
            chatId: chat.telegramChatId,
            householdId: chat.householdId,
          },
        ],
      };
    }

    return { duplicate: false, actions: [] };
  }

  private wasBotAdded(message: TelegramMessage): boolean {
    return Boolean(message.new_chat_members?.some((member) => member.is_bot && String(member.id) === this.options.botUserId));
  }
}

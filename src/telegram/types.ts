export type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramChat = {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
};

export type TelegramMessage = {
  message_id: number;
  date?: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  voice?: { file_id: string };
  new_chat_members?: TelegramUser[];
};

export type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

export type HouseholdRole = "owner" | "cook" | "flatmate";
export type CookLanguage = "hi" | "hinglish" | "ta" | "te" | "en";

export type TelegramAction =
  | {
      type: "send_setup_card";
      chatId: string;
      householdId: string;
    }
  | {
      type: "send_cook_language_card";
      chatId: string;
      householdId: string;
      memberId: string;
    }
  | {
      type: "answer_callback";
      callbackQueryId: string;
      text: string;
    };

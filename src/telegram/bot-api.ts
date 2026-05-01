import { cartApprovalCallbackData, cookLanguageCallbackData, roleCallbackData } from "./callback-data.js";
import type { TelegramAction } from "./types.js";

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

type FetchLike = typeof fetch;

export type TelegramFile = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
};

export type TelegramBotUser = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
  can_join_groups?: boolean;
  can_read_all_group_messages?: boolean;
  supports_inline_queries?: boolean;
};

export type DownloadedTelegramFile = {
  file: TelegramFile;
  filename: string;
  data: Buffer;
};

export class TelegramBotApi {
  private readonly baseUrl: string;
  private readonly fileBaseUrl: string;

  constructor(
    token: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
    this.fileBaseUrl = `https://api.telegram.org/file/bot${token}`;
  }

  async dispatch(action: TelegramAction): Promise<void> {
    if (action.type === "send_setup_card") {
      await this.sendMessage({
        chat_id: action.chatId,
        text: "Flatmeal setup: choose your household role.",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "I am owner", callback_data: roleCallbackData.owner },
              { text: "I am cook", callback_data: roleCallbackData.cook },
            ],
            [{ text: "I am flatmate", callback_data: roleCallbackData.flatmate }],
          ],
        },
      });
      return;
    }

    if (action.type === "send_cook_language_card") {
      await this.sendMessage({
        chat_id: action.chatId,
        text: "Cook language preference:",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Hindi", callback_data: cookLanguageCallbackData.hi },
              { text: "Hinglish", callback_data: cookLanguageCallbackData.hinglish },
            ],
            [
              { text: "Tamil", callback_data: cookLanguageCallbackData.ta },
              { text: "Telugu", callback_data: cookLanguageCallbackData.te },
              { text: "English", callback_data: cookLanguageCallbackData.en },
            ],
          ],
        },
      });
      return;
    }

    if (action.type === "send_swiggy_connect_link") {
      await this.sendMessage({
        chat_id: action.telegramUserId,
        text: `Connect Swiggy: ${action.authUrl}`,
      });
      return;
    }

    if (action.type === "send_text_message") {
      await this.sendMessage({
        chat_id: action.chatId,
        text: action.text,
      });
      return;
    }

    if (action.type === "send_cart_approval_card") {
      await this.sendMessage({
        chat_id: action.chatId,
        text: action.text,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Approve cart",
                callback_data: cartApprovalCallbackData({
                  cartSessionId: action.cartSessionId,
                  revision: action.revision,
                }),
              },
            ],
          ],
        },
      });
      return;
    }

    if (action.type === "send_voice_note") {
      await this.sendVoice({
        chatId: action.chatId,
        voice: action.voice,
        filename: action.filename,
        caption: action.caption,
      });
      return;
    }

    await this.call("answerCallbackQuery", {
      callback_query_id: action.callbackQueryId,
      text: action.text,
    });
  }

  async getFile(fileId: string): Promise<TelegramFile> {
    return this.call<TelegramFile>("getFile", { file_id: fileId });
  }

  async getMe(): Promise<TelegramBotUser> {
    return this.call<TelegramBotUser>("getMe", {});
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const response = await this.fetchImpl(`${this.fileBaseUrl}/${filePath}`);
    if (!response.ok) {
      throw new Error(`Telegram file download failed: ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async downloadVoice(fileId: string): Promise<DownloadedTelegramFile> {
    const file = await this.getFile(fileId);
    if (!file.file_path) {
      throw new Error("Telegram getFile response did not include file_path");
    }
    return {
      file,
      filename: file.file_path.split("/").at(-1) ?? "voice.ogg",
      data: await this.downloadFile(file.file_path),
    };
  }

  async sendVoice(input: { chatId: string; voice: Blob; filename?: string; caption?: string; duration?: number }): Promise<void> {
    const body = new FormData();
    body.set("chat_id", input.chatId);
    body.set("voice", input.voice, input.filename ?? "voice.ogg");
    if (input.caption) {
      body.set("caption", input.caption);
    }
    if (input.duration !== undefined) {
      body.set("duration", String(input.duration));
    }
    await this.callMultipart("sendVoice", body);
  }

  private async sendMessage(body: {
    chat_id: string;
    text: string;
    reply_markup?: {
      inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
    };
  }): Promise<void> {
    await this.call("sendMessage", body);
  }

  private async call<T>(method: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || !payload.ok) {
      throw new Error(`Telegram ${method} failed: ${payload.description ?? response.statusText}`);
    }

    return payload.result as T;
  }

  private async callMultipart<T>(method: string, body: FormData): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/${method}`, {
      method: "POST",
      body,
    });

    const payload = (await response.json()) as TelegramApiResponse<T>;
    if (!response.ok || !payload.ok) {
      throw new Error(`Telegram ${method} failed: ${payload.description ?? response.statusText}`);
    }

    return payload.result as T;
  }
}

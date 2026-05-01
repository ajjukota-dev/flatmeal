import { describe, expect, it } from "vitest";
import { TelegramBotApi } from "./bot-api.js";

describe("TelegramBotApi", () => {
  it("sends setup card with role callback buttons", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const bot = new TelegramBotApi("123:secret", async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ ok: true, result: true });
    });

    await bot.dispatch({ type: "send_setup_card", chatId: "-100", householdId: "household-1" });

    expect(calls).toEqual([
      {
        url: "https://api.telegram.org/bot123:secret/sendMessage",
        body: {
          chat_id: "-100",
          text: "Flatmeal setup: choose your household role.",
          reply_markup: {
            inline_keyboard: [
              [
                { text: "I am owner", callback_data: "fm:role:owner" },
                { text: "I am cook", callback_data: "fm:role:cook" },
              ],
              [{ text: "I am flatmate", callback_data: "fm:role:flatmate" }],
            ],
          },
        },
      },
    ]);
  });

  it("answers callback queries without exposing token in errors", async () => {
    const bot = new TelegramBotApi("123:secret", async () => Response.json({ ok: false, description: "bad request" }, { status: 400 }));

    await expect(
      bot.dispatch({
        type: "answer_callback",
        callbackQueryId: "callback-1",
        text: "Saved",
      }),
    ).rejects.toThrow("Telegram answerCallbackQuery failed: bad request");
  });

  it("sends fake Swiggy connect links privately", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const bot = new TelegramBotApi("123:secret", async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ ok: true, result: true });
    });

    await bot.dispatch({
      type: "send_swiggy_connect_link",
      telegramUserId: "42",
      authUrl: "http://localhost:3000/swiggy/connect/start?householdId=hh&ownerMemberId=member",
    });

    expect(calls[0]?.body).toEqual({
      chat_id: "42",
      text: "Connect Swiggy: http://localhost:3000/swiggy/connect/start?householdId=hh&ownerMemberId=member",
    });
  });

  it("dispatches workflow text messages", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const bot = new TelegramBotApi("123:secret", async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ ok: true, result: true });
    });

    await bot.dispatch({ type: "send_text_message", chatId: "-100", text: "Cook prompt" });

    expect(calls).toEqual([
      {
        url: "https://api.telegram.org/bot123:secret/sendMessage",
        body: { chat_id: "-100", text: "Cook prompt" },
      },
    ]);
  });

  it("sends cart approval cards with revisioned callback data", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const bot = new TelegramBotApi("123:secret", async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({ ok: true, result: true });
    });

    await bot.dispatch({
      type: "send_cart_approval_card",
      chatId: "-100",
      text: "Cart revision 2",
      cartSessionId: "cart-1",
      revision: 2,
    });

    expect(calls).toEqual([
      {
        url: "https://api.telegram.org/bot123:secret/sendMessage",
        body: {
          chat_id: "-100",
          text: "Cart revision 2",
          reply_markup: {
            inline_keyboard: [[{ text: "Approve cart", callback_data: "fm:cart:approve:cart-1:2" }]],
          },
        },
      },
    ]);
  });

  it("downloads Telegram voice files through getFile file_path", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const bot = new TelegramBotApi("123:secret", async (url, init) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (String(url).endsWith("/getFile")) {
        return Response.json({
          ok: true,
          result: {
            file_id: "voice-file-id",
            file_unique_id: "voice-unique-id",
            file_size: 12,
            file_path: "voice/file_1.oga",
          },
        });
      }
      return new Response("voice-bytes");
    });

    await expect(bot.downloadVoice("voice-file-id")).resolves.toMatchObject({
      file: { file_id: "voice-file-id", file_path: "voice/file_1.oga" },
      filename: "file_1.oga",
      data: Buffer.from("voice-bytes"),
    });

    expect(calls).toEqual([
      {
        url: "https://api.telegram.org/bot123:secret/getFile",
        body: { file_id: "voice-file-id" },
      },
      {
        url: "https://api.telegram.org/file/bot123:secret/voice/file_1.oga",
        body: undefined,
      },
    ]);
  });

  it("reads bot configuration through getMe", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const bot = new TelegramBotApi("123:secret", async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return Response.json({
        ok: true,
        result: {
          id: 42,
          is_bot: true,
          first_name: "Flatmeal",
          username: "flatmeal_bot",
          can_join_groups: true,
          can_read_all_group_messages: false,
        },
      });
    });

    await expect(bot.getMe()).resolves.toMatchObject({
      id: 42,
      is_bot: true,
      username: "flatmeal_bot",
      can_read_all_group_messages: false,
    });

    expect(calls).toEqual([
      {
        url: "https://api.telegram.org/bot123:secret/getMe",
        body: {},
      },
    ]);
  });

  it("uploads cook prompts with sendVoice multipart fields", async () => {
    const calls: Array<{ url: string; body?: BodyInit | null }> = [];
    const bot = new TelegramBotApi("123:secret", async (url, init) => {
      calls.push({ url: String(url), body: init?.body });
      return Response.json({ ok: true, result: { message_id: 1 } });
    });

    await bot.sendVoice({
      chatId: "-100",
      voice: new Blob(["voice"], { type: "audio/ogg" }),
      filename: "cook_prompt.ogg",
      caption: "Cook prompt",
      duration: 4,
    });

    expect(calls[0]?.url).toBe("https://api.telegram.org/bot123:secret/sendVoice");
    const body = calls[0]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("chat_id")).toBe("-100");
    expect((body as FormData).get("voice")).toBeInstanceOf(Blob);
    expect((body as FormData).get("caption")).toBe("Cook prompt");
    expect((body as FormData).get("duration")).toBe("4");
  });

  it("dispatches workflow voice notes", async () => {
    const calls: Array<{ url: string; body?: BodyInit | null }> = [];
    const bot = new TelegramBotApi("123:secret", async (url, init) => {
      calls.push({ url: String(url), body: init?.body });
      return Response.json({ ok: true, result: { message_id: 1 } });
    });

    await bot.dispatch({
      type: "send_voice_note",
      chatId: "-100",
      voice: new Blob(["voice"], { type: "audio/ogg" }),
      filename: "cook_prompt.ogg",
      caption: "Cook prompt",
    });

    expect(calls[0]?.url).toBe("https://api.telegram.org/bot123:secret/sendVoice");
    const body = calls[0]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("chat_id")).toBe("-100");
    expect((body as FormData).get("voice")).toBeInstanceOf(Blob);
    expect((body as FormData).get("caption")).toBe("Cook prompt");
  });
});

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
});

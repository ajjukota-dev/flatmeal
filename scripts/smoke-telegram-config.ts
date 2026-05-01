import "dotenv/config";
import { TelegramBotApi } from "../src/telegram/bot-api.js";

if (process.env.RUN_LIVE_TELEGRAM_SMOKE !== "true") {
  console.log("SKIP live Telegram config smoke: set RUN_LIVE_TELEGRAM_SMOKE=true and TELEGRAM_BOT_TOKEN");
  process.exit(0);
}

if (!process.env.TELEGRAM_BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is required when RUN_LIVE_TELEGRAM_SMOKE=true");
}

const bot = new TelegramBotApi(process.env.TELEGRAM_BOT_TOKEN);
const me = await bot.getMe();

if (!me.is_bot) {
  throw new Error("Telegram getMe did not return a bot account");
}

console.log(
  [
    `PASS live Telegram getMe smoke: id=${me.id}`,
    `username=${me.username ?? "not specified by Telegram"}`,
    `can_join_groups=${String(me.can_join_groups ?? "not specified by Telegram")}`,
    `can_read_all_group_messages=${String(me.can_read_all_group_messages ?? "not specified by Telegram")}`,
  ].join(" "),
);

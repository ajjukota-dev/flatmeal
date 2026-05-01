import "dotenv/config";
import { SarvamSpeechProvider } from "../src/speech/sarvam.js";
import { TelegramBotApi } from "../src/telegram/bot-api.js";

type TelegramGetUpdatesResponse = {
  ok: boolean;
  result?: Array<{
    update_id: number;
    message?: {
      message_id: number;
      chat: { id: number; type: string; title?: string; username?: string };
      voice?: { file_id: string; duration?: number; mime_type?: string; file_size?: number };
    };
  }>;
  description?: string;
};

if (process.env.RUN_LIVE_TELEGRAM_VOICE_SMOKE !== "true") {
  console.log("SKIP live Telegram voice STT smoke: set RUN_LIVE_TELEGRAM_VOICE_SMOKE=true, TELEGRAM_BOT_TOKEN, and SARVAM_API_KEY");
  process.exit(0);
}

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
if (!telegramToken) {
  throw new Error("TELEGRAM_BOT_TOKEN is required when RUN_LIVE_TELEGRAM_VOICE_SMOKE=true");
}
if (!process.env.SARVAM_API_KEY) {
  throw new Error("SARVAM_API_KEY is required when RUN_LIVE_TELEGRAM_VOICE_SMOKE=true");
}

const pollSeconds = Number(process.env.TELEGRAM_VOICE_POLL_SECONDS ?? 60);
if (!Number.isInteger(pollSeconds) || pollSeconds <= 0 || pollSeconds > 300) {
  throw new Error("TELEGRAM_VOICE_POLL_SECONDS must be an integer from 1 to 300");
}

const bot = new TelegramBotApi(telegramToken);
const sarvam = new SarvamSpeechProvider({ apiKey: process.env.SARVAM_API_KEY });
const apiBaseUrl = `https://api.telegram.org/bot${telegramToken}`;

const startOffset = await readNextOffset(apiBaseUrl);
console.log(`Waiting up to ${pollSeconds}s for a fresh Telegram voice note. Send one to the bot now.`);

const update = await waitForVoiceUpdate(apiBaseUrl, startOffset, pollSeconds);
if (!update?.message?.voice) {
  throw new Error("Timed out waiting for a fresh Telegram voice note");
}

const downloaded = await bot.downloadVoice(update.message.voice.file_id);
const transcription = await sarvam.transcribe({
  data: new Blob([new Uint8Array(downloaded.data)]),
  filename: downloaded.filename,
});

if (!transcription.transcript.trim()) {
  throw new Error("Sarvam STT returned an empty transcript for the Telegram voice note");
}

console.log(
  [
    `PASS live Telegram voice STT smoke: updateId=${update.update_id}`,
    `messageId=${update.message.message_id}`,
    `chatType=${update.message.chat.type}`,
    `language=${transcription.languageCode ?? "not specified by provider"}`,
    `transcript="${transcription.transcript}"`,
  ].join(" "),
);

async function readNextOffset(apiBaseUrl: string): Promise<number | undefined> {
  const updates = await getUpdates(apiBaseUrl, { timeout: 0, limit: 100, allowed_updates: ["message"] });
  if (!updates.length) {
    return undefined;
  }
  return Math.max(...updates.map((update) => update.update_id)) + 1;
}

async function waitForVoiceUpdate(apiBaseUrl: string, initialOffset: number | undefined, pollSeconds: number) {
  const deadline = Date.now() + pollSeconds * 1000;
  let offset = initialOffset;

  while (Date.now() < deadline) {
    const remainingSeconds = Math.max(1, Math.min(10, Math.ceil((deadline - Date.now()) / 1000)));
    const updates = await getUpdates(apiBaseUrl, {
      offset,
      timeout: remainingSeconds,
      limit: 10,
      allowed_updates: ["message"],
    });

    for (const update of updates) {
      offset = update.update_id + 1;
      if (update.message?.voice?.file_id) {
        return update;
      }
    }
  }

  return null;
}

async function getUpdates(
  apiBaseUrl: string,
  body: { offset?: number; timeout: number; limit: number; allowed_updates: string[] },
): Promise<NonNullable<TelegramGetUpdatesResponse["result"]>> {
  const response = await fetch(`${apiBaseUrl}/getUpdates`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as TelegramGetUpdatesResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(`Telegram getUpdates failed: ${payload.description ?? response.statusText}`);
  }
  return payload.result ?? [];
}

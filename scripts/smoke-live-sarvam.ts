import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { SarvamSpeechProvider } from "../src/speech/sarvam.js";
import type { SarvamSpeechToTextLanguage, SarvamTextToSpeechLanguage } from "../src/speech/types.js";

const ttsLanguages = new Set<SarvamTextToSpeechLanguage>([
  "bn-IN",
  "en-IN",
  "gu-IN",
  "hi-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "od-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
]);

const sttLanguages = new Set<SarvamSpeechToTextLanguage>([
  "unknown",
  "hi-IN",
  "bn-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "od-IN",
  "pa-IN",
  "ta-IN",
  "te-IN",
  "en-IN",
  "gu-IN",
  "as-IN",
  "ur-IN",
  "ne-IN",
  "kok-IN",
  "ks-IN",
  "sd-IN",
  "sa-IN",
  "sat-IN",
  "mni-IN",
  "brx-IN",
  "mai-IN",
  "doi-IN",
]);

if (process.env.RUN_LIVE_SARVAM_SMOKE !== "true") {
  console.log("SKIP live Sarvam smoke: set RUN_LIVE_SARVAM_SMOKE=true and SARVAM_API_KEY");
  process.exit(0);
}

if (!process.env.SARVAM_API_KEY) {
  throw new Error("SARVAM_API_KEY is required when RUN_LIVE_SARVAM_SMOKE=true");
}

const sarvam = new SarvamSpeechProvider({ apiKey: process.env.SARVAM_API_KEY });
const ttsLanguage = parseTtsLanguage(process.env.SARVAM_SMOKE_TTS_LANGUAGE ?? "en-IN");

const tts = await sarvam.synthesize({
  text: "Flatmeal smoke test.",
  targetLanguageCode: ttsLanguage,
  outputAudioCodec: "wav",
});
if (tts.audio.length === 0) {
  throw new Error("Sarvam TTS returned empty audio");
}
console.log(`PASS live Sarvam TTS smoke: requestId=${tts.requestId ?? "not specified by provider"} bytes=${tts.audio.length}`);

if (!process.env.SARVAM_STT_AUDIO_PATH) {
  console.log("SKIP live Sarvam STT smoke: set SARVAM_STT_AUDIO_PATH to an audio fixture path");
  process.exit(0);
}

const audio = await readFile(process.env.SARVAM_STT_AUDIO_PATH);
const stt = await sarvam.transcribe({
  data: new Blob([audio]),
  filename: basename(process.env.SARVAM_STT_AUDIO_PATH),
  languageCode: parseOptionalSttLanguage(process.env.SARVAM_SMOKE_STT_LANGUAGE),
});
if (!stt.transcript.trim()) {
  throw new Error("Sarvam STT returned an empty transcript");
}
console.log(`PASS live Sarvam STT smoke: requestId=${stt.requestId ?? "not specified by provider"} transcript="${stt.transcript}"`);

function parseTtsLanguage(value: string): SarvamTextToSpeechLanguage {
  if (ttsLanguages.has(value as SarvamTextToSpeechLanguage)) {
    return value as SarvamTextToSpeechLanguage;
  }
  throw new Error(`Unsupported SARVAM_SMOKE_TTS_LANGUAGE: ${value}`);
}

function parseOptionalSttLanguage(value: string | undefined): SarvamSpeechToTextLanguage | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (sttLanguages.has(value as SarvamSpeechToTextLanguage)) {
    return value as SarvamSpeechToTextLanguage;
  }
  throw new Error(`Unsupported SARVAM_SMOKE_STT_LANGUAGE: ${value}`);
}

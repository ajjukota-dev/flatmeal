import { z } from "zod";
import type {
  SpeechToTextProvider,
  TextToSpeechInput,
  TextToSpeechProvider,
  TextToSpeechResult,
  TranscribeAudioInput,
  TranscriptionResult,
} from "./types.js";

type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type SarvamSpeechProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: FetchFn;
};

const sarvamErrorResponseSchema = z
  .object({
    error: z
      .object({
        request_id: z.string().nullable(),
        message: z.string(),
        code: z.string(),
      })
      .strict(),
  })
  .strict();

const speechToTextResponseSchema = z
  .object({
    request_id: z.string().nullable(),
    transcript: z.string(),
    language_code: z.string().nullable(),
    language_probability: z.number().nullable().optional(),
    timestamps: z.unknown().nullable().optional(),
    diarized_transcript: z.unknown().nullable().optional(),
  })
  .strict();

const textToSpeechResponseSchema = z
  .object({
    request_id: z.string().nullable(),
    audios: z.array(z.string()).min(1),
  })
  .strict();

export class SarvamApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string | null,
  ) {
    super(message);
    this.name = "SarvamApiError";
  }
}

export class SarvamSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: FetchFn;

  constructor(options: SarvamSpeechProviderOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) {
      throw new Error("Sarvam API key is required");
    }
    this.baseUrl = (options.baseUrl ?? "https://api.sarvam.ai").replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async transcribe(input: TranscribeAudioInput): Promise<TranscriptionResult> {
    const body = new FormData();
    body.set("file", input.data, input.filename);
    if (input.model) {
      body.set("model", input.model);
    }
    if (input.mode) {
      body.set("mode", input.mode);
    }
    if (input.languageCode) {
      body.set("language_code", input.languageCode);
    }
    if (input.inputAudioCodec) {
      body.set("input_audio_codec", input.inputAudioCodec);
    }

    const response = await this.fetchFn(`${this.baseUrl}/speech-to-text`, {
      method: "POST",
      headers: { "api-subscription-key": this.apiKey },
      body,
    });

    const payload = await readJson(response);
    if (!response.ok) {
      throw buildSarvamError(response.status, payload);
    }

    const parsed = speechToTextResponseSchema.parse(payload);
    return {
      requestId: parsed.request_id,
      transcript: parsed.transcript,
      languageCode: parsed.language_code,
      languageProbability: parsed.language_probability,
    };
  }

  async synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    const requestBody: Record<string, unknown> = {
      text: input.text,
      target_language_code: input.targetLanguageCode,
    };
    if (input.model) {
      requestBody.model = input.model;
    }
    if (input.speaker) {
      requestBody.speaker = input.speaker;
    }
    if (input.pace !== undefined) {
      requestBody.pace = input.pace;
    }
    if (input.speechSampleRate) {
      requestBody.speech_sample_rate = input.speechSampleRate;
    }
    if (input.outputAudioCodec) {
      requestBody.output_audio_codec = input.outputAudioCodec;
    }
    if (input.temperature !== undefined) {
      requestBody.temperature = input.temperature;
    }

    const response = await this.fetchFn(`${this.baseUrl}/text-to-speech`, {
      method: "POST",
      headers: {
        "api-subscription-key": this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const payload = await readJson(response);
    if (!response.ok) {
      throw buildSarvamError(response.status, payload);
    }

    const parsed = textToSpeechResponseSchema.parse(payload);
    const audioBase64 = parsed.audios[0] ?? "";
    return {
      requestId: parsed.request_id,
      audioBase64,
      audio: Buffer.from(audioBase64, "base64"),
    };
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text) as unknown;
}

function buildSarvamError(status: number, payload: unknown): SarvamApiError {
  const parsed = sarvamErrorResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return new SarvamApiError(`Sarvam API request failed with HTTP ${status}`, status);
  }
  return new SarvamApiError(parsed.data.error.message, status, parsed.data.error.code, parsed.data.error.request_id);
}

import { describe, expect, it } from "vitest";
import { SarvamApiError, SarvamSpeechProvider } from "./sarvam.js";

describe("SarvamSpeechProvider", () => {
  it("calls Sarvam speech-to-text with documented multipart fields", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const provider = new SarvamSpeechProvider({
      apiKey: "sarvam-key",
      baseUrl: "https://api.example.test/",
      fetchFn: async (input, init) => {
        calls.push({ input, init });
        return new Response(
          JSON.stringify({
            request_id: "req_stt",
            transcript: "dal chawal banana hai",
            language_code: "hi-IN",
            language_probability: 0.97,
          }),
          { status: 200 },
        );
      },
    });

    await expect(
      provider.transcribe({
        data: new Blob(["audio"], { type: "audio/ogg" }),
        filename: "voice.ogg",
        model: "saarika:v2.5",
        languageCode: "unknown",
      }),
    ).resolves.toEqual({
      requestId: "req_stt",
      transcript: "dal chawal banana hai",
      languageCode: "hi-IN",
      languageProbability: 0.97,
    });

    expect(calls[0]?.input).toBe("https://api.example.test/speech-to-text");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.headers).toEqual({ "api-subscription-key": "sarvam-key" });
    const body = calls[0]?.init?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("model")).toBe("saarika:v2.5");
    expect((body as FormData).get("language_code")).toBe("unknown");
    expect((body as FormData).get("file")).toBeInstanceOf(Blob);
  });

  it("calls Sarvam text-to-speech with documented JSON fields and decodes audio", async () => {
    const calls: Array<{ input: string | URL; init?: RequestInit }> = [];
    const audioBase64 = Buffer.from("voice-bytes").toString("base64");
    const provider = new SarvamSpeechProvider({
      apiKey: "sarvam-key",
      baseUrl: "https://api.example.test",
      fetchFn: async (input, init) => {
        calls.push({ input, init });
        return new Response(JSON.stringify({ request_id: "req_tts", audios: [audioBase64] }), { status: 200 });
      },
    });

    await expect(
      provider.synthesize({
        text: "Cook ko puchho kya missing hai.",
        targetLanguageCode: "hi-IN",
        model: "bulbul:v3",
        outputAudioCodec: "wav",
      }),
    ).resolves.toMatchObject({
      requestId: "req_tts",
      audioBase64,
      audio: Buffer.from("voice-bytes"),
    });

    expect(calls[0]?.input).toBe("https://api.example.test/text-to-speech");
    expect(calls[0]?.init?.headers).toEqual({
      "api-subscription-key": "sarvam-key",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      text: "Cook ko puchho kya missing hai.",
      target_language_code: "hi-IN",
      model: "bulbul:v3",
      output_audio_codec: "wav",
    });
  });

  it("surfaces documented Sarvam error envelopes", async () => {
    const provider = new SarvamSpeechProvider({
      apiKey: "sarvam-key",
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            error: {
              request_id: "req_error",
              message: "Quota exceeded",
              code: "insufficient_quota_error",
            },
          }),
          { status: 429 },
        ),
    });

    await expect(
      provider.synthesize({ text: "hello", targetLanguageCode: "en-IN" }),
    ).rejects.toMatchObject({
      name: "SarvamApiError",
      status: 429,
      code: "insufficient_quota_error",
      requestId: "req_error",
    });
  });
});

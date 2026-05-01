import type { Agent } from "@openai/agents";
import { describe, expect, it } from "vitest";
import { OpenAISpecialistAgents, type SpecialistAgentRunOptions, type StructuredAgentRunner } from "../agents/specialists.js";
import type {
  SpeechToTextProvider,
  TextToSpeechInput,
  TextToSpeechProvider,
  TextToSpeechResult,
  TranscribeAudioInput,
  TranscriptionResult,
} from "../speech/types.js";
import { TelegramMessageWorkflowService, type TelegramVoiceDownloader } from "./message-workflow.js";
import type {
  AgentRunInsert,
  MessageEventInsert,
  StoredCookMember,
  StoredHouseholdChat,
  StoredHouseholdMember,
  StoredTelegramUser,
  TelegramOnboardingRepository,
  VoiceAssetInsert,
} from "./repository.js";
import type { CookLanguage, HouseholdRole, TelegramChat, TelegramMessage, TelegramUser } from "./types.js";

type AnyStructuredAgent = Agent<any, any>;

class FakeRunner implements StructuredAgentRunner {
  readonly calls: Array<{ agentName: string; input: string; options: SpecialistAgentRunOptions }> = [];

  constructor(private readonly outputs: unknown[]) {}

  async run<TOutput>(agent: AnyStructuredAgent, input: string, options: SpecialistAgentRunOptions): Promise<TOutput> {
    this.calls.push({ agentName: agent.name, input, options });
    return this.outputs.shift() as TOutput;
  }
}

class FakeSpeechProvider implements SpeechToTextProvider, TextToSpeechProvider {
  transcriptions: TranscriptionResult[] = [];
  syntheses: TextToSpeechInput[] = [];

  async transcribe(_input: TranscribeAudioInput): Promise<TranscriptionResult> {
    return this.transcriptions.shift() ?? { requestId: "stt-1", transcript: "", languageCode: null };
  }

  async synthesize(input: TextToSpeechInput): Promise<TextToSpeechResult> {
    this.syntheses.push(input);
    return {
      requestId: "tts-1",
      audioBase64: Buffer.from("voice").toString("base64"),
      audio: Buffer.from("voice"),
    };
  }
}

class FakeVoiceDownloader implements TelegramVoiceDownloader {
  downloads: string[] = [];

  async downloadVoice(fileId: string) {
    this.downloads.push(fileId);
    return {
      file: { file_id: fileId, file_unique_id: "voice-unique", file_path: "voice/file_1.oga" },
      filename: "file_1.oga",
      data: Buffer.from("voice-bytes"),
    };
  }
}

class FakeRepository implements TelegramOnboardingRepository {
  cook: StoredCookMember | null = {
    memberId: "member-cook",
    telegramUserRowId: "user-cook-row",
    telegramUserId: "777",
    preferredLanguage: "hinglish",
  };
  voiceAssets: Array<{ id: string; telegramFileId: string; status: string; transcript?: string; languageCode?: string | null }> = [];
  agentRuns: Array<AgentRunInsert & { id: string; status: string; sanitizedOutput?: Record<string, unknown>; intent?: string }> = [];

  async recordMessageEvent(_input: MessageEventInsert): Promise<{ id?: string; duplicate: boolean }> {
    return { id: "message-event-1", duplicate: false };
  }

  async ensureHouseholdForChat(chat: TelegramChat): Promise<StoredHouseholdChat> {
    return { id: "chat-row", householdId: `household-${chat.id}`, telegramChatId: String(chat.id) };
  }

  async upsertTelegramUser(user: TelegramUser): Promise<StoredTelegramUser> {
    return { id: `user-row-${user.id}`, telegramUserId: String(user.id) };
  }

  async findOwnerMember(_householdId: string): Promise<StoredHouseholdMember | null> {
    return null;
  }

  async findHouseholdMember(_input: { householdId: string; telegramUserId: string }): Promise<StoredHouseholdMember | null> {
    return null;
  }

  async upsertHouseholdMember(input: { householdId: string; telegramUserId: string; role: HouseholdRole }): Promise<StoredHouseholdMember> {
    return { id: "member-1", ...input };
  }

  async setCookLanguage(_input: { householdMemberId: string; language: CookLanguage }): Promise<void> {}

  async findCookForHousehold(_householdId: string): Promise<StoredCookMember | null> {
    return this.cook;
  }

  async recordVoiceAsset(input: VoiceAssetInsert): Promise<{ id: string }> {
    const asset = {
      id: `voice-asset-${this.voiceAssets.length + 1}`,
      telegramFileId: input.telegramFileId,
      status: "pending",
    };
    this.voiceAssets.push(asset);
    return { id: asset.id };
  }

  async markVoiceAssetTranscribed(input: { id: string; transcript: string; languageCode?: string | null }): Promise<void> {
    const asset = this.voiceAssets.find((candidate) => candidate.id === input.id);
    if (asset) {
      asset.status = "transcribed";
      asset.transcript = input.transcript;
      asset.languageCode = input.languageCode;
    }
  }

  async markVoiceAssetFailed(input: { id: string }): Promise<void> {
    const asset = this.voiceAssets.find((candidate) => candidate.id === input.id);
    if (asset) {
      asset.status = "failed";
    }
  }

  async createAgentRun(input: AgentRunInsert): Promise<{ id: string }> {
    const run = { ...input, id: `agent-run-${this.agentRuns.length + 1}`, status: "started" };
    this.agentRuns.push(run);
    return { id: run.id };
  }

  async completeAgentRun(input: { id: string; intent?: string; sanitizedOutput: Record<string, unknown> }): Promise<void> {
    const run = this.agentRuns.find((candidate) => candidate.id === input.id);
    if (run) {
      run.status = "succeeded";
      run.intent = input.intent;
      run.sanitizedOutput = input.sanitizedOutput;
    }
  }

  async failAgentRun(input: { id: string; errorSummary: string }): Promise<void> {
    const run = this.agentRuns.find((candidate) => candidate.id === input.id);
    if (run) {
      run.status = "failed";
      run.sanitizedOutput = { errorSummary: input.errorSummary };
    }
  }
}

const chat: StoredHouseholdChat = { id: "chat-row", householdId: "household-1", telegramChatId: "-100" };

describe("TelegramMessageWorkflowService", () => {
  it("classifies flatmate text, creates a cook prompt, synthesizes voice, and records agent runs", async () => {
    const repository = new FakeRepository();
    const speech = new FakeSpeechProvider();
    const runner = new FakeRunner([
      {
        intent: "flatmate_meal_request",
        confidence: 0.93,
        language: "hinglish",
        reason: "Flatmate requested dinner.",
        requiresClarification: false,
      },
      { dish: "dal chawal", servings: 3, mealTime: "dinner", spiceLevel: "medium", notes: [] },
      {
        text: "Dal chawal banana hai. Missing items bata do.",
        language: "hinglish",
        voiceRequired: true,
        targetTelegramUserId: "777",
      },
    ]);
    const workflow = new TelegramMessageWorkflowService(
      repository,
      new OpenAISpecialistAgents({ runner }),
      speech,
      speech,
      new FakeVoiceDownloader(),
    );

    const actions = await workflow.handleMessage({
      chat,
      member: { id: "member-flatmate", householdId: "household-1", telegramUserId: "user-flatmate", role: "flatmate" },
      messageEventId: "message-event-1",
      message: textMessage("Aaj dinner ke liye dal chawal bana do"),
    });

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      type: "send_text_message",
      chatId: "-100",
      text: "Dal chawal banana hai. Missing items bata do.",
    });
    expect(actions[1]).toMatchObject({
      type: "send_voice_note",
      chatId: "-100",
      filename: "cook_prompt.ogg",
      caption: "Cook prompt",
    });
    expect(speech.syntheses).toEqual([
      {
        text: "Dal chawal banana hai. Missing items bata do.",
        targetLanguageCode: "hi-IN",
        outputAudioCodec: "opus",
      },
    ]);
    expect(repository.agentRuns.map((run) => [run.agentName, run.status, run.intent])).toEqual([
      ["message_intent_agent", "succeeded", "flatmate_meal_request"],
      ["meal_request_agent", "succeeded", undefined],
      ["cook_prompt_agent", "succeeded", undefined],
    ]);
    expect(runner.calls.every((call) => call.options.traceIncludeSensitiveData === false)).toBe(true);
  });

  it("downloads voice, stores STT transcript, extracts cook missing items, and stops before cart build", async () => {
    const repository = new FakeRepository();
    const speech = new FakeSpeechProvider();
    speech.transcriptions.push({ requestId: "stt-1", transcript: "chawal khatam hai", languageCode: "hi-IN" });
    const voiceDownloader = new FakeVoiceDownloader();
    const runner = new FakeRunner([
      {
        intent: "cook_restock_request",
        confidence: 0.88,
        language: "hinglish",
        reason: "Cook reported missing grocery.",
        requiresClarification: false,
      },
      { items: [{ name: "rice", quantity: 1, unit: "kg", confidence: 0.9 }], requiresClarification: false },
    ]);
    const workflow = new TelegramMessageWorkflowService(
      repository,
      new OpenAISpecialistAgents({ runner }),
      speech,
      speech,
      voiceDownloader,
    );

    const actions = await workflow.handleMessage({
      chat,
      member: { id: "member-cook", householdId: "household-1", telegramUserId: "user-cook", role: "cook" },
      messageEventId: "message-event-2",
      message: {
        message_id: 11,
        chat: { id: -100, type: "group" },
        from: { id: 777 },
        voice: { file_id: "voice-file-1" },
      },
    });

    expect(voiceDownloader.downloads).toEqual(["voice-file-1"]);
    expect(repository.voiceAssets).toEqual([
      {
        id: "voice-asset-1",
        telegramFileId: "voice-file-1",
        status: "transcribed",
        transcript: "chawal khatam hai",
        languageCode: "hi-IN",
      },
    ]);
    expect(actions).toEqual([
      {
        type: "send_text_message",
        chatId: "-100",
        text: "Noted missing items: rice. Cart build is next.",
      },
    ]);
    expect(repository.agentRuns.map((run) => run.agentName)).toEqual(["message_intent_agent", "missing_items_agent"]);
  });
});

function textMessage(text: string): TelegramMessage {
  return {
    message_id: 10,
    chat: { id: -100, type: "group" },
    from: { id: 123 },
    text,
  };
}

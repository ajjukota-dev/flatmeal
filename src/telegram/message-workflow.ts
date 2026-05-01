import type {
  AgentTraceContext,
  CookPromptInput,
  IntentClassificationInput,
  MealRequestExtractionInput,
  MissingItemsInput,
  OpenAISpecialistAgents,
  SpecialistAgentName,
} from "../agents/specialists.js";
import type { CookPrompt, IntentEnvelope, MealRequest, MissingItemsExtraction } from "../agents/schemas.js";
import type { TextToSpeechProvider, SpeechToTextProvider, SarvamTextToSpeechLanguage } from "../speech/types.js";
import type { DownloadedTelegramFile } from "./bot-api.js";
import type { StoredHouseholdChat, StoredHouseholdMember, TelegramOnboardingRepository } from "./repository.js";
import type { CookLanguage, TelegramAction, TelegramMessage } from "./types.js";

export type TelegramVoiceDownloader = {
  downloadVoice(fileId: string): Promise<DownloadedTelegramFile>;
};

export type TelegramMessageWorkflowInput = {
  chat: StoredHouseholdChat;
  member: StoredHouseholdMember | null;
  messageEventId: string;
  message: TelegramMessage;
};

type MessageText = {
  text: string;
  source: "text" | "voice";
  languageCode?: string | null;
};

export class TelegramMessageWorkflowService {
  constructor(
    private readonly repository: TelegramOnboardingRepository,
    private readonly agents: OpenAISpecialistAgents,
    private readonly speechToText: SpeechToTextProvider,
    private readonly textToSpeech: TextToSpeechProvider,
    private readonly voiceDownloader: TelegramVoiceDownloader,
  ) {}

  async handleMessage(input: TelegramMessageWorkflowInput): Promise<TelegramAction[]> {
    if (!input.member) {
      return [];
    }

    const messageText = await this.readMessageText(input);
    if (!messageText?.text.trim()) {
      return [];
    }

    const traceBase = {
      householdId: input.chat.householdId,
      telegramChatId: input.chat.telegramChatId,
      messageEventId: input.messageEventId,
    };
    const intentInput: IntentClassificationInput = {
      text: messageText.text,
      senderRole: input.member.role,
      activeWorkflow: "idle",
    };
    const intent = await this.runRecordedAgent(
      "message_intent_agent",
      input,
      {
        source: messageText.source,
        textLength: messageText.text.length,
        senderRole: input.member.role,
        activeWorkflow: "idle",
      },
      (trace) => this.agents.classifyMessage(intentInput, trace),
      sanitizeIntent,
      traceBase,
    );

    if (intent.requiresClarification && intent.clarificationQuestion) {
      return [{ type: "send_text_message", chatId: input.chat.telegramChatId, text: intent.clarificationQuestion }];
    }

    if (intent.intent === "flatmate_meal_request" && (input.member.role === "flatmate" || input.member.role === "owner")) {
      return this.handleFlatmateMealRequest(input, messageText.text, traceBase);
    }

    if ((intent.intent === "cook_meal_missing_items" || intent.intent === "cook_restock_request") && input.member.role === "cook") {
      return this.handleCookMissingItems(input, messageText.text, traceBase);
    }

    return [];
  }

  private async handleFlatmateMealRequest(
    input: TelegramMessageWorkflowInput,
    text: string,
    traceBase: AgentTraceContext,
  ): Promise<TelegramAction[]> {
    const meal = await this.runRecordedAgent(
      "meal_request_agent",
      input,
      { textLength: text.length },
      (trace) => this.agents.extractMealRequest({ text } satisfies MealRequestExtractionInput, trace),
      sanitizeMealRequest,
      traceBase,
    );

    const cook = await this.repository.findCookForHousehold(input.chat.householdId);
    if (!cook) {
      return [
        {
          type: "send_text_message",
          chatId: input.chat.telegramChatId,
          text: "Cook role is not set yet. Ask the cook to choose role first.",
        },
      ];
    }

    const promptInput: CookPromptInput = {
      mealRequest: meal,
      cookLanguage: cook.preferredLanguage,
      targetTelegramUserId: cook.telegramUserId,
    };
    const prompt = await this.runRecordedAgent(
      "cook_prompt_agent",
      input,
      {
        dish: meal.dish,
        servings: meal.servings,
        cookLanguage: cook.preferredLanguage,
        targetTelegramUserId: cook.telegramUserId,
      },
      (trace) => this.agents.createCookPrompt(promptInput, trace),
      sanitizeCookPrompt,
      traceBase,
    );

    const voice = await this.textToSpeech.synthesize({
      text: prompt.text,
      targetLanguageCode: toSarvamTtsLanguage(prompt.language),
      outputAudioCodec: "opus",
    });

    return [
      {
        type: "send_text_message",
        chatId: input.chat.telegramChatId,
        text: prompt.text,
      },
      {
        type: "send_voice_note",
        chatId: input.chat.telegramChatId,
        voice: new Blob([new Uint8Array(voice.audio)], { type: "audio/ogg" }),
        filename: "cook_prompt.ogg",
        caption: "Cook prompt",
      },
    ];
  }

  private async handleCookMissingItems(
    input: TelegramMessageWorkflowInput,
    text: string,
    traceBase: AgentTraceContext,
  ): Promise<TelegramAction[]> {
    const missing = await this.runRecordedAgent(
      "missing_items_agent",
      input,
      { textLength: text.length },
      (trace) => this.agents.extractMissingItems({ text } satisfies MissingItemsInput, trace),
      sanitizeMissingItems,
      traceBase,
    );

    if (missing.requiresClarification && missing.clarificationQuestion) {
      return [{ type: "send_text_message", chatId: input.chat.telegramChatId, text: missing.clarificationQuestion }];
    }

    if (missing.items.length === 0) {
      return [];
    }

    return [
      {
        type: "send_text_message",
        chatId: input.chat.telegramChatId,
        text: `Noted missing items: ${missing.items.map((item) => item.name).join(", ")}. Cart build is next.`,
      },
    ];
  }

  private async readMessageText(input: TelegramMessageWorkflowInput): Promise<MessageText | null> {
    if (input.message.text) {
      return { text: input.message.text, source: "text" };
    }

    if (!input.message.voice) {
      return null;
    }

    const voiceAsset = await this.repository.recordVoiceAsset({
      messageEventId: input.messageEventId,
      telegramFileId: input.message.voice.file_id,
    });

    try {
      const downloaded = await this.voiceDownloader.downloadVoice(input.message.voice.file_id);
      const transcription = await this.speechToText.transcribe({
        data: new Blob([new Uint8Array(downloaded.data)]),
        filename: downloaded.filename,
      });
      await this.repository.markVoiceAssetTranscribed({
        id: voiceAsset.id,
        transcript: transcription.transcript,
        languageCode: transcription.languageCode,
      });
      return { text: transcription.transcript, source: "voice", languageCode: transcription.languageCode };
    } catch (error) {
      await this.repository.markVoiceAssetFailed({ id: voiceAsset.id });
      throw error;
    }
  }

  private async runRecordedAgent<TOutput>(
    agentName: SpecialistAgentName,
    input: TelegramMessageWorkflowInput,
    sanitizedInput: Record<string, unknown>,
    run: (trace: AgentTraceContext) => Promise<TOutput>,
    sanitizeOutput: (output: TOutput) => Record<string, unknown>,
    traceBase: AgentTraceContext,
  ): Promise<TOutput> {
    const traceId = `${input.messageEventId}:${agentName}`;
    const agentRun = await this.repository.createAgentRun({
      householdId: input.chat.householdId,
      messageEventId: input.messageEventId,
      agentName,
      traceId,
      sanitizedInput,
    });

    try {
      const output = await run({ ...traceBase, traceId, agentRunId: agentRun.id });
      const sanitizedOutput = sanitizeOutput(output);
      await this.repository.completeAgentRun({
        id: agentRun.id,
        intent: agentName === "message_intent_agent" ? String(sanitizedOutput.intent) : undefined,
        sanitizedOutput,
      });
      return output;
    } catch (error) {
      await this.repository.failAgentRun({
        id: agentRun.id,
        errorSummary: error instanceof Error ? error.message : "Agent run failed",
      });
      throw error;
    }
  }
}

function sanitizeIntent(intent: IntentEnvelope): Record<string, unknown> {
  return {
    intent: intent.intent,
    confidence: intent.confidence,
    language: intent.language,
    requiresClarification: intent.requiresClarification,
  };
}

function sanitizeMealRequest(meal: MealRequest): Record<string, unknown> {
  return {
    dish: meal.dish,
    servings: meal.servings,
    mealTime: meal.mealTime,
    spiceLevel: meal.spiceLevel,
    noteCount: meal.notes.length,
  };
}

function sanitizeCookPrompt(prompt: CookPrompt): Record<string, unknown> {
  return {
    language: prompt.language,
    voiceRequired: prompt.voiceRequired,
    targetTelegramUserId: prompt.targetTelegramUserId,
    textLength: prompt.text.length,
  };
}

function sanitizeMissingItems(missing: MissingItemsExtraction): Record<string, unknown> {
  return {
    items: missing.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      confidence: item.confidence,
    })),
    requiresClarification: missing.requiresClarification,
  };
}

function toSarvamTtsLanguage(language: CookLanguage): SarvamTextToSpeechLanguage {
  const mapping: Record<CookLanguage, SarvamTextToSpeechLanguage> = {
    hi: "hi-IN",
    hinglish: "hi-IN",
    ta: "ta-IN",
    te: "te-IN",
    en: "en-IN",
  };
  return mapping[language];
}

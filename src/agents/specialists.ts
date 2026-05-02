import { Agent, Runner } from "@openai/agents";
import type { z } from "zod";
import {
  cartBuildPlanSchema,
  cookPromptSchema,
  type CookPrompt,
  type CookPromptLanguage,
  type IntentEnvelope,
  intentEnvelopeSchema,
  type MealRequest,
  mealRequestSchema,
  type MissingItemsExtraction,
  missingItemsExtractionSchema,
  type SenderRole,
  type CartBuildPlan,
} from "./schemas.js";

type AnyStructuredAgent = Agent<any, any>;

export type SpecialistAgentName =
  | "message_intent_agent"
  | "meal_request_agent"
  | "cook_prompt_agent"
  | "missing_items_agent"
  | "cart_addition_agent"
  | "cart_planner_agent";

export type AgentTraceContext = {
  householdId?: string;
  telegramChatId?: string;
  messageEventId?: string;
  agentRunId?: string;
  traceId?: string;
  cartSessionId?: string;
  cartRevision?: number;
};

export type SpecialistAgentRunOptions = {
  workflowName: string;
  maxTurns: number;
  tracingDisabled: boolean;
  traceIncludeSensitiveData: boolean;
  traceId?: string;
  groupId?: string;
  traceMetadata?: Record<string, string>;
};

export interface StructuredAgentRunner {
  run<TOutput>(agent: AnyStructuredAgent, input: string, options: SpecialistAgentRunOptions): Promise<TOutput>;
}

export type IntentClassificationInput = {
  text: string;
  senderRole: SenderRole;
  cookLanguage?: CookPromptLanguage;
  activeWorkflow?: string;
  recentMessages?: string[];
};

export type MealRequestExtractionInput = {
  text: string;
};

export type CookPromptInput = {
  mealRequest: MealRequest;
  cookLanguage: CookPromptLanguage;
  targetTelegramUserId: string;
};

export type MissingItemsInput = {
  text: string;
};

export type CartPlannerInput = {
  addressId: string;
  missingItems: MissingItemsExtraction["items"];
  candidateProducts: unknown[];
};

export type SpecialistAgentsOptions = {
  model?: string;
  runner?: StructuredAgentRunner;
};

export class OpenAIAgentsSdkRunner implements StructuredAgentRunner {
  async run<TOutput>(agent: AnyStructuredAgent, input: string, options: SpecialistAgentRunOptions): Promise<TOutput> {
    const runner = new Runner({
      workflowName: options.workflowName,
      traceId: options.traceId,
      groupId: options.groupId,
      traceMetadata: options.traceMetadata,
      tracingDisabled: options.tracingDisabled,
      traceIncludeSensitiveData: options.traceIncludeSensitiveData,
    });
    const result = await runner.run(agent, input, { maxTurns: options.maxTurns });
    return result.finalOutput as TOutput;
  }
}

export class OpenAISpecialistAgents {
  private readonly agents: Record<SpecialistAgentName, AnyStructuredAgent>;
  private readonly runner: StructuredAgentRunner;

  constructor(options: SpecialistAgentsOptions = {}) {
    this.runner = options.runner ?? new OpenAIAgentsSdkRunner();
    this.agents = createSpecialistAgents(options.model);
  }

  async classifyMessage(input: IntentClassificationInput, trace: AgentTraceContext = {}): Promise<IntentEnvelope> {
    const output = await this.runAgent("message_intent_agent", input, trace);
    return intentEnvelopeSchema.parse(output);
  }

  async extractMealRequest(input: MealRequestExtractionInput, trace: AgentTraceContext = {}): Promise<MealRequest> {
    const output = await this.runAgent("meal_request_agent", input, trace);
    return mealRequestSchema.parse(output);
  }

  async createCookPrompt(input: CookPromptInput, trace: AgentTraceContext = {}): Promise<CookPrompt> {
    const output = await this.runAgent("cook_prompt_agent", input, trace);
    return cookPromptSchema.parse(output);
  }

  async extractMissingItems(input: MissingItemsInput, trace: AgentTraceContext = {}): Promise<MissingItemsExtraction> {
    const output = await this.runAgent("missing_items_agent", input, trace);
    return normalizeMissingItems(missingItemsExtractionSchema.parse(output));
  }

  async extractCartAddition(input: MissingItemsInput, trace: AgentTraceContext = {}): Promise<MissingItemsExtraction> {
    const output = await this.runAgent("cart_addition_agent", input, trace);
    return normalizeMissingItems(missingItemsExtractionSchema.parse(output));
  }

  async planCart(input: CartPlannerInput, trace: AgentTraceContext = {}): Promise<CartBuildPlan> {
    const output = await this.runAgent("cart_planner_agent", input, trace);
    return cartBuildPlanSchema.parse(output);
  }

  private async runAgent<TInput>(agentName: SpecialistAgentName, input: TInput, trace: AgentTraceContext): Promise<unknown> {
    return this.runner.run<unknown>(this.agents[agentName], JSON.stringify(input, null, 2), buildRunOptions(agentName, trace));
  }
}

function createSpecialistAgents(model?: string): Record<SpecialistAgentName, AnyStructuredAgent> {
  const base = model ? { model } : {};

  return {
    message_intent_agent: new Agent({
      ...base,
      name: "message_intent_agent",
      instructions: [
        "Classify one sanitized Telegram message or voice transcript for Flatmeal.",
        "Return exactly one documented intent. Do not decide permissions, workflow state, checkout, retries, cart truth, OAuth, address, or order state.",
        "Use senderRole and activeWorkflow only as context; backend code will validate whether the intent can be acted on.",
        "Use flatmate_meal_request when owner/flatmate asks for a dish to be cooked. Use direct_purchase_request when owner/flatmate clearly asks to buy/order grocery items directly.",
        "Use cook_restock_request when the cook says ingredients or groceries are running out. Use ignore for casual grocery/Swiggy mentions without a purchase ask.",
      ].join(" "),
      tools: [],
      outputType: intentEnvelopeSchema,
    }),
    meal_request_agent: new Agent({
      ...base,
      name: "meal_request_agent",
      instructions: [
        "Extract the requested dish, serving count, meal time, spice level, and cook notes from a flatmate meal request.",
        "Do not call tools and do not infer cart or checkout state.",
      ].join(" "),
      tools: [],
      outputType: mealRequestSchema,
    }),
    cook_prompt_agent: new Agent({
      ...base,
      name: "cook_prompt_agent",
      instructions: [
        "Draft a concise cook-facing Telegram text and voice-note script in the requested cook language.",
        "The output must target the supplied cook Telegram user ID and set voiceRequired to true.",
        "Do not call Swiggy, Telegram, checkout, or order tools.",
      ].join(" "),
      tools: [],
      outputType: cookPromptSchema,
    }),
    missing_items_agent: new Agent({
      ...base,
      name: "missing_items_agent",
      instructions: [
        "Extract grocery items from a cook reply, cook restock request, or direct owner/flatmate purchase request.",
        "Include quantity and unit only when present or clearly implied; ask for clarification when the message is too ambiguous.",
        "Do not call tools and do not build a cart.",
      ].join(" "),
      tools: [],
      outputType: missingItemsExtractionSchema,
    }),
    cart_addition_agent: new Agent({
      ...base,
      name: "cart_addition_agent",
      instructions: [
        "Extract grocery additions from a flatmate or owner message during Flatmeal's active add-more window.",
        "Return only grocery items, quantities, units, and confidence. Return no items for ordinary group chat.",
        "Do not call Swiggy, Telegram, checkout, or order tools.",
      ].join(" "),
      tools: [],
      outputType: missingItemsExtractionSchema,
    }),
    cart_planner_agent: new Agent({
      ...base,
      name: "cart_planner_agent",
      instructions: [
        "Build a cart plan from missing items and backend-supplied Swiggy candidate products.",
        "Choose only variant spinIds present in the supplied candidates. The backend will validate and own update_cart/get_cart state.",
        "Do not approve checkout, execute checkout, retry checkout, or claim order state.",
      ].join(" "),
      tools: [],
      outputType: cartBuildPlanSchema,
    }),
  };
}

function buildRunOptions(agentName: SpecialistAgentName, trace: AgentTraceContext): SpecialistAgentRunOptions {
  return {
    workflowName: `flatmeal.${agentName}`,
    maxTurns: 1,
    tracingDisabled: false,
    traceIncludeSensitiveData: false,
    traceId: trace.traceId,
    groupId: trace.telegramChatId,
    traceMetadata: pruneMetadata({
      householdId: trace.householdId,
      telegramChatId: trace.telegramChatId,
      messageEventId: trace.messageEventId,
      agentRunId: trace.agentRunId,
      cartSessionId: trace.cartSessionId,
      cartRevision: trace.cartRevision === undefined ? undefined : String(trace.cartRevision),
    }),
  };
}

function pruneMetadata(metadata: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function normalizeMissingItems(output: MissingItemsExtraction): MissingItemsExtraction {
  return {
    ...output,
    items: output.items.map((item) => {
      if (item.quantity === 0) {
        const { quantity: _quantity, ...rest } = item;
        return rest;
      }
      return item;
    }),
  };
}

export type SpecialistAgentOutput<TSchema extends z.ZodType> = z.infer<TSchema>;

import { describe, expect, it } from "vitest";
import type { Agent } from "@openai/agents";
import {
  OpenAISpecialistAgents,
  type SpecialistAgentRunOptions,
  type StructuredAgentRunner,
} from "./specialists.js";

type AnyStructuredAgent = Agent<any, any>;

class FakeRunner implements StructuredAgentRunner {
  readonly calls: Array<{ agentName: string; input: string; options: SpecialistAgentRunOptions }> = [];

  constructor(private readonly outputs: unknown[]) {}

  async run<TOutput>(agent: AnyStructuredAgent, input: string, options: SpecialistAgentRunOptions): Promise<TOutput> {
    this.calls.push({ agentName: agent.name, input, options });
    return this.outputs.shift() as TOutput;
  }
}

describe("OpenAISpecialistAgents", () => {
  it("runs the message intent agent with backend-owned trace settings", async () => {
    const runner = new FakeRunner([
      {
        intent: "flatmate_meal_request",
        confidence: 0.92,
        language: "hinglish",
        reason: "Flatmate requested dinner.",
        requiresClarification: false,
      },
    ]);
    const agents = new OpenAISpecialistAgents({ runner });

    await expect(
      agents.classifyMessage(
        { text: "Aaj dal chawal bana do", senderRole: "flatmate", activeWorkflow: "idle" },
        {
          householdId: "household_1",
          telegramChatId: "chat_1",
          messageEventId: "message_1",
          traceId: "trace_1",
          cartRevision: 3,
        },
      ),
    ).resolves.toMatchObject({ intent: "flatmate_meal_request" });

    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]).toMatchObject({
      agentName: "message_intent_agent",
      options: {
        workflowName: "flatmeal.message_intent_agent",
        maxTurns: 1,
        tracingDisabled: false,
        traceIncludeSensitiveData: false,
        traceId: "trace_1",
        groupId: "chat_1",
      },
    });
    expect(runner.calls[0]?.options.traceMetadata).toMatchObject({
      householdId: "household_1",
      telegramChatId: "chat_1",
      messageEventId: "message_1",
      cartRevision: "3",
    });
  });

  it("validates every specialist output before returning it to workflow code", async () => {
    const runner = new FakeRunner([
      { dish: "rajma chawal", servings: 3, mealTime: "dinner", spiceLevel: "medium", notes: ["less oil"] },
      {
        text: "Rajma chawal banana hai. Missing items bata do.",
        language: "hinglish",
        voiceRequired: true,
        targetTelegramUserId: "12345",
      },
      { items: [{ name: "rajma", quantity: 1, unit: "kg", confidence: 0.86 }], requiresClarification: false },
      {
        addressId: "addr_home",
        items: [{ requestedName: "rajma", searchQuery: "rajma", selectedSpinId: "spin_rajma_1kg", quantity: 1 }],
      },
    ]);
    const agents = new OpenAISpecialistAgents({ runner });

    await expect(agents.extractMealRequest({ text: "3 log ke liye rajma chawal" })).resolves.toMatchObject({
      dish: "rajma chawal",
    });
    await expect(
      agents.createCookPrompt({
        mealRequest: { dish: "rajma chawal", servings: 3, notes: [] },
        cookLanguage: "hinglish",
        targetTelegramUserId: "12345",
      }),
    ).resolves.toMatchObject({ voiceRequired: true });
    await expect(agents.extractMissingItems({ text: "rajma nahi hai" })).resolves.toMatchObject({
      items: [{ name: "rajma" }],
    });
    await expect(
      agents.planCart({
        addressId: "addr_home",
        missingItems: [{ name: "rajma", quantity: 1, unit: "kg", confidence: 0.86 }],
        candidateProducts: [{ variants: [{ spinId: "spin_rajma_1kg" }] }],
      }),
    ).resolves.toMatchObject({ items: [{ selectedSpinId: "spin_rajma_1kg" }] });

    expect(runner.calls.map((call) => call.agentName)).toEqual([
      "meal_request_agent",
      "cook_prompt_agent",
      "missing_items_agent",
      "cart_planner_agent",
    ]);
  });

  it("rejects invalid model output instead of letting workflow state consume it", async () => {
    const runner = new FakeRunner([
      {
        intent: "flatmate_meal_request",
        confidence: 0.75,
        reason: "Missing clarification flag",
      },
    ]);
    const agents = new OpenAISpecialistAgents({ runner });

    await expect(agents.classifyMessage({ text: "dal banao", senderRole: "flatmate" })).rejects.toThrow();
  });
});

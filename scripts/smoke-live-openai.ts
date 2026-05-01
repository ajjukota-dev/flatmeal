import "dotenv/config";
import { OpenAISpecialistAgents } from "../src/agents/specialists.js";

if (process.env.RUN_LIVE_OPENAI_SMOKE !== "true") {
  console.log("SKIP live OpenAI smoke: set RUN_LIVE_OPENAI_SMOKE=true and OPENAI_API_KEY");
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required when RUN_LIVE_OPENAI_SMOKE=true");
}

const agents = new OpenAISpecialistAgents({ model: process.env.OPENAI_AGENT_MODEL });
const result = await agents.classifyMessage(
  { text: "Aaj dinner ke liye dal chawal bana do", senderRole: "flatmate", activeWorkflow: "idle" },
  {
    householdId: "household_live_smoke",
    telegramChatId: "telegram_chat_live_smoke",
    messageEventId: "message_live_smoke",
    traceId: process.env.OPENAI_SMOKE_TRACE_ID,
  },
);

console.log(`PASS live OpenAI smoke: ${result.intent} confidence=${result.confidence}`);

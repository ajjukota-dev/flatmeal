import express from "express";
import type { AppEnv } from "./config/env.js";
import { createSupabaseAdminClient } from "./database/supabase.js";
import { TelegramBotApi } from "./telegram/bot-api.js";
import { TelegramOnboardingService } from "./telegram/onboarding.js";
import { SupabaseTelegramRepository } from "./telegram/supabase-repository.js";

export function createServer(env: AppEnv) {
  const app = express();
  const supabase = createSupabaseAdminClient(env);
  const telegramRepository = new SupabaseTelegramRepository(supabase);
  const telegramBot = new TelegramBotApi(env.TELEGRAM_BOT_TOKEN);
  const telegramOnboarding = new TelegramOnboardingService(telegramRepository, {
    botUserId: env.TELEGRAM_BOT_TOKEN.split(":")[0],
  });

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_request, response) => {
    response.json({
      ok: true,
      service: "flatmeal",
      mode: env.NODE_ENV,
    });
  });

  app.post("/telegram/webhook", async (request, response, next) => {
    try {
      const result = await telegramOnboarding.handleUpdate(request.body);
      await Promise.all(result.actions.map((action) => telegramBot.dispatch(action)));
      response.status(result.duplicate ? 200 : 202).json({ ok: true, actionCount: result.actions.length });
    } catch (error) {
      next(error);
    }
  });

  return app;
}

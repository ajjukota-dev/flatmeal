import express from "express";
import type { AppEnv } from "./config/env.js";

export function createServer(env: AppEnv) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_request, response) => {
    response.json({
      ok: true,
      service: "flatmeal",
      mode: env.NODE_ENV,
    });
  });

  return app;
}

import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const validEnv = {
  NODE_ENV: "test",
  PORT: "3001",
  PUBLIC_BASE_URL: "http://localhost:3001",
  TELEGRAM_BOT_TOKEN: "telegram-token",
  OPENAI_API_KEY: "openai-key",
  SARVAM_API_KEY: "sarvam-key",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_example",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  SUPABASE_DATABASE_URL: "postgresql://postgres:postgres@localhost:54322/postgres",
  ENCRYPTION_SECRET: "local-dev-secret",
  FAKE_SWIGGY_OAUTH_BASE_URL: "http://localhost:3001/fake-swiggy",
  FAKE_SWIGGY_OAUTH_CALLBACK_URL: "http://localhost:3001/oauth/swiggy/callback",
  FAKE_SWIGGY_CLIENT_ID: "flatmeal-local",
  LOCAL_INSTAMART_MCP_URL: "http://localhost:3001/mcp/instamart",
};

describe("loadEnv", () => {
  it("parses the required backend configuration", () => {
    expect(loadEnv(validEnv)).toMatchObject({
      NODE_ENV: "test",
      PORT: 3001,
      SUPABASE_URL: "https://example.supabase.co",
    });
  });

  it("rejects missing secrets", () => {
    expect(() =>
      loadEnv({
        ...validEnv,
        TELEGRAM_BOT_TOKEN: "",
      }),
    ).toThrow();
  });
});

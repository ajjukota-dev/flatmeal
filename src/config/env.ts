import "dotenv/config";
import { z } from "zod";

const requiredSecret = z.string().trim().min(1);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url(),
  TELEGRAM_BOT_TOKEN: requiredSecret,
  OPENAI_API_KEY: requiredSecret,
  SARVAM_API_KEY: requiredSecret,
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().trim().optional(),
  SUPABASE_SERVICE_ROLE_KEY: requiredSecret,
  SUPABASE_DATABASE_URL: z.string().trim().optional(),
  ENCRYPTION_SECRET: requiredSecret,
  FAKE_SWIGGY_OAUTH_BASE_URL: z.string().url(),
  FAKE_SWIGGY_OAUTH_CALLBACK_URL: z.string().url(),
  FAKE_SWIGGY_CLIENT_ID: z.string().trim().min(1).default("flatmeal-local"),
  LOCAL_INSTAMART_MCP_URL: z.string().url(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(source);
}

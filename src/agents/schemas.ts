import { z } from "zod";

export const senderRoleSchema = z.enum(["owner", "flatmate", "cook", "unknown"]);

export const parsedMessageIntentSchema = z.enum([
  "flatmate_meal_request",
  "cook_meal_missing_items",
  "cook_restock_request",
  "direct_purchase_request",
  "cook_question_to_flatmates",
  "flatmate_cart_addition",
  "cart_approval_context_message",
  "ignore",
]);

export const detectedLanguageSchema = z.enum(["hi", "en", "hinglish", "ta", "te", "mixed"]);
export const cookPromptLanguageSchema = z.enum(["hi", "en", "hinglish", "ta", "te"]);

export const intentEnvelopeSchema = z
  .object({
    intent: parsedMessageIntentSchema,
    confidence: z.number().min(0).max(1),
    language: detectedLanguageSchema.optional(),
    reason: z.string().trim().min(1),
    requiresClarification: z.boolean(),
    clarificationQuestion: z.string().trim().optional(),
  })
  .strict();

export const mealRequestSchema = z
  .object({
    dish: z.string().trim().min(1),
    servings: z.number().int().positive().optional(),
    mealTime: z.string().trim().min(1).optional(),
    spiceLevel: z.enum(["less", "medium", "spicy"]).optional(),
    notes: z.array(z.string().trim().min(1)).default([]),
  })
  .strict();

export const cookPromptSchema = z
  .object({
    text: z.string().trim().min(1),
    language: cookPromptLanguageSchema,
    voiceRequired: z.literal(true),
    targetTelegramUserId: z.string().trim().min(1),
  })
  .strict();

export const missingItemSchema = z
  .object({
    name: z.string().trim().min(1),
    quantity: z.number().positive().optional(),
    unit: z.string().trim().min(1).optional(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const missingItemsExtractionSchema = z
  .object({
    items: z.array(missingItemSchema),
    requiresClarification: z.boolean(),
    clarificationQuestion: z.string().trim().optional(),
  })
  .strict();

export const cartBuildPlanSchema = z
  .object({
    addressId: z.string().trim().min(1),
    items: z.array(
      z
        .object({
          requestedName: z.string().trim().min(1),
          searchQuery: z.string().trim().min(1),
          selectedSpinId: z.string().trim().min(1),
          quantity: z.number().int().positive(),
        })
        .strict(),
    ),
  })
  .strict();

export type SenderRole = z.infer<typeof senderRoleSchema>;
export type ParsedMessageIntent = z.infer<typeof parsedMessageIntentSchema>;
export type DetectedLanguage = z.infer<typeof detectedLanguageSchema>;
export type CookPromptLanguage = z.infer<typeof cookPromptLanguageSchema>;
export type IntentEnvelope = z.infer<typeof intentEnvelopeSchema>;
export type MealRequest = z.infer<typeof mealRequestSchema>;
export type CookPrompt = z.infer<typeof cookPromptSchema>;
export type MissingItem = z.infer<typeof missingItemSchema>;
export type MissingItemsExtraction = z.infer<typeof missingItemsExtractionSchema>;
export type CartBuildPlan = z.infer<typeof cartBuildPlanSchema>;

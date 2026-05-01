import { describe, expect, it } from "vitest";
import {
  cartBuildPlanSchema,
  cookPromptSchema,
  intentEnvelopeSchema,
  mealRequestSchema,
  missingItemsExtractionSchema,
} from "./schemas.js";

describe("agent structured output schemas", () => {
  it("accepts the documented intent envelope shape", () => {
    expect(
      intentEnvelopeSchema.parse({
        intent: "flatmate_meal_request",
        confidence: 0.91,
        language: "hinglish",
        reason: "Flatmate is asking the cook to make dinner.",
        requiresClarification: false,
      }),
    ).toMatchObject({ intent: "flatmate_meal_request" });

    expect(
      intentEnvelopeSchema.parse({
        intent: "flatmate_meal_request",
        confidence: 0.91,
        language: "hinglish",
        reason: "Flatmate is asking the cook to make dinner.",
        requiresClarification: false,
        clarificationQuestion: "",
      }),
    ).toMatchObject({ clarificationQuestion: "" });
  });

  it("rejects invalid intent envelopes", () => {
    expect(() =>
      intentEnvelopeSchema.parse({
        intent: "checkout_now",
        confidence: 0.9,
        reason: "Invalid action",
        requiresClarification: false,
      }),
    ).toThrow();

    expect(() =>
      intentEnvelopeSchema.parse({
        intent: "ignore",
        confidence: 1.4,
        reason: "Out of range",
        requiresClarification: false,
      }),
    ).toThrow();
  });

  it("normalizes missing meal notes to an empty list", () => {
    expect(mealRequestSchema.parse({ dish: "dal chawal" })).toEqual({
      dish: "dal chawal",
      notes: [],
    });
  });

  it("requires cook prompts to include a real voice note request", () => {
    expect(
      cookPromptSchema.parse({
        text: "Aaj dal chawal banana hai. Missing items bata do.",
        language: "hinglish",
        voiceRequired: true,
        targetTelegramUserId: "12345",
      }),
    ).toMatchObject({ voiceRequired: true });

    expect(() =>
      cookPromptSchema.parse({
        text: "No voice",
        language: "en",
        voiceRequired: false,
        targetTelegramUserId: "12345",
      }),
    ).toThrow();
  });

  it("validates missing items and cart plans without allowing loose fields", () => {
    expect(
      missingItemsExtractionSchema.parse({
        items: [{ name: "rice", quantity: 2, unit: "kg", confidence: 0.88 }],
        requiresClarification: false,
        clarificationQuestion: "",
      }),
    ).toMatchObject({ items: [{ name: "rice" }] });

    expect(() =>
      missingItemsExtractionSchema.parse({
        items: [{ name: "rice", confidence: 0.88, swiggyOtp: "123456" }],
        requiresClarification: false,
      }),
    ).toThrow();

    expect(
      cartBuildPlanSchema.parse({
        addressId: "addr_home",
        items: [{ requestedName: "rice", searchQuery: "rice", selectedSpinId: "spin_rice_1kg", quantity: 2 }],
      }),
    ).toMatchObject({ addressId: "addr_home" });

    expect(() =>
      cartBuildPlanSchema.parse({
        addressId: "addr_home",
        items: [{ requestedName: "rice", searchQuery: "rice", selectedSpinId: "spin_rice_1kg", quantity: 0 }],
      }),
    ).toThrow();
  });
});

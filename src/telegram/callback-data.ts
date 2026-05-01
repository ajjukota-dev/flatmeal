import type { CookLanguage, HouseholdRole } from "./types.js";

const roles = new Set<HouseholdRole>(["owner", "cook", "flatmate"]);
const languages = new Set<CookLanguage>(["hi", "hinglish", "ta", "te", "en"]);

export type TelegramCallbackIntent =
  | { type: "select_role"; role: HouseholdRole }
  | { type: "select_cook_language"; language: CookLanguage }
  | { type: "approve_cart"; cartSessionId: string; revision: number }
  | { type: "unknown" };

export function parseCallbackData(data: string | undefined): TelegramCallbackIntent {
  if (!data) {
    return { type: "unknown" };
  }

  const [prefix, kind, value] = data.split(":");
  if (prefix !== "fm" || !value) {
    return { type: "unknown" };
  }

  if (kind === "role" && roles.has(value as HouseholdRole)) {
    return { type: "select_role", role: value as HouseholdRole };
  }

  if (kind === "lang" && languages.has(value as CookLanguage)) {
    return { type: "select_cook_language", language: value as CookLanguage };
  }

  if (kind === "cart" && value === "approve") {
    const [, , , cartSessionId, revisionRaw] = data.split(":");
    const revision = Number(revisionRaw);
    if (cartSessionId && Number.isInteger(revision) && revision > 0) {
      return { type: "approve_cart", cartSessionId, revision };
    }
  }

  return { type: "unknown" };
}

export const roleCallbackData = {
  owner: "fm:role:owner",
  cook: "fm:role:cook",
  flatmate: "fm:role:flatmate",
} satisfies Record<HouseholdRole, string>;

export const cookLanguageCallbackData = {
  hi: "fm:lang:hi",
  hinglish: "fm:lang:hinglish",
  ta: "fm:lang:ta",
  te: "fm:lang:te",
  en: "fm:lang:en",
} satisfies Record<CookLanguage, string>;

export function cartApprovalCallbackData(input: { cartSessionId: string; revision: number }): string {
  return `fm:cart:approve:${input.cartSessionId}:${input.revision}`;
}

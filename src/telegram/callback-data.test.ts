import { describe, expect, it } from "vitest";
import { cartApprovalCallbackData, parseCallbackData } from "./callback-data.js";

describe("Telegram callback data", () => {
  it("encodes cart approvals with cart session id and revision", () => {
    const data = cartApprovalCallbackData({ cartSessionId: "cart-123", revision: 2 });

    expect(data).toBe("fm:cart:approve:cart-123:2");
    expect(parseCallbackData(data)).toEqual({
      type: "approve_cart",
      cartSessionId: "cart-123",
      revision: 2,
    });
  });

  it("rejects stale malformed cart approval callback data", () => {
    expect(parseCallbackData("fm:cart:approve:cart-123:0")).toEqual({ type: "unknown" });
    expect(parseCallbackData("fm:cart:approve")).toEqual({ type: "unknown" });
  });
});

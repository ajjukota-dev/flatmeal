import { describe, expect, it } from "vitest";
import { INSTAMART_TOOL_NAMES } from "./contract-tools.js";

describe("Instamart contract tool registry", () => {
  it("contains exactly the documented Instamart tool names", () => {
    expect(INSTAMART_TOOL_NAMES).toEqual([
      "create_address",
      "delete_address",
      "get_addresses",
      "search_products",
      "your_go_to_items",
      "clear_cart",
      "get_cart",
      "update_cart",
      "checkout",
      "get_order_details",
      "get_orders",
      "track_order",
      "report_error",
    ]);
  });
});

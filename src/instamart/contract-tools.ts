export const INSTAMART_TOOL_NAMES = [
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
] as const;

export type InstamartToolName = (typeof INSTAMART_TOOL_NAMES)[number];

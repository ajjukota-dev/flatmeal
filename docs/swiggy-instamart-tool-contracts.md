# Swiggy Instamart Tool Contracts

Last checked: 2026-05-01.

This file is the local contract extraction for Flatmeal’s Swiggy Instamart MCP stub and adapter. It should be updated only after checking the live Swiggy docs.

Do not paste the full Swiggy documentation here. Keep this file as the compact implementation contract: tool names, arguments, behavior, safety rules, local stub behavior, and required tests.

## Contract Extraction Gate

No Swiggy tool implementation may start until that tool has a completed section in this file.

For each tool, the coding agent must:

1. Fetch the exact live Swiggy tool page.
2. Extract the contract into this file.
3. Preserve the exact meaning of Swiggy’s agent guidance and workflow rules.
4. Write or adjust contract tests from this local contract.
5. Implement the local stub/client behavior only after the above is complete.

Do not infer missing fields. If the docs do not specify something, write `not specified by docs`.

## Required Per-Tool Template

Each Instamart tool section must use this template:

```md
### `tool_name`

- Source URL checked:
- Last checked:
- Tool name:
- MCP server:
- Endpoint:
- Stage:
- Behaviour:
- Arguments:
  - required:
  - optional:
- Auth/session rule:
- Success envelope:
- Failure envelope:
- Tool-specific data expectations:
- Exact Swiggy agent guidance / workflow rules:
- Flatmeal workflow interpretation:
- Local stub behavior:
- Required contract tests:
```

The “Exact Swiggy agent guidance / workflow rules” field is mandatory. This is where STOP rules, confirmation rules, address-selection rules, payment-method rules, cancellation guidance, and retry/idempotency guidance must be captured.

## Source Docs To Check Before Implementation

- Docs index: https://mcp.swiggy.com/builders/llms.txt
- Full docs context: https://mcp.swiggy.com/builders/llms-full.txt
- Instamart overview: https://mcp.swiggy.com/builders/docs/reference/instamart/
- Authentication: https://mcp.swiggy.com/builders/docs/start/authenticate/
- Delegated auth: https://mcp.swiggy.com/builders/docs/start/enterprise/delegated-auth/
- Errors: https://mcp.swiggy.com/builders/docs/reference/errors/
- Ship to production: https://mcp.swiggy.com/builders/docs/build/ship-to-production/
- Order groceries recipe: https://mcp.swiggy.com/builders/docs/build/recipes/order-groceries/
- Access/onboarding: https://mcp.swiggy.com/builders/docs/operate/access/
- Rate limits: https://mcp.swiggy.com/builders/docs/operate/rate-limits/
- Data/compliance: https://mcp.swiggy.com/builders/docs/operate/data-and-compliance/
- Each individual Instamart tool page listed below.

## Global MCP Contract

- Real endpoint shape: `POST https://mcp.swiggy.com/im`.
- Local stub shape: one MCP-compatible Instamart server with named tools, not one fake REST endpoint per action.
- Tool calls use JSON-RPC `tools/call` semantics through the MCP client.
- Session credentials are supplied by the authenticated MCP session; tool arguments must not include raw access tokens.
- Every local tool must use the same tool name and argument names as the Swiggy docs.
- Success envelope: `success: true`, `data`, optional `message`.
- Failure envelope: `success: false`, `error.message`, optional diagnostic/report fields.
- Product variants use `spinId`; cart operations must add/update variants, not parent products.
- Instamart cart is server-side and address-sensitive; call `get_cart` before confirming or checking out.
- Do not cache cart truth only in agent memory. Re-read cart state before mutation/confirmation.

## Delegated Swiggy OAuth Contract

- Flatmeal uses delegated user auth: tool calls happen on behalf of the connected household owner’s Swiggy account.
- Swiggy OAuth uses OAuth 2.1 with PKCE S256.
- Real Swiggy `/auth/authorize` opens a Swiggy-hosted browser UI where the owner enters phone + OTP.
- Flatmeal must never collect, store, proxy, or log Swiggy OTP/password.
- Internal Swiggy OTP endpoints are not part of the third-party OAuth contract and must not be called by Flatmeal.
- Backend exchanges authorization code + code verifier at `/auth/token`.
- Store only the encrypted OAuth access token, expiry, owner, household, and connection state.
- Access token lifetime is 5 days; authorization code is short-lived and single-use.
- Refresh-token issuance is not wired in Swiggy v1.0; treat `401` as re-run authorization.
- In local MVP, fake OAuth must mimic PKCE, state validation, callback, token exchange, expiry, and reconnect branches.

## Error, Retry, Rate, And Data Rules

- Auth failures: HTTP `401` or JSON-RPC `-32001` → re-auth/reconnect; do not retry with the same token.
- Bad input: HTTP `400`, `Invalid ...`, or `Missing ...` → fix arguments; do not retry.
- Upstream timeout/error: HTTP `502`, `503`, `504`, or timeout-like message → exponential backoff with jitter.
- Internal error: HTTP `500` or JSON-RPC `-32603` → retry once, then offer/report `report_error`.
- Domain failure: HTTP `200` with `success: false` → surface to Telegram; do not blindly retry.
- Planned `429`: honor `Retry-After` when MCP-layer rate limits ship.
- Current Swiggy v1.0 docs say MCP-layer `429` is not enforced yet; still implement the branch now.
- User-facing retry budget should stay around 30 seconds.
- Order placement via `checkout` is not safe to blind-retry. On 5xx/network uncertainty, wait briefly, call `get_orders`, and retry only if no order exists.
- Do not poll `track_order` faster than every 10 seconds.
- Log Swiggy `session_id`, tool name, duration, status, and sanitized user/household hash.
- Do not persist full Swiggy request/response bodies unless required for the current session.
- Treat tool arguments/responses as PII under DPDP; minimize retention and support deletion.

## Core Grocery Flow

```text
get_addresses
  → search_products or your_go_to_items
  → update_cart
  → get_cart
  → checkout
  → track_order
```

Flatmeal-specific gate:

```text
get_cart
  → Telegram cart preview with items, bill, payment method, address, revision
  → latest owner/flatmate approval
  → checkout
```

## Tool Contract Matrix

| Tool | Stage | Behavior | Required arguments | Optional arguments | Local stub notes |
| --- | --- | --- | --- | --- | --- |
| `create_address` | Discover | mutating | `fullAddress`, `addressLine`, `addressLine2`, `city`, `postalCode`, `latitude`, `longitude`, `addressCategory`, `userName`, `userPhone` | `locality`, `addressTag`, `receiverName`, `receiverPhone` | Stub can seed one address; implement create only for contract completeness. Parse address parts from `fullAddress`; do not ask user separately for parsed address fields. |
| `delete_address` | Discover | mutating | `addressId` | none | Confirm before delete. Stub should remove saved address or return terminal failure if unknown. |
| `get_addresses` | Discover | read-only | none | none | Return saved addresses sorted like Swiggy. Addresses should not expose raw coordinates unless a tool contract explicitly requires them. If none, prompt owner to add/select address. |
| `search_products` | Discover | read-only | `addressId`, `query` | `offset` | Return products with variants and `spinId`. Always search before adding new products; ask/choose a variant before cart update. |
| `your_go_to_items` | Discover | read-only | `addressId` | `offset` | Return frequently/recently ordered products with variants and `spinId`; prefer for quick reorder or reducing search calls. |
| `clear_cart` | Cart | mutating | none | none | Clears Instamart cart for the authenticated session. Safe to retry with same intent. Use before switching address mid-cart. |
| `get_cart` | Cart | read-only | none | none | Return current cart items, bill breakdown, and `availablePaymentMethods`. Must be called before Telegram approval and before checkout. |
| `update_cart` | Cart | mutating | `selectedAddressId`, `items` | none | Replaces entire cart with provided items. Each item uses `spinId` and `quantity`. Safe to retry with same args. |
| `checkout` | Order | mutating | `addressId` | `paymentMethod` | Real call places/confirms order. Must be blocked unless latest Telegram cart revision is approved. Must use payment methods from `get_cart`. |
| `get_order_details` | Track | read-only | `orderId` | none | Return itemized details, bill breakdown, order status, and refund info for one Instamart order. |
| `get_orders` | Track | read-only | none | `count`, `orderType`, `activeOnly` | Return recent order list. Use after uncertain checkout failure before retrying. Use `activeOnly` for current orders. |
| `track_order` | Track | read-only | `orderId`, `lat`, `lng` | none | Return real-time tracking state. If no `orderId`, call `get_orders` first. Poll no faster than 10 seconds. |
| `report_error` | Support | mutating | `tool`, `errorMessage` | `domain`, `flowDescription`, `toolContext`, `userNotes` | Include relevant identifiers from failed tool calls. Return/share a diagnostic report link/summary. |

## Tool-Specific Implementation Notes

Tool sections below are the implementation gate. If a section lacks the template fields from “Required Per-Tool Template,” the coding agent must complete it from the live Swiggy page before changing code for that tool.

### `create_address`

- Source URL checked: https://mcp.swiggy.com/builders/docs/reference/instamart/create_address/
- Last checked: 2026-05-01.
- Exact Swiggy agent guidance / workflow rules:
  - Ask for complete delivery address as one string, latitude, longitude, user name, user phone, address type, optional label, and whether delivery is for the user or someone else.
  - Do not ask the user separately for `addressLine`, `addressLine2`, `city`, or `postalCode`; parse those automatically from `fullAddress`.
  - Account details are always the authenticated user.
  - Receiver details are only for delivery to someone else.
- `addressCategory` values: `HOME`, `WORK`, `OFFICE`, `FRIENDS_AND_FAMILY`, `OTHER`.
- Account fields `userName` and `userPhone` represent the authenticated Swiggy user.
- Receiver fields are only for delivery to someone else.
- For Flatmeal MVP, prefer existing owner addresses via `get_addresses`; address creation can be present but not central to the demo.

### `delete_address`

- Source URL checked: https://mcp.swiggy.com/builders/docs/reference/instamart/delete_address/
- Last checked: 2026-05-01.
- Tool name: `delete_address`.
- MCP server: Instamart.
- Endpoint: `POST mcp.swiggy.com/im`.
- Stage: Discover.
- Behaviour: mutating.
- Arguments:
  - required: `addressId`.
  - optional: none.
- Auth/session rule: session credentials are supplied automatically by the authenticated MCP session; do not pass user identity or access token in tool arguments.
- Success envelope: `success: true`, `data`, optional `message`.
- Failure envelope: `success: false`, `error.message`, optional diagnostic/report fields.
- Tool-specific data expectations: not specified by docs.
- Exact Swiggy agent guidance / workflow rules:
  - First call `get_addresses` to show saved addresses.
  - Ask which address the user wants to delete.
  - Get `addressId` from the user’s selection.
  - Confirm before deleting because the action is permanent and cannot be undone.
- Flatmeal workflow interpretation:
  - Not part of the core MVP demo path.
  - If implemented, only owner can delete an address and Telegram confirmation is required.
- Local stub behavior:
  - Remove the address for the fake authenticated owner session.
  - Return a failure envelope if `addressId` does not exist.
- Required contract tests:
  - requires `addressId`.
  - fails for unknown `addressId`.
  - refuses workflow deletion without prior confirmation state.
  - deletes only after confirmation.

### `get_addresses`

- Source URL checked: https://mcp.swiggy.com/builders/docs/reference/instamart/get_addresses/
- Last checked: 2026-05-01.
- Tool name: `get_addresses`.
- MCP server: Instamart.
- Endpoint: `POST mcp.swiggy.com/im`.
- Stage: Discover.
- Behaviour: read-only.
- Arguments:
  - required: none.
  - optional: none.
- Auth/session rule: session credentials are supplied automatically by the authenticated MCP session; do not pass user identity or access token in tool arguments.
- Success envelope: `success: true`, `data`, optional `message`.
- Failure envelope: `success: false`, `error.message`, optional diagnostic/report fields.
- Tool-specific data expectations:
  - returns all saved delivery addresses for the authenticated Swiggy user.
  - addresses are sorted by last order date.
  - works for Swiggy Instamart and Food.
  - addresses are returned without latitude/longitude for privacy protection.
- Exact Swiggy agent guidance / workflow rules:
  - STOP after this tool.
  - Show the address list to the user.
  - Ask: “Which address would you like to use for delivery?”
  - Do not call any other tool until the user has selected an address.
  - Remember the selected `addressId` for all subsequent operations.
  - If no addresses are returned, inform the user that they need to add an address first.
- Flatmeal workflow interpretation:
  - First step for cart building.
  - If one default `Home` address exists in the local demo, the bot may present it as the selected address in the approval preview, but still keep the selected `addressId` in cart session state.
  - If multiple addresses exist, pause cart build and ask the owner/approver to select one in Telegram.
  - If no address exists, stop cart build and prompt owner to connect/add address.
- Local stub behavior:
  - Seed at least one `Home` address for the demo owner.
  - Return saved addresses without raw coordinates.
  - Support zero-address state for failure-path tests.
- Required contract tests:
  - accepts empty `arguments: {}`.
  - rejects unexpected auth/token arguments if the local schema validates strict args.
  - returns success envelope with address list.
  - returned addresses do not include raw latitude/longitude.
  - workflow blocks `search_products`, `your_go_to_items`, or `update_cart` until selected `addressId` exists in backend cart session state.
  - zero-address response produces a user-visible “add/select address” state, not a search/cart call.

### `search_products` / `your_go_to_items`

- Source URLs checked:
  - https://mcp.swiggy.com/builders/docs/reference/instamart/search_products/
  - https://mcp.swiggy.com/builders/docs/reference/instamart/your_go_to_items/
- Last checked: 2026-05-01.
- Exact Swiggy agent guidance / workflow rules:
  - `search_products`: always search first for available variants when a user asks to add a new product.
  - `search_products`: ask/select which specific variant should be added before cart update.
  - `your_go_to_items`: use `addressId` from `get_addresses`; returned variants also require `spinId` for cart updates.
- Both return product variants.
- Cart build must select variant-level `spinId`.
- For the MVP, the agent can choose obvious variants for staple items, but Telegram preview must expose item/quantity before approval.
- Local stub should include common staples and meal ingredients: rice, chicken, onion, tomato, curd, milk, oil, spices, dal, ghee, paneer, vegetables, and snacks.

### `clear_cart`

- Source URL checked: https://mcp.swiggy.com/builders/docs/reference/instamart/clear_cart/
- Last checked: 2026-05-01.
- Tool name: `clear_cart`.
- MCP server: Instamart.
- Endpoint: `POST mcp.swiggy.com/im`.
- Stage: Cart.
- Behaviour: mutating.
- Arguments:
  - required: none.
  - optional: none.
- Auth/session rule: session credentials are supplied automatically by the authenticated MCP session; do not pass user identity or access token in tool arguments.
- Success envelope: `success: true`, `data`, optional `message`.
- Failure envelope: `success: false`, `error.message`, optional diagnostic/report fields.
- Tool-specific data expectations: not specified by docs.
- Exact Swiggy agent guidance / workflow rules:
  - Clears all items from the authenticated user’s Instamart cart.
  - Use before switching address mid-cart to avoid cross-address SKU mismatches.
- Flatmeal workflow interpretation:
  - Not part of the normal meal-to-cart path.
  - Use only for explicit reset/start-over flows or safe address switching.
- Local stub behavior:
  - Clear the fake authenticated session cart.
  - Preserve household/order history.
- Required contract tests:
  - accepts empty `arguments: {}`.
  - clears all cart items.
  - repeated call remains safe/idempotent.

### `update_cart`

- Source URL checked: https://mcp.swiggy.com/builders/docs/reference/instamart/update_cart/
- Last checked: 2026-05-01.
- Exact Swiggy agent guidance / workflow rules:
  - Use for Instamart grocery orders, not Food.
  - Use `selectedAddressId` from `get_addresses`.
  - Items use `spinId` and `quantity`.
  - This tool replaces the entire cart with the provided items.
- Replaces the full cart, so backend must maintain the full desired cart list per revision.
- Adding one item during the free-delivery window means rebuild the complete item list and call `update_cart` again.
- After every `update_cart`, call `get_cart` before presenting approval.

### `get_cart`

- Source URL checked: https://mcp.swiggy.com/builders/docs/reference/instamart/get_cart/
- Last checked: 2026-05-01.
- Exact Swiggy agent guidance / workflow rules:
  - Use for Instamart grocery orders, not Food.
  - Response includes `availablePaymentMethods`.
  - Display whatever payment methods are returned before placing the order.
  - Do not mention or assume payment options not present in the response.
- Payment methods must come from the response; do not invent payment options.
- Cart preview must include items, quantities, bill total, address summary, payment method, and cart revision.
- If cart is below minimum order or has out-of-stock items, surface that in Telegram before approval.

### `checkout`

- Source URL checked: https://mcp.swiggy.com/builders/docs/reference/instamart/checkout/
- Last checked: 2026-05-01.
- Exact Swiggy agent guidance / workflow rules:
  - Creates and confirms an Instamart grocery order; not for Food.
  - Automatically handles multi-store carts and may create separate orders per store.
  - Checkout is not allowed for carts above Swiggy’s allowed limit; tell user to use Swiggy Instamart app.
  - Use `availablePaymentMethods` from `get_cart`; show only those methods before placing order.
  - Always call `get_cart` first to display complete order summary.
  - Clearly state delivery address before checkout.
  - Ask explicit confirmation and never proceed without permission.
  - Report multi-store order results separately.
  - Preserve Swiggy/Instamart-branded success message from the tool response.
  - For cancellation, do not call a tool; tell the user to contact Swiggy customer care.
- Must never be exposed to the agent before backend records latest approval.
- Before calling, backend must verify role, household, connection, cart session, revision, status, and latest `get_cart`.
- Respect Swiggy guidance: show full cart summary, address, payment method, and ask for explicit confirmation.
- For Flatmeal, Telegram inline approval is the explicit confirmation.
- If cart value exceeds Swiggy’s allowed limit, do not checkout; tell users to complete/update in Swiggy app.
- If checkout succeeds, preserve Swiggy/Instamart-branded success message from the tool response where present.
- If user asks to cancel an Instamart order, do not call an MCP cancellation tool; direct to Swiggy customer care guidance from Swiggy docs.

### `get_orders`, `get_order_details`, `track_order`

- Source URLs checked:
  - https://mcp.swiggy.com/builders/docs/reference/instamart/get_orders/
  - https://mcp.swiggy.com/builders/docs/reference/instamart/get_order_details/
  - https://mcp.swiggy.com/builders/docs/reference/instamart/track_order/
- Last checked: 2026-05-01.
- Exact Swiggy agent guidance / workflow rules:
  - `get_orders`: use first for order history, recent orders, reorders, or active/current orders.
  - `get_orders`: set `activeOnly=true` for active/current/ongoing order requests.
  - `get_orders`: for cancellation requests, do not call a cancellation tool; tell the user to contact Swiggy customer care.
  - `get_order_details`: use when the user wants detailed items, bill breakdown, order status, or refunds for a specific order.
  - `get_order_details`: get `orderId` from `get_orders` first if needed.
  - `track_order`: primary tool for live order status/ETA.
  - `track_order`: requires `orderId`, `lat`, and `lng`; if user does not provide `orderId`, call `get_orders` first.
- Use `get_orders` for recent/active orders and for checkout uncertainty resolution.
- Use `get_order_details` for full item/bill/refund details.
- Use `track_order` for live status/ETA; requires delivery coordinates from order data.

### `report_error`

- Source URL checked: https://mcp.swiggy.com/builders/docs/reference/instamart/report_error/
- Last checked: 2026-05-01.
- Exact Swiggy agent guidance / workflow rules:
  - Use when the user encounters an error and wants to report it.
  - Include `toolContext` with specific identifiers from the failed tool call.
  - Include all relevant IDs that were part of the failed request, such as `orderId`, `addressId`, `spinId`, `query`, `paymentMethod`, or cart IDs.
  - Returns a report summary/link; server-side report logging may happen even if email is not sent.
- Use when a persistent Swiggy tool failure needs diagnostics.
- Include sanitized `toolContext` with relevant IDs such as `orderId`, `addressId`, `spinId`, `query`, `paymentMethod`, or cart identifiers.
- Do not include tokens, OTPs, raw full addresses, or raw sensitive transcripts.

## Local Stub Required Failure Scenarios

- unauthenticated / expired token
- invalid or missing argument
- address not found
- address not serviceable
- product not found
- item out of stock
- minimum order not met
- cart expired
- checkout before latest Telegram approval
- stale approval revision
- duplicate checkout attempt
- transient upstream timeout/error
- persistent internal error that suggests `report_error`

## Required Contract Tests

- Every tool name matches Swiggy docs exactly.
- Every tool accepts documented required/optional arguments.
- Every tool rejects missing required arguments with a failure envelope.
- Every tool returns success/failure envelopes in Swiggy style.
- `search_products` and `your_go_to_items` return variants with `spinId`.
- `update_cart` replaces the full cart and uses `selectedAddressId`.
- `get_cart` returns bill breakdown and available payment methods.
- `checkout` fails before latest Telegram approval and succeeds after approval.
- Checkout 5xx simulation triggers `get_orders` check before retry.
- `401`/`-32001` simulation triggers reconnect, not same-token retry.
- Planned `429` simulation honors `Retry-After`.
- `report_error` returns a diagnostic report summary/link and stores sanitized context.

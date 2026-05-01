import { describe, expect, it } from "vitest";
import { INSTAMART_TOOL_NAMES } from "./contract-tools.js";
import { LocalInstamartMcpStub } from "./local-mcp-stub.js";

const token = "fake-swiggy-test-token";

function createStub() {
  return new LocalInstamartMcpStub();
}

async function callTool(
  stub: LocalInstamartMcpStub,
  name: string,
  args: Record<string, unknown> = {},
  context: Record<string, unknown> = {},
) {
  return stub.callTool({
    name,
    arguments: args,
    context: { accessToken: token, ...context },
  });
}

function expectSuccess<T extends { success: boolean }>(result: T): Extract<T, { success: true }> {
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error("Expected successful tool envelope");
  }
  return result as Extract<T, { success: true }>;
}

describe("LocalInstamartMcpStub", () => {
  it("lists exactly the documented Instamart tools", () => {
    expect(createStub().listTools().map((tool) => tool.name)).toEqual(INSTAMART_TOOL_NAMES);
  });

  it("returns failure envelopes for missing documented required arguments", async () => {
    const stub = createStub();
    const requiredTools = [
      "create_address",
      "delete_address",
      "search_products",
      "your_go_to_items",
      "update_cart",
      "checkout",
      "get_order_details",
      "track_order",
      "report_error",
    ];

    for (const tool of requiredTools) {
      await expect(callTool(stub, tool)).resolves.toMatchObject({
        success: false,
        error: { message: expect.stringContaining("Missing required argument") },
      });
    }
  });

  it("requires an authenticated MCP session and rejects auth inside tool arguments", async () => {
    const stub = createStub();

    await expect(stub.callTool({ name: "get_addresses", arguments: {}, context: {} })).resolves.toMatchObject({
      success: false,
      error: { message: "Unauthenticated Swiggy session" },
    });

    await expect(
      callTool(stub, "get_addresses", { accessToken: "must-not-be-an-argument" }),
    ).resolves.toMatchObject({
      success: false,
      error: { message: "Tool arguments must not include session credentials" },
    });
  });

  it("implements address discovery and creation without exposing raw coordinates", async () => {
    const stub = createStub();
    const initial = expectSuccess(await callTool(stub, "get_addresses"));
    const addresses = initial.data.addresses as Array<Record<string, unknown>>;

    expect(initial).toMatchObject({ success: true });
    expect(addresses[0]).toMatchObject({ id: "addr_home", label: "Home" });
    expect(addresses[0]).not.toHaveProperty("latitude");
    expect(addresses[0]).not.toHaveProperty("longitude");

    await expect(
      callTool(stub, "create_address", {
        fullAddress: "12 Test Street, Indiranagar, Bengaluru 560038",
        addressLine: "12 Test Street",
        addressLine2: "",
        city: "Bengaluru",
        postalCode: "560038",
        latitude: 12.9716,
        longitude: 77.6412,
        addressCategory: "HOME",
        userName: "Asha",
        userPhone: "9999999999",
      }),
    ).resolves.toMatchObject({ success: true });

    await expect(
      callTool(stub, "create_address", {
        fullAddress: "12 Test Street, Indiranagar, Bengaluru 560038",
        addressLine: "12 Test Street",
        addressLine2: "",
        city: "Bengaluru",
        postalCode: "560038",
        latitude: 12.9716,
        longitude: 77.6412,
        addressCategory: "CASTLE",
        userName: "Asha",
        userPhone: "9999999999",
      }),
    ).resolves.toMatchObject({
      success: false,
      error: { message: "Unsupported addressCategory" },
    });

    await expect(callTool(stub, "delete_address", { addressId: "addr_unknown" })).resolves.toMatchObject({
      success: false,
      error: { message: "Address not found" },
    });
    await expect(callTool(stub, "delete_address", { addressId: "addr_home" })).resolves.toMatchObject({
      success: false,
      error: { message: "Address deletion requires explicit confirmation" },
    });
    await expect(
      callTool(stub, "delete_address", { addressId: "addr_home" }, { addressDeletionConfirmed: true }),
    ).resolves.toMatchObject({ success: true });
  });

  it("searches products and go-to items with variant spinIds", async () => {
    const stub = createStub();
    const search = expectSuccess(await callTool(stub, "search_products", { addressId: "addr_home", query: "rice" }));
    const goTo = expectSuccess(await callTool(stub, "your_go_to_items", { addressId: "addr_home" }));
    const searchProducts = search.data.products as Array<{ variants: Array<Record<string, unknown>> }>;
    const goToProducts = goTo.data.products as Array<{ variants: Array<Record<string, unknown>> }>;

    expect(search).toMatchObject({ success: true });
    expect(searchProducts[0]?.variants[0]).toMatchObject({ spinId: expect.any(String) });
    expect(goTo).toMatchObject({ success: true });
    expect(goToProducts[0]?.variants[0]).toMatchObject({ spinId: expect.any(String) });

    await expect(callTool(stub, "search_products", { addressId: "addr_missing", query: "rice" })).resolves.toMatchObject({
      success: false,
      error: { message: "Address not found" },
    });
  });

  it("replaces the whole cart, returns bill/payment data, and clears idempotently", async () => {
    const stub = createStub();

    await expect(
      callTool(stub, "update_cart", {
        selectedAddressId: "addr_home",
        items: [{ spinId: "spin_rice_1kg", quantity: 2 }],
      }),
    ).resolves.toMatchObject({ success: true });

    await expect(
      callTool(stub, "update_cart", {
        selectedAddressId: "addr_home",
        items: [{ spinId: "spin_milk_1l", quantity: 1 }],
      }),
    ).resolves.toMatchObject({ success: true });

    const cart = expectSuccess(await callTool(stub, "get_cart"));
    const cartItems = cart.data.items as Array<Record<string, unknown>>;
    expect(cart).toMatchObject({ success: true });
    expect(cartItems).toHaveLength(1);
    expect(cartItems[0]).toMatchObject({ spinId: "spin_milk_1l", quantity: 1 });
    expect(cart.data.bill).toMatchObject({ itemTotal: expect.any(Number), grandTotal: expect.any(Number) });
    expect(cart.data.availablePaymentMethods).toEqual(["COD"]);

    await expect(callTool(stub, "clear_cart")).resolves.toMatchObject({ success: true });
    await expect(callTool(stub, "clear_cart")).resolves.toMatchObject({ success: true });
    await expect(callTool(stub, "get_cart")).resolves.toMatchObject({ success: true, data: { items: [] } });
  });

  it("gates checkout on latest Telegram approval and blocks duplicates", async () => {
    const stub = createStub();
    await callTool(stub, "update_cart", {
      selectedAddressId: "addr_home",
      items: [{ spinId: "spin_rice_1kg", quantity: 2 }],
    });

    await expect(callTool(stub, "checkout", { addressId: "addr_home" })).resolves.toMatchObject({
      success: false,
      error: { message: "Checkout requires latest explicit Telegram approval" },
    });

    await expect(
      callTool(stub, "checkout", { addressId: "addr_home", paymentMethod: "CARD" }, { checkoutApproval: { revision: 1, latestRevision: 1 } }),
    ).resolves.toMatchObject({
      success: false,
      error: { message: "Payment method is not available" },
    });

    await expect(
      callTool(stub, "checkout", { addressId: "addr_home", paymentMethod: "COD" }, { checkoutApproval: { revision: 0, latestRevision: 1 } }),
    ).resolves.toMatchObject({
      success: false,
      error: { message: "Checkout approval is stale" },
    });

    const checkout = expectSuccess(
      await callTool(
        stub,
        "checkout",
        { addressId: "addr_home", paymentMethod: "COD" },
        { checkoutApproval: { revision: 1, latestRevision: 1 } },
      ),
    );
    expect(checkout).toMatchObject({
      success: true,
      message: expect.stringContaining("Instamart order placed successfully"),
    });

    await expect(
      callTool(stub, "checkout", { addressId: "addr_home", paymentMethod: "COD" }, { checkoutApproval: { revision: 1, latestRevision: 1 } }),
    ).resolves.toMatchObject({
      success: false,
      error: { message: "Cart has already been checked out" },
    });
  });

  it("supports uncertain checkout verification through get_orders before retry", async () => {
    const stub = createStub();
    await callTool(stub, "update_cart", {
      selectedAddressId: "addr_home",
      items: [{ spinId: "spin_rice_1kg", quantity: 2 }],
    });

    await expect(
      callTool(
        stub,
        "checkout",
        { addressId: "addr_home", paymentMethod: "COD" },
        { checkoutApproval: { revision: 1, latestRevision: 1 }, simulateCheckoutUncertainty: "order_created" },
      ),
    ).resolves.toMatchObject({
      success: false,
      error: { message: "Checkout result uncertain; call get_orders before retrying" },
    });

    const orders = await callTool(stub, "get_orders", { activeOnly: true });
    expect(orders).toMatchObject({
      success: true,
      data: { orders: [expect.objectContaining({ orderId: expect.any(String) })] },
    });

    await expect(
      callTool(stub, "checkout", { addressId: "addr_home", paymentMethod: "COD" }, { checkoutApproval: { revision: 1, latestRevision: 1 } }),
    ).resolves.toMatchObject({
      success: false,
      error: { message: "Cart has already been checked out" },
    });
  });

  it("returns order history, details, tracking, and sanitized error reports", async () => {
    const stub = createStub();
    await callTool(stub, "update_cart", {
      selectedAddressId: "addr_home",
      items: [{ spinId: "spin_rice_1kg", quantity: 2 }],
    });
    const checkout = expectSuccess(
      await callTool(
        stub,
        "checkout",
        { addressId: "addr_home", paymentMethod: "COD" },
        { checkoutApproval: { revision: 1, latestRevision: 1 } },
      ),
    );
    const orders = checkout.data.orders as Array<{ orderId: string }>;
    const orderId = orders[0]?.orderId;

    await expect(callTool(stub, "get_orders", { activeOnly: true })).resolves.toMatchObject({
      success: true,
      data: { orders: [expect.objectContaining({ orderId })] },
    });
    await expect(callTool(stub, "get_orders", { count: 99 })).resolves.toMatchObject({
      success: true,
      data: { count: 1 },
    });
    await expect(callTool(stub, "get_order_details", { orderId })).resolves.toMatchObject({
      success: true,
      data: { order: expect.objectContaining({ orderId, items: expect.any(Array) }) },
    });
    await expect(callTool(stub, "track_order", { orderId, lat: 12.9716, lng: 77.6412 })).resolves.toMatchObject({
      success: true,
      data: { tracking: expect.objectContaining({ orderId, status: expect.any(String), etaMinutes: expect.any(Number) }) },
    });

    await expect(
      callTool(stub, "report_error", {
        tool: "checkout",
        errorMessage: "Payment method is not available",
        toolContext: {
          orderId,
          addressId: "addr_home",
          accessToken: "secret",
          otp: "123456",
          fullAddress: "12 Test Street",
        },
      }),
    ).resolves.toMatchObject({
      success: true,
      data: {
        reportLink: expect.stringContaining("mailto:"),
        toolContext: { orderId, addressId: "addr_home" },
      },
    });
  });
});

import { INSTAMART_TOOL_NAMES, type InstamartToolName } from "./contract-tools.js";

export type ToolEnvelope =
  | { success: true; data: Record<string, unknown>; message?: string }
  | { success: false; error: { message: string; reportLink?: string; reportHint?: string } };

export type InstamartToolCallInput = {
  name: string;
  arguments?: Record<string, unknown>;
  context?: {
    accessToken?: unknown;
    addressDeletionConfirmed?: unknown;
    checkoutApproval?: unknown;
    simulateCheckoutUncertainty?: unknown;
  };
};

export type InstamartMcpClient = {
  callTool(input: InstamartToolCallInput): Promise<ToolEnvelope>;
};

type StubAddress = {
  id: string;
  label: string;
  fullAddress: string;
  addressLine: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  addressCategory: string;
  userName: string;
  userPhone: string;
  serviceable: boolean;
};

type StubVariant = {
  spinId: string;
  label: string;
  quantityLabel: string;
  price: number;
  inStock: boolean;
  storeId: string;
};

type StubProduct = {
  id: string;
  name: string;
  keywords: string[];
  variants: StubVariant[];
};

type CartItem = {
  spinId: string;
  quantity: number;
};

type StubOrder = {
  orderId: string;
  addressId: string;
  items: Array<CartItem & { name: string; unitPrice: number; lineTotal: number }>;
  bill: {
    itemTotal: number;
    deliveryFee: number;
    handlingFee: number;
    grandTotal: number;
  };
  status: string;
  createdAt: string;
  paymentMethod: string;
  coordinates: { lat: number; lng: number };
};

type SessionState = {
  addresses: StubAddress[];
  cart: {
    selectedAddressId: string | null;
    items: CartItem[];
    checkedOut: boolean;
  };
  orders: StubOrder[];
  reports: Array<Record<string, unknown>>;
};

const forbiddenArgumentKeys = new Set([
  "accessToken",
  "access_token",
  "authorization",
  "password",
  "otp",
  "session",
  "sessionId",
  "token",
  "userId",
  "user_id",
]);

const addressCategories = new Set(["HOME", "WORK", "OFFICE", "FRIENDS_AND_FAMILY", "OTHER"]);

const toolArgumentRules: Record<InstamartToolName, { required: string[]; optional: string[] }> = {
  create_address: {
    required: [
      "fullAddress",
      "addressLine",
      "addressLine2",
      "city",
      "postalCode",
      "latitude",
      "longitude",
      "addressCategory",
      "userName",
      "userPhone",
    ],
    optional: ["locality", "addressTag", "receiverName", "receiverPhone"],
  },
  delete_address: { required: ["addressId"], optional: [] },
  get_addresses: { required: [], optional: [] },
  search_products: { required: ["addressId", "query"], optional: ["offset"] },
  your_go_to_items: { required: ["addressId"], optional: ["offset"] },
  clear_cart: { required: [], optional: [] },
  get_cart: { required: [], optional: [] },
  update_cart: { required: ["selectedAddressId", "items"], optional: [] },
  checkout: { required: ["addressId"], optional: ["paymentMethod"] },
  get_order_details: { required: ["orderId"], optional: [] },
  get_orders: { required: [], optional: ["count", "orderType", "activeOnly"] },
  track_order: { required: ["orderId", "lat", "lng"], optional: [] },
  report_error: { required: ["tool", "errorMessage"], optional: ["domain", "flowDescription", "toolContext", "userNotes"] },
};

export class LocalInstamartMcpStub {
  private readonly sessions = new Map<string, SessionState>();
  private orderSequence = 1;
  private addressSequence = 1;

  listTools(): Array<{ name: InstamartToolName }> {
    return INSTAMART_TOOL_NAMES.map((name) => ({ name }));
  }

  async callTool(input: InstamartToolCallInput): Promise<ToolEnvelope> {
    const toolName = parseToolName(input.name);
    if (!toolName) {
      return failure(`Unknown Instamart tool: ${input.name}`);
    }

    const accessToken = readAccessToken(input.context?.accessToken);
    if (!accessToken) {
      return failure("Unauthenticated Swiggy session");
    }

    const args = input.arguments ?? {};
    const validation = validateArguments(toolName, args);
    if (!validation.success) {
      return validation;
    }

    const session = this.getSession(accessToken);
    switch (toolName) {
      case "create_address":
        return this.createAddress(session, args);
      case "delete_address":
        return this.deleteAddress(session, args, input.context?.addressDeletionConfirmed);
      case "get_addresses":
        return success({ addresses: session.addresses.map(toPublicAddress) });
      case "search_products":
        return this.searchProducts(session, args);
      case "your_go_to_items":
        return this.yourGoToItems(session, args);
      case "clear_cart":
        session.cart = { selectedAddressId: null, items: [], checkedOut: false };
        return success({ cleared: true }, "Instamart cart cleared");
      case "update_cart":
        return this.updateCart(session, args);
      case "get_cart":
        return success(this.getCartData(session));
      case "checkout":
        return this.checkout(session, args, input.context?.checkoutApproval, input.context?.simulateCheckoutUncertainty);
      case "get_order_details":
        return this.getOrderDetails(session, args);
      case "get_orders":
        return this.getOrders(session, args);
      case "track_order":
        return this.trackOrder(session, args);
      case "report_error":
        return this.reportError(session, args);
    }
  }

  private getSession(accessToken: string): SessionState {
    const existing = this.sessions.get(accessToken);
    if (existing) {
      return existing;
    }

    const session = {
      addresses: [seedHomeAddress()],
      cart: {
        selectedAddressId: null,
        items: [],
        checkedOut: false,
      },
      orders: [],
      reports: [],
    };
    this.sessions.set(accessToken, session);
    return session;
  }

  private createAddress(session: SessionState, args: Record<string, unknown>): ToolEnvelope {
    if (!addressCategories.has(String(args.addressCategory))) {
      return failure("Unsupported addressCategory");
    }

    const address: StubAddress = {
      id: `addr_local_${this.addressSequence++}`,
      label: String(args.addressTag ?? args.addressCategory),
      fullAddress: String(args.fullAddress),
      addressLine: String(args.addressLine),
      addressLine2: String(args.addressLine2),
      city: String(args.city),
      postalCode: String(args.postalCode),
      latitude: Number(args.latitude),
      longitude: Number(args.longitude),
      addressCategory: String(args.addressCategory),
      userName: String(args.userName),
      userPhone: String(args.userPhone),
      serviceable: true,
    };
    session.addresses.unshift(address);
    return success({ address: toPublicAddress(address) }, "Address saved");
  }

  private deleteAddress(session: SessionState, args: Record<string, unknown>, confirmed: unknown): ToolEnvelope {
    const addressId = String(args.addressId);
    const index = session.addresses.findIndex((address) => address.id === addressId);
    if (index === -1) {
      return failure("Address not found");
    }
    if (confirmed !== true) {
      return failure("Address deletion requires explicit confirmation");
    }

    session.addresses.splice(index, 1);
    if (session.cart.selectedAddressId === addressId) {
      session.cart = { selectedAddressId: null, items: [], checkedOut: false };
    }
    return success({ deleted: true }, "Address deleted");
  }

  private searchProducts(session: SessionState, args: Record<string, unknown>): ToolEnvelope {
    const address = findAddress(session, String(args.addressId));
    if (!address) {
      return failure("Address not found");
    }
    if (!address.serviceable) {
      return failure("Address not serviceable");
    }

    const query = String(args.query).toLowerCase();
    const offset = Number(args.offset ?? 0);
    const products = productCatalog
      .filter((product) => product.keywords.some((keyword) => keyword.includes(query) || query.includes(keyword)))
      .slice(offset, offset + 10);

    if (products.length === 0) {
      return failure("Product not found");
    }

    return success({ products: products.map(toPublicProduct), offset });
  }

  private yourGoToItems(session: SessionState, args: Record<string, unknown>): ToolEnvelope {
    const address = findAddress(session, String(args.addressId));
    if (!address) {
      return failure("Address not found");
    }

    const offset = Number(args.offset ?? 0);
    return success({
      products: productCatalog.slice(offset, offset + 4).map(toPublicProduct),
      offset,
    });
  }

  private updateCart(session: SessionState, args: Record<string, unknown>): ToolEnvelope {
    const selectedAddressId = String(args.selectedAddressId);
    const address = findAddress(session, selectedAddressId);
    if (!address) {
      return failure("Address not found");
    }
    if (!address.serviceable) {
      return failure("Address not serviceable");
    }

    const items = args.items;
    if (!Array.isArray(items)) {
      return failure("Invalid items");
    }

    const nextItems: CartItem[] = [];
    for (const item of items) {
      if (!isRecord(item) || !("spinId" in item) || !("quantity" in item)) {
        return failure("Missing required cart item field");
      }

      const spinId = String(item.spinId);
      const quantity = Number(item.quantity);
      const variant = findVariant(spinId);
      if (!variant) {
        return failure("Product variant not found");
      }
      if (!variant.inStock) {
        return failure("Item out of stock");
      }
      if (!Number.isInteger(quantity) || quantity <= 0) {
        return failure("Invalid quantity");
      }

      nextItems.push({ spinId, quantity });
    }

    session.cart = { selectedAddressId, items: nextItems, checkedOut: false };
    return success(this.getCartData(session), "Instamart cart updated");
  }

  private checkout(
    session: SessionState,
    args: Record<string, unknown>,
    approval: unknown,
    simulateUncertainty: unknown,
  ): ToolEnvelope {
    if (!isLatestApproval(approval)) {
      if (isRecord(approval) && Number(approval.revision) !== Number(approval.latestRevision)) {
        return failure("Checkout approval is stale");
      }
      return failure("Checkout requires latest explicit Telegram approval");
    }
    if (session.cart.checkedOut) {
      return failure("Cart has already been checked out");
    }
    if (session.cart.items.length === 0 || !session.cart.selectedAddressId) {
      return failure("Cart is empty");
    }
    if (String(args.addressId) !== session.cart.selectedAddressId) {
      return failure("Checkout address does not match cart address");
    }

    const cartData = this.getCartData(session);
    const availablePaymentMethods = cartData.availablePaymentMethods as string[];
    const paymentMethod = String(args.paymentMethod ?? availablePaymentMethods[0]);
    if (!availablePaymentMethods.includes(paymentMethod)) {
      return failure("Payment method is not available");
    }

    const address = findAddress(session, session.cart.selectedAddressId);
    if (!address) {
      return failure("Address not found");
    }

    const order = this.createOrder(session, address, paymentMethod, cartData.bill as StubOrder["bill"]);

    if (simulateUncertainty === "order_created") {
      return failure("Checkout result uncertain; call get_orders before retrying");
    }

    return success(
      { orders: [toPublicOrder(order)] },
      "Instamart order placed successfully. Payment method: COD.",
    );
  }

  private createOrder(
    session: SessionState,
    address: StubAddress,
    paymentMethod: string,
    bill: StubOrder["bill"],
  ): StubOrder {
    const order: StubOrder = {
      orderId: `IM-${String(this.orderSequence++).padStart(6, "0")}`,
      addressId: address.id,
      items: buildDetailedItems(session.cart.items),
      bill,
      status: "PLACED",
      createdAt: new Date().toISOString(),
      paymentMethod,
      coordinates: { lat: address.latitude, lng: address.longitude },
    };
    session.orders.unshift(order);
    session.cart.checkedOut = true;
    return order;
  }

  private getOrderDetails(session: SessionState, args: Record<string, unknown>): ToolEnvelope {
    const order = findOrder(session, String(args.orderId));
    if (!order) {
      return failure("Order not found");
    }

    return success({ order: toPublicOrderDetails(order) });
  }

  private getOrders(session: SessionState, args: Record<string, unknown>): ToolEnvelope {
    const activeOnly = args.activeOnly === true;
    const count = Math.min(Number(args.count ?? 10), 20);
    const orders = session.orders
      .filter((order) => !activeOnly || ["PLACED", "PACKING", "OUT_FOR_DELIVERY"].includes(order.status))
      .slice(0, count)
      .map(toPublicOrder);

    return success({ orders, count: orders.length, orderType: String(args.orderType ?? "DASH") });
  }

  private trackOrder(session: SessionState, args: Record<string, unknown>): ToolEnvelope {
    const order = findOrder(session, String(args.orderId));
    if (!order) {
      return failure("Order not found");
    }

    const lat = Number(args.lat);
    const lng = Number(args.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return failure("Invalid delivery coordinates");
    }

    return success({
      tracking: {
        orderId: order.orderId,
        status: order.status,
        etaMinutes: 18,
        deliveryPartnerLocation: { lat: lat + 0.004, lng: lng + 0.004 },
        store: { id: "store_indiranagar", name: "Instamart Indiranagar" },
        address: { id: order.addressId },
        items: order.items,
        paymentMethod: order.paymentMethod,
      },
    });
  }

  private reportError(session: SessionState, args: Record<string, unknown>): ToolEnvelope {
    const report = {
      tool: String(args.tool),
      domain: String(args.domain ?? "im"),
      errorMessage: String(args.errorMessage),
      flowDescription: typeof args.flowDescription === "string" ? args.flowDescription : undefined,
      toolContext: sanitizeToolContext(args.toolContext),
      userNotes: typeof args.userNotes === "string" ? args.userNotes : undefined,
    };
    session.reports.push(report);

    return success(
      {
        reportId: `report_${session.reports.length}`,
        reportLink: `mailto:builders@swiggy.in?subject=${encodeURIComponent(`Instamart ${report.tool} error`)}`,
        summary: `${report.domain}:${report.tool} failed with ${report.errorMessage}`,
        toolContext: report.toolContext,
      },
      "Diagnostic report prepared",
    );
  }

  private getCartData(session: SessionState): Record<string, unknown> {
    const detailedItems = buildDetailedItems(session.cart.items);
    const itemTotal = detailedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const deliveryFee = itemTotal >= 199 || itemTotal === 0 ? 0 : 30;
    const handlingFee = itemTotal === 0 ? 0 : 5;

    return {
      selectedAddressId: session.cart.selectedAddressId,
      items: detailedItems,
      bill: {
        itemTotal,
        deliveryFee,
        handlingFee,
        grandTotal: itemTotal + deliveryFee + handlingFee,
        minimumOrderValue: 99,
        freeDeliveryThreshold: 199,
      },
      availablePaymentMethods: ["COD"],
    };
  }
}

function validateArguments(toolName: InstamartToolName, args: Record<string, unknown>): ToolEnvelope | { success: true } {
  const rules = toolArgumentRules[toolName];
  const allowed = new Set([...rules.required, ...rules.optional]);

  for (const key of Object.keys(args)) {
    if (forbiddenArgumentKeys.has(key)) {
      return failure("Tool arguments must not include session credentials");
    }
    if (!allowed.has(key)) {
      return failure(`Unexpected argument: ${key}`);
    }
  }

  for (const key of rules.required) {
    if (!(key in args)) {
      return failure(`Missing required argument: ${key}`);
    }
  }

  return { success: true };
}

function parseToolName(name: string): InstamartToolName | null {
  return INSTAMART_TOOL_NAMES.includes(name as InstamartToolName) ? (name as InstamartToolName) : null;
}

function readAccessToken(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function success(data: Record<string, unknown>, message?: string): ToolEnvelope {
  return message ? { success: true, data, message } : { success: true, data };
}

function failure(message: string): ToolEnvelope {
  return {
    success: false,
    error: {
      message,
      reportHint: "Run report_error to share diagnostics",
    },
  };
}

function seedHomeAddress(): StubAddress {
  return {
    id: "addr_home",
    label: "Home",
    fullAddress: "Flatmeal Demo Home, Indiranagar, Bengaluru 560038",
    addressLine: "Flatmeal Demo Home",
    addressLine2: "",
    city: "Bengaluru",
    postalCode: "560038",
    latitude: 12.9716,
    longitude: 77.6412,
    addressCategory: "HOME",
    userName: "Flatmeal Owner",
    userPhone: "9999999999",
    serviceable: true,
  };
}

function toPublicAddress(address: StubAddress): Record<string, unknown> {
  return {
    id: address.id,
    label: address.label,
    fullAddress: address.fullAddress,
    addressLine: address.addressLine,
    addressLine2: address.addressLine2,
    city: address.city,
    postalCode: address.postalCode,
    addressCategory: address.addressCategory,
    serviceable: address.serviceable,
  };
}

const productCatalog: StubProduct[] = [
  {
    id: "prod_rice",
    name: "Sona Masoori Rice",
    keywords: ["rice", "chawal", "sona masoori"],
    variants: [
      { spinId: "spin_rice_1kg", label: "Sona Masoori Rice 1 kg", quantityLabel: "1 kg", price: 89, inStock: true, storeId: "store_indiranagar" },
      { spinId: "spin_rice_5kg", label: "Sona Masoori Rice 5 kg", quantityLabel: "5 kg", price: 419, inStock: true, storeId: "store_indiranagar" },
    ],
  },
  {
    id: "prod_milk",
    name: "Toned Milk",
    keywords: ["milk", "doodh"],
    variants: [
      { spinId: "spin_milk_1l", label: "Toned Milk 1 L", quantityLabel: "1 L", price: 68, inStock: true, storeId: "store_indiranagar" },
    ],
  },
  {
    id: "prod_curd",
    name: "Fresh Curd",
    keywords: ["curd", "dahi", "yogurt"],
    variants: [
      { spinId: "spin_curd_500g", label: "Fresh Curd 500 g", quantityLabel: "500 g", price: 45, inStock: true, storeId: "store_indiranagar" },
    ],
  },
  {
    id: "prod_chicken",
    name: "Chicken Curry Cut",
    keywords: ["chicken", "biryani"],
    variants: [
      { spinId: "spin_chicken_500g", label: "Chicken Curry Cut 500 g", quantityLabel: "500 g", price: 179, inStock: true, storeId: "store_indiranagar" },
    ],
  },
  {
    id: "prod_onion",
    name: "Onion",
    keywords: ["onion", "pyaz"],
    variants: [
      { spinId: "spin_onion_1kg", label: "Onion 1 kg", quantityLabel: "1 kg", price: 52, inStock: true, storeId: "store_indiranagar" },
    ],
  },
];

function toPublicProduct(product: StubProduct): Record<string, unknown> {
  return {
    id: product.id,
    name: product.name,
    variants: product.variants.map((variant) => ({
      spinId: variant.spinId,
      name: variant.label,
      quantity: variant.quantityLabel,
      price: variant.price,
      inStock: variant.inStock,
    })),
  };
}

function findAddress(session: SessionState, addressId: string): StubAddress | undefined {
  return session.addresses.find((address) => address.id === addressId);
}

function findVariant(spinId: string): StubVariant | undefined {
  return productCatalog.flatMap((product) => product.variants).find((variant) => variant.spinId === spinId);
}

function findProductBySpinId(spinId: string): StubProduct | undefined {
  return productCatalog.find((product) => product.variants.some((variant) => variant.spinId === spinId));
}

function buildDetailedItems(items: CartItem[]): Array<CartItem & { name: string; unitPrice: number; lineTotal: number }> {
  return items.map((item) => {
    const variant = findVariant(item.spinId);
    const product = findProductBySpinId(item.spinId);
    const unitPrice = variant?.price ?? 0;
    return {
      spinId: item.spinId,
      quantity: item.quantity,
      name: variant?.label ?? product?.name ?? item.spinId,
      unitPrice,
      lineTotal: unitPrice * item.quantity,
    };
  });
}

function isLatestApproval(value: unknown): boolean {
  return isRecord(value) && Number(value.revision) === Number(value.latestRevision);
}

function findOrder(session: SessionState, orderId: string): StubOrder | undefined {
  return session.orders.find((order) => order.orderId === orderId);
}

function toPublicOrder(order: StubOrder): Record<string, unknown> {
  return {
    orderId: order.orderId,
    status: order.status,
    items: order.items.map((item) => ({ name: item.name, quantity: item.quantity })),
    bill: order.bill,
    addressId: order.addressId,
    paymentMethod: order.paymentMethod,
    coordinates: order.coordinates,
    createdAt: order.createdAt,
  };
}

function toPublicOrderDetails(order: StubOrder): Record<string, unknown> {
  return {
    ...toPublicOrder(order),
    items: order.items,
    refund: null,
  };
}

function sanitizeToolContext(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, contextValue] of Object.entries(value)) {
    if (forbiddenArgumentKeys.has(key) || key.toLowerCase().includes("address") && key !== "addressId") {
      continue;
    }
    sanitized[key] = contextValue;
  }
  return sanitized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

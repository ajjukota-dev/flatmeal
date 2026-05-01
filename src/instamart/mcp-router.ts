import { Router } from "express";
import type { LocalInstamartMcpStub } from "./local-mcp-stub.js";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: {
    name?: string;
    arguments?: Record<string, unknown>;
    context?: {
      addressDeletionConfirmed?: unknown;
      checkoutApproval?: unknown;
      simulateCheckoutUncertainty?: unknown;
    };
  };
};

export function createInstamartMcpRouter(stub: LocalInstamartMcpStub): Router {
  const router = Router();

  router.post("/mcp/instamart", async (request, response) => {
    const body = request.body as JsonRpcRequest;

    if (body.method === "tools/list") {
      response.json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        result: { tools: stub.listTools() },
      });
      return;
    }

    if (body.method !== "tools/call" || !body.params?.name) {
      response.status(400).json({
        jsonrpc: "2.0",
        id: body.id ?? null,
        error: { code: -32601, message: "Unsupported MCP method" },
      });
      return;
    }

    const result = await stub.callTool({
      name: body.params.name,
      arguments: body.params.arguments ?? {},
      context: {
        accessToken: readBearerToken(request.headers.authorization),
        addressDeletionConfirmed: body.params.context?.addressDeletionConfirmed,
        checkoutApproval: body.params.context?.checkoutApproval,
        simulateCheckoutUncertainty: body.params.context?.simulateCheckoutUncertainty,
      },
    });

    response.json({
      jsonrpc: "2.0",
      id: body.id ?? null,
      result,
    });
  });

  return router;
}

function readBearerToken(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length);
}

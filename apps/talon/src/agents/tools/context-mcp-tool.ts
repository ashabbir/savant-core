import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readNumberParam, readStringParam } from "./common.js";

const CONTEXT_GATEWAY_URL = process.env.CONTEXT_GATEWAY_URL || "http://mcp-gateway:4444";
const CONTEXT_GATEWAY_TOKEN = process.env.CONTEXT_GATEWAY_TOKEN || "dev-context-token";

const ContextMcpToolSchema = Type.Object({
  action: Type.Union([
    Type.Literal("list_repos"),
    Type.Literal("memory_search"),
    Type.Literal("memory_read"),
    Type.Literal("code_search"),
    Type.Literal("code_read"),
  ]),
  repo: Type.Optional(Type.String({ description: "Indexed repository name." })),
  query: Type.Optional(Type.String({ description: "Search query text." })),
  path: Type.Optional(Type.String({ description: "Relative file path in the repository." })),
  limit: Type.Optional(Type.Number({ description: "Max rows to return for search actions." })),
  maxBytes: Type.Optional(Type.Number({ description: "Max bytes for code_read action." })),
});

type ContextGatewayCallResult = { ok: boolean; data?: unknown; error?: string };

async function callContextGateway(params: {
  method: "GET" | "POST";
  path: string;
  gatewayUrl: string;
  gatewayToken: string;
  signal?: AbortSignal;
  body?: Record<string, unknown>;
}): Promise<ContextGatewayCallResult> {
  const url = `${params.gatewayUrl}${params.path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (params.gatewayToken) {
    headers.Authorization = `Bearer ${params.gatewayToken}`;
  }

  try {
    const response = await fetch(url, {
      method: params.method,
      headers,
      body: params.body ? JSON.stringify(params.body) : undefined,
      signal: params.signal,
    });

    const json = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const errorText =
        (typeof json.error === "string" && json.error) ||
        (typeof json.message === "string" && json.message) ||
        `HTTP ${response.status}`;
      return { ok: false, error: errorText };
    }

    const data = "data" in json ? json.data : json;
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: message };
  }
}

export function createContextMcpTool(options?: {
  gatewayUrl?: string;
  gatewayToken?: string;
}): AnyAgentTool {
  const gatewayUrl = options?.gatewayUrl ?? CONTEXT_GATEWAY_URL;
  const gatewayToken = options?.gatewayToken ?? CONTEXT_GATEWAY_TOKEN;

  return {
    label: "Context MCP",
    name: "context_mcp",
    description:
      "Query indexed repositories via Context MCP. Supports repo listing, semantic memory search/read, and code search/read.",
    parameters: ContextMcpToolSchema,
    execute: async (_toolCallId, args, signal) => {
      if (signal?.aborted) {
        const error = new Error("Context MCP action aborted");
        error.name = "AbortError";
        throw error;
      }

      if (!gatewayToken) {
        return jsonResult({
          ok: false,
          error: "CONTEXT_GATEWAY_TOKEN is not configured",
        });
      }

      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });

      if (action === "list_repos") {
        const result = await callContextGateway({
          method: "GET",
          path: "/v1/index/repos",
          gatewayUrl,
          gatewayToken,
          signal,
        });
        return jsonResult(result);
      }

      const repo = readStringParam(params, "repo");
      if (!repo) {
        return jsonResult({ ok: false, error: "repo is required" });
      }

      if (action === "memory_search" || action === "code_search") {
        const query = readStringParam(params, "query");
        if (!query) {
          return jsonResult({ ok: false, error: "query is required" });
        }
        const limit = readNumberParam(params, "limit", { integer: true });
        const result = await callContextGateway({
          method: "POST",
          path: `/v1/mcps/context/tools/${action}/run`,
          gatewayUrl,
          gatewayToken,
          signal,
          body: {
            arguments: {
              repo,
              query,
              ...(typeof limit === "number" ? { limit } : {}),
            },
          },
        });
        return jsonResult(result);
      }

      if (action === "memory_read" || action === "code_read") {
        const filePath = readStringParam(params, "path");
        if (!filePath) {
          return jsonResult({ ok: false, error: "path is required" });
        }
        const maxBytes =
          action === "code_read" ? readNumberParam(params, "maxBytes", { integer: true }) : undefined;
        const result = await callContextGateway({
          method: "POST",
          path: `/v1/mcps/context/tools/${action}/run`,
          gatewayUrl,
          gatewayToken,
          signal,
          body: {
            arguments: {
              repo,
              path: filePath,
              ...(typeof maxBytes === "number" ? { maxBytes } : {}),
            },
          },
        });
        return jsonResult(result);
      }

      return jsonResult({ ok: false, error: `Unknown action: ${action}` });
    },
  };
}

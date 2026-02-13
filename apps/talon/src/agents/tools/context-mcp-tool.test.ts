import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createContextMcpTool } from "./context-mcp-tool.js";

describe("createContextMcpTool", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns metadata for the context mcp tool", () => {
    const tool = createContextMcpTool({ gatewayToken: "token" });
    expect(tool.name).toBe("context_mcp");
    expect(tool.label).toBe("Context MCP");
    expect(tool.description).toContain("Context MCP");
  });

  it("lists repos successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          data: {
            repos: [{ repo_name: "savant-core" }],
          },
        }),
    }) as typeof fetch;

    const tool = createContextMcpTool({
      gatewayUrl: "http://localhost:4444",
      gatewayToken: "token",
    });

    const result = (await tool.execute("call_1", {
      action: "list_repos",
    })) as { content: Array<{ text: string }> };

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4444/v1/index/repos",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      }),
    );
    expect(result.content[0].text).toContain("savant-core");
  });

  it("runs code_search successfully", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          ok: true,
          data: [{ file: "src/index.ts", line: 12 }],
        }),
    }) as typeof fetch;

    const tool = createContextMcpTool({
      gatewayUrl: "http://localhost:4444",
      gatewayToken: "token",
    });

    const result = (await tool.execute("call_2", {
      action: "code_search",
      repo: "savant-core",
      query: "createApp",
      limit: 10,
    })) as { content: Array<{ text: string }> };

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4444/v1/mcps/context/tools/code_search/run",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(result.content[0].text).toContain("src/index.ts");
  });

  it("returns a configuration error when token is missing", async () => {
    const tool = createContextMcpTool({
      gatewayUrl: "http://localhost:4444",
      gatewayToken: "",
    });

    const result = (await tool.execute("call_3", {
      action: "list_repos",
    })) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("CONTEXT_GATEWAY_TOKEN is not configured");
  });

  it("validates required repo for search/read actions", async () => {
    const tool = createContextMcpTool({
      gatewayUrl: "http://localhost:4444",
      gatewayToken: "token",
    });

    const result = (await tool.execute("call_4", {
      action: "memory_search",
      query: "foo",
    })) as { content: Array<{ text: string }> };

    expect(result.content[0].text).toContain("repo is required");
  });
});

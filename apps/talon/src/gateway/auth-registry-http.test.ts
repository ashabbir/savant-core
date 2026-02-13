import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAuthRegistryHttpRequest } from "./auth-registry-http.js";

vi.mock("./auth.js", () => ({
  authorizeGatewayConnect: vi.fn(async () => ({ ok: true, user: { id: "test" } })),
}));

vi.mock("../agents/auth-profiles.js", () => {
  const store = {
    profiles: {} as Record<string, { provider: string; email?: string }>,
  };
  return {
    ensureAuthProfileStore: vi.fn(() => store),
    listProfilesForProvider: vi.fn((s, provider: string) =>
      Object.keys(s.profiles).filter((id) => s.profiles[id].provider === provider),
    ),
    upsertAuthProfile: vi.fn(({ profileId, credential }) => {
      store.profiles[profileId] = credential;
    }),
  };
});

function makeRes() {
  return {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
}

describe("handleAuthRegistryHttpRequest", () => {
  let req: IncomingMessage;
  let res: ServerResponse;

  beforeEach(() => {
    req = { url: "/v1/auth/providers", method: "GET", headers: {} } as IncomingMessage;
    res = makeRes();
  });

  it("ignores unrelated paths", async () => {
    req.url = "/v1/other";
    await expect(
      handleAuthRegistryHttpRequest(req, res, {
        auth: { apiKeys: [], basic: [], oidc: [], tailscale: { allowed: false, requireKey: false } },
      } as any),
    ).resolves.toBe(false);
  });

  it("returns provider status", async () => {
    const handled = await handleAuthRegistryHttpRequest(req, res, {
      auth: { apiKeys: [], basic: [], oidc: [], tailscale: { allowed: false, requireKey: false } },
    } as any);
    expect(handled).toBe(true);
    expect((res.end as any).mock.calls[0][0]).toContain("google");
  });

  it("supports auth start", async () => {
    req.url = "/v1/auth/start";
    req.method = "POST";
    req.on = vi.fn((event, cb) => {
      if (event === "data") cb(Buffer.from(JSON.stringify({ provider: "google" })));
      if (event === "end") cb();
      return req;
    }) as any;

    const handled = await handleAuthRegistryHttpRequest(req, res, {
      auth: { apiKeys: [], basic: [], oidc: [], tailscale: { allowed: false, requireKey: false } },
    } as any);
    expect(handled).toBe(true);
    expect((res.end as any).mock.calls[0][0]).toContain("authUrl");
  });

  it("stores api key credentials", async () => {
    req.url = "/v1/auth/exchange";
    req.method = "POST";
    req.on = vi.fn((event, cb) => {
      if (event === "data") cb(Buffer.from(JSON.stringify({ provider: "openai", apiKey: "sk-123" })));
      if (event === "end") cb();
      return req;
    }) as any;

    const handled = await handleAuthRegistryHttpRequest(req, res, {
      auth: { apiKeys: [], basic: [], oidc: [], tailscale: { allowed: false, requireKey: false } },
    } as any);
    expect(handled).toBe(true);
    expect((res.end as any).mock.calls[0][0]).toContain('"ok":true');
  });
});

import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import {
  readJsonBodyOrError,
  sendJson,
  sendMethodNotAllowed,
  sendUnauthorized,
} from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import {
  ensureAuthProfileStore,
  type AuthProfileCredential,
  type AuthProfileStore,
  listProfilesForProvider,
  saveAuthProfileStore,
  upsertAuthProfile,
} from "../agents/auth-profiles.js";
import { resolveStateDir } from "../config/paths.js";
import { agentRegistry } from "../agents/registry.js";
import { AUTH_PROFILE_FILENAME } from "../agents/auth-profiles/constants.js";
import fs from "node:fs";

type AuthRegistryHttpOptions = {
  auth: ResolvedGatewayAuth;
  maxBodyBytes?: number;
  trustedProxies?: string[];
};

type ProviderId =
  | "google"
  | "google-gemini-cli"
  | "google-antigravity"
  | "openai"
  | "openai-codex"
  | "anthropic"
  | "ollama";
const SUPPORTED_PROVIDERS: ProviderId[] = [
  "google",
  "google-gemini-cli",
  "google-antigravity",
  "openai",
  "openai-codex",
  "anthropic",
  "ollama",
];

const PROVIDER_MODELS: Record<ProviderId, string[]> = {
  google: ["gemini-1.5-pro", "gemini-1.5-flash"],
  "google-gemini-cli": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  "google-antigravity": ["gemini-3-flash", "gemini-3-pro-low", "gemini-3-pro-high"],
  openai: ["gpt-4o", "gpt-4o-mini"],
  "openai-codex": ["gpt-5.3-codex", "gpt-5.2-codex"],
  anthropic: ["claude-3-5-sonnet", "claude-3-7-sonnet"],
  ollama: ["llama3.1", "deepseek-r1:1.5b", "mistral"],
};

const OPENAI_CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const OPENAI_CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_CODEX_SCOPE = "openid profile email offline_access";
const OPENAI_CODEX_JWT_CLAIM_PATH = "https://api.openai.com/auth";
const OPENAI_CODEX_PKCE_TTL_MS = 15 * 60 * 1000;
const openAiCodexPkceStore = new Map<string, { verifier: string; redirectUri: string; createdAt: number }>();

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64UrlEncode(randomBytes(32));
  const challenge = base64UrlEncode(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function decodeJwtPayload(accessToken: string): Record<string, any> | null {
  try {
    const parts = String(accessToken || "").split(".");
    if (parts.length !== 3) return null;
    const payloadBase64Url = parts[1] || "";
    const payloadBase64 = payloadBase64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (payloadBase64.length % 4)) % 4;
    const payload = Buffer.from(payloadBase64 + "=".repeat(padLen), "base64").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function cleanupExpiredCodexPkceEntries() {
  const now = Date.now();
  for (const [state, entry] of openAiCodexPkceStore.entries()) {
    if (now - entry.createdAt > OPENAI_CODEX_PKCE_TTL_MS) {
      openAiCodexPkceStore.delete(state);
    }
  }
}

type ProviderModel = {
  id: string;
  provider: ProviderId;
};

function normalizeModelIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function resolveCredentialSecret(cred: AuthProfileCredential): string | undefined {
  if (cred.type === "api_key") {
    return cred.key?.trim() || undefined;
  }
  if (cred.type === "token") {
    return cred.token?.trim() || undefined;
  }
  const maybe = (cred as { access?: string; accessToken?: string }).access ??
    (cred as { access?: string; accessToken?: string }).accessToken;
  return typeof maybe === "string" && maybe.trim() ? maybe.trim() : undefined;
}

function resolveCredentialBaseUrl(cred: AuthProfileCredential): string | undefined {
  if (cred.type !== "api_key") return undefined;
  const candidate = cred.metadata?.baseUrl;
  if (!candidate) return undefined;
  const normalized = String(candidate).trim().replace(/\/+$/, "");
  return normalized || undefined;
}

function listCredentialsForProvider(store: AuthProfileStore, provider: ProviderId): AuthProfileCredential[] {
  const profileIds = listProfilesForProvider(store, provider);
  const creds: AuthProfileCredential[] = [];
  for (const id of profileIds) {
    const cred = store.profiles[id];
    if (cred) creds.push(cred);
  }
  return creds;
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(7000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return await res.json();
}

async function discoverOpenAIModels(credentials: AuthProfileCredential[]): Promise<string[]> {
  const urls = new Set<string>();
  for (const cred of credentials) {
    const base = resolveCredentialBaseUrl(cred) ?? "https://api.openai.com";
    urls.add(base);
  }
  if (urls.size === 0) {
    urls.add("https://api.openai.com");
  }

  for (const cred of credentials) {
    const secret = resolveCredentialSecret(cred);
    if (!secret) continue;
    for (const base of urls) {
      try {
        const data = await fetchJson(`${base}/v1/models`, {
          headers: { Authorization: `Bearer ${secret}` },
        });
        const ids = Array.isArray(data?.data)
          ? data.data.map((m: any) => String(m?.id || "").trim()).filter(Boolean)
          : [];
        if (ids.length > 0) return normalizeModelIds(ids);
      } catch {
        // Try next profile/base URL.
      }
    }
  }
  return [];
}

async function discoverAnthropicModels(credentials: AuthProfileCredential[]): Promise<string[]> {
  for (const cred of credentials) {
    const secret = resolveCredentialSecret(cred);
    if (!secret) continue;
    try {
      const data = await fetchJson("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": secret,
          "anthropic-version": "2023-06-01",
        },
      });
      const ids = Array.isArray(data?.data)
        ? data.data.map((m: any) => String(m?.id || "").trim()).filter(Boolean)
        : [];
      if (ids.length > 0) return normalizeModelIds(ids);
    } catch {
      // Try next profile.
    }
  }
  return [];
}

async function discoverGoogleModels(credentials: AuthProfileCredential[]): Promise<string[]> {
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models";

  for (const cred of credentials) {
    const secret = resolveCredentialSecret(cred);
    if (!secret) continue;

    // API key flow.
    if (cred.type === "api_key") {
      try {
        const data = await fetchJson(`${endpoint}?key=${encodeURIComponent(secret)}`);
        const ids = Array.isArray(data?.models)
          ? data.models
              .map((m: any) => String(m?.name || "").replace(/^models\//, "").trim())
              .filter(Boolean)
          : [];
        if (ids.length > 0) return normalizeModelIds(ids);
      } catch {
        // Fall through to bearer attempt.
      }
    }

    // OAuth/token bearer flow.
    try {
      const data = await fetchJson(endpoint, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const ids = Array.isArray(data?.models)
        ? data.models
            .map((m: any) => String(m?.name || "").replace(/^models\//, "").trim())
            .filter(Boolean)
        : [];
      if (ids.length > 0) return normalizeModelIds(ids);
    } catch {
      // Try next profile.
    }
  }

  return [];
}

async function discoverOllamaModels(credentials: AuthProfileCredential[]): Promise<string[]> {
  const baseUrls = new Set<string>();
  for (const cred of credentials) {
    const base = resolveCredentialBaseUrl(cred);
    if (!base) continue;
    baseUrls.add(base.replace(/\/v1$/, ""));
  }
  if (baseUrls.size === 0) {
    baseUrls.add(process.env.OLLAMA_API_BASE_URL || "http://127.0.0.1:11434");
  }

  for (const base of baseUrls) {
    try {
      const data = await fetchJson(`${base}/api/tags`);
      const ids = Array.isArray(data?.models)
        ? data.models.map((m: any) => String(m?.name || "").trim()).filter(Boolean)
        : [];
      if (ids.length > 0) return normalizeModelIds(ids);
    } catch {
      // Try next base URL.
    }
  }
  return [];
}

async function discoverProviderModels(provider: ProviderId, store: AuthProfileStore): Promise<string[]> {
  const credentials = listCredentialsForProvider(store, provider);
  if (credentials.length === 0) return [];

  try {
    if (provider === "openai") return await discoverOpenAIModels(credentials);
    if (provider === "anthropic") return await discoverAnthropicModels(credentials);
    if (provider === "google" || provider === "google-gemini-cli" || provider === "google-antigravity") {
      return await discoverGoogleModels(credentials);
    }
    if (provider === "ollama") return await discoverOllamaModels(credentials);
  } catch {
    // Provider discovery should never break the route.
  }
  return [];
}

function resolveMainAgentDir(): string {
  const root = resolveStateDir();
  return path.join(root, "agents", "main", "agent");
}

function syncAuthToAllAgents() {
    try {
        const root = resolveStateDir();
        const mainAuthPath = path.join(root, "agents", "main", "agent", AUTH_PROFILE_FILENAME);
        if (!fs.existsSync(mainAuthPath)) return;

        const agents = agentRegistry.list();
        for (const agent of agents) {
            const agentAuthDir = path.join(root, "agents", agent.id, "agent");
            const agentAuthPath = path.join(agentAuthDir, AUTH_PROFILE_FILENAME);
            if (!fs.existsSync(agentAuthDir)) {
                fs.mkdirSync(agentAuthDir, { recursive: true });
            }
            fs.copyFileSync(mainAuthPath, agentAuthPath);
        }
        console.log(`[auth] Synced global auth to ${agents.length} agents`);
    } catch (err) {
        console.error(`[auth] Failed to sync global auth to agents:`, err);
    }
}

function normalizeProvider(input: unknown): ProviderId | null {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "google" || value === "google-api") return "google";
  if (value === "google-gemini-cli") return "google-gemini-cli";
  if (value === "google-antigravity") return "google-antigravity";
  if (value === "openai-codex") return "openai-codex";
  return SUPPORTED_PROVIDERS.includes(value as ProviderId) ? (value as ProviderId) : null;
}

export async function handleAuthRegistryHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: AuthRegistryHttpOptions,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  const isAuthPath = url.pathname.startsWith("/v1/auth");
  const isProvidersPath = url.pathname.startsWith("/v1/providers");

  if (!isAuthPath && !isProvidersPath) {
    return false;
  }

  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth: opts.auth,
    connectAuth: { token, password: token },
    req,
    trustedProxies: opts.trustedProxies,
  });
  if (!authResult.ok) {
    sendUnauthorized(res);
    return true;
  }

  const agentDir = resolveMainAgentDir();

  if (url.pathname === "/v1/auth/providers") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res);
      return true;
    }

    const store = ensureAuthProfileStore(agentDir);
    const providers = Object.fromEntries(
      SUPPORTED_PROVIDERS.map((provider) => {
        const profileIds = listProfilesForProvider(store, provider);
        const connected = profileIds.length > 0;
        const firstProfile = connected ? store.profiles[profileIds[0]] : null;
        
        // Check for specific profile types
        const hasOauth = profileIds.some(id => store.profiles[id].type === "oauth");
        const hasApiKey = profileIds.some(id => store.profiles[id].type === "api_key");

        return [
          provider,
          {
            connected,
            hasOauth,
            hasApiKey,
            profileCount: profileIds.length,
            email: firstProfile && "email" in firstProfile ? (firstProfile as any).email : undefined,
            baseUrl: firstProfile && "metadata" in firstProfile ? (firstProfile as any).metadata?.baseUrl : undefined,
          },
        ];
      }),
    );

    sendJson(res, 200, providers);
    return true;
  }

  if (url.pathname === "/v1/auth/start") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return true;
    }

    const body = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? 1024 * 1024);
    if (body === undefined) return true;

    const provider = normalizeProvider((body as { provider?: string }).provider);
    if (!provider) {
      sendJson(res, 400, { error: "Unsupported provider" });
      return true;
    }

    const callbackUrl =
      String((body as { callbackUrl?: string }).callbackUrl || "").trim() ||
      "http://localhost:3333/api/talon/callback";

    if (provider === "google-gemini-cli" || provider === "google-antigravity") {
      const envKey =
        provider === "google-gemini-cli"
          ? "TALON_GOOGLE_GEMINI_CLI_AUTH_URL"
          : "TALON_GOOGLE_ANTIGRAVITY_AUTH_URL";
      let authUrl = String(process.env[envKey] || "").trim();
      if (!authUrl) {
        const clientId = String(
          process.env[
            provider === "google-gemini-cli"
              ? "TALON_GOOGLE_GEMINI_CLI_CLIENT_ID"
              : "TALON_GOOGLE_ANTIGRAVITY_CLIENT_ID"
          ] || "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com",
        ).trim();
        const scopes =
          provider === "google-antigravity"
            ? "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile"
            : "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";
        authUrl =
          `https://accounts.google.com/o/oauth2/v2/auth?` +
          `client_id=${encodeURIComponent(clientId)}` +
          `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
          `&response_type=code` +
          `&scope=${encodeURIComponent(scopes)}` +
          `&access_type=offline&prompt=consent&state=${encodeURIComponent(provider)}`;
      }
      sendJson(res, 200, { provider, authUrl, state: provider, callbackUrl });
      return true;
    }

    if (provider === "openai-codex") {
      cleanupExpiredCodexPkceEntries();
      const state = `openai-codex:${randomBytes(16).toString("hex")}`;
      const { verifier, challenge } = createPkcePair();
      const redirectUri =
        String(process.env.TALON_OPENAI_CODEX_REDIRECT_URI || "").trim() ||
        (callbackUrl.includes(":1455/") ? callbackUrl : "http://localhost:1455/auth/callback");
      openAiCodexPkceStore.set(state, { verifier, redirectUri, createdAt: Date.now() });

      const params = new URLSearchParams({
        response_type: "code",
        client_id: OPENAI_CODEX_CLIENT_ID,
        redirect_uri: redirectUri,
        scope: OPENAI_CODEX_SCOPE,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
        id_token_add_organizations: "true",
        codex_cli_simplified_flow: "true",
        originator: "pi",
      });
      const authUrl = `${OPENAI_CODEX_AUTHORIZE_URL}?${params.toString()}`;
      sendJson(res, 200, { provider, authUrl, state, callbackUrl: redirectUri });
      return true;
    }

    const authUrl = `https://auth.local/${provider}?redirect_uri=${encodeURIComponent(
      callbackUrl,
    )}&state=${encodeURIComponent(provider)}`;
    sendJson(res, 200, { provider, authUrl, state: provider, callbackUrl });
    return true;
  }

  if (url.pathname === "/v1/auth/exchange") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return true;
    }

    const body = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? 1024 * 1024);
    if (body === undefined) return true;

    const provider = normalizeProvider((body as { provider?: string }).provider);
    const code = String((body as { code?: string }).code || "").trim();
    const state = String((body as { state?: string }).state || "").trim();
    const apiKey = String((body as { apiKey?: string }).apiKey || "").trim();
    const baseUrl = String((body as { baseUrl?: string }).baseUrl || "").trim();

    if (!provider) {
      sendJson(res, 400, { error: "Unsupported provider" });
      return true;
    }

    if (provider === "openai-codex" && code) {
      cleanupExpiredCodexPkceEntries();
      if (!state) {
        sendJson(res, 400, { error: "Missing state for OpenAI Codex OAuth exchange" });
        return true;
      }
      const pending = openAiCodexPkceStore.get(state);
      if (!pending) {
        sendJson(res, 400, { error: "Invalid or expired OAuth state for OpenAI Codex" });
        return true;
      }
      openAiCodexPkceStore.delete(state);

      try {
        const tokenResp = await fetch(OPENAI_CODEX_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: OPENAI_CODEX_CLIENT_ID,
            code,
            code_verifier: pending.verifier,
            redirect_uri: pending.redirectUri,
          }),
        });
        if (!tokenResp.ok) {
          const errText = await tokenResp.text().catch(() => "");
          sendJson(res, 502, { error: "OpenAI token exchange failed", details: errText || `HTTP ${tokenResp.status}` });
          return true;
        }

        const tokenData = (await tokenResp.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
        };
        const access = String(tokenData.access_token || "").trim();
        const refresh = String(tokenData.refresh_token || "").trim();
        const expiresIn = Number(tokenData.expires_in || 0);
        if (!access || !refresh || !Number.isFinite(expiresIn) || expiresIn <= 0) {
          sendJson(res, 502, { error: "OpenAI token exchange returned invalid payload" });
          return true;
        }

        const jwtPayload = decodeJwtPayload(access);
        const accountId =
          String(jwtPayload?.[OPENAI_CODEX_JWT_CLAIM_PATH]?.chatgpt_account_id || "").trim() || undefined;

        upsertAuthProfile({
          agentDir,
          profileId: "openai-codex:default",
          credential: {
            type: "oauth",
            provider: "openai-codex",
            access,
            refresh,
            expires: Date.now() + expiresIn * 1000,
            ...(accountId ? { accountId } : {}),
          } as any,
        });
        syncAuthToAllAgents();
        sendJson(res, 200, { ok: true, provider, mode: "oauth", accountId });
        return true;
      } catch (err) {
        sendJson(res, 500, { error: `OpenAI Codex OAuth exchange error: ${String(err)}` });
        return true;
      }
    }

    if (!code && !apiKey && !baseUrl) {
      sendJson(res, 400, { error: "Missing code, apiKey or baseUrl" });
      return true;
    }

    if (apiKey || baseUrl) {
      // Simple API Key or Base URL flow
      upsertAuthProfile({
        agentDir,
        profileId: `${provider}-default`,
        credential: { 
          type: "api_key", 
          provider, 
          key: apiKey || "local", 
          metadata: baseUrl ? { baseUrl } : undefined 
        },
      });
      syncAuthToAllAgents();
      sendJson(res, 200, { ok: true, provider, mode: apiKey ? "api_key" : "baseUrl" });
      return true;
    }

    upsertAuthProfile({
      agentDir,
      profileId: `${provider}-oauth`,
      credential: {
        type: "oauth",
        provider,
        accessToken: `oauth-${provider}-${Date.now()}`,
        refreshToken: `refresh-${provider}-${Date.now()}`,
        expires: Date.now() + 3600_000,
      } as any,
    });
    syncAuthToAllAgents();

    sendJson(res, 200, { ok: true, provider, mode: "oauth" });
    return true;
  }

  if (url.pathname === "/v1/auth/remove") {
    if (req.method !== "POST") {
      sendMethodNotAllowed(res);
      return true;
    }

    const body = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? 1024 * 1024);
    if (body === undefined) return true;

    const provider = normalizeProvider((body as { provider?: string }).provider);
    if (!provider) {
      sendJson(res, 400, { error: "Unsupported provider" });
      return true;
    }

    const store = ensureAuthProfileStore(agentDir);
    const profileIds = listProfilesForProvider(store, provider);
    for (const id of profileIds) {
      delete store.profiles[id];
    }
    saveAuthProfileStore(store, agentDir);
    syncAuthToAllAgents();

    sendJson(res, 200, { ok: true, provider, removedProfiles: profileIds.length });
    return true;
  }

  if (url.pathname === "/v1/providers/models") {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res);
      return true;
    }

    const store = ensureAuthProfileStore(agentDir);
    const discovered = await Promise.all(
      SUPPORTED_PROVIDERS.map(async (provider) => {
        const connected = listProfilesForProvider(store, provider).length > 0;
        if (!connected) return [] as ProviderModel[];
        const live = await discoverProviderModels(provider, store);
        const ids = live.length > 0 ? live : PROVIDER_MODELS[provider];
        return ids.map((id) => ({ id, provider }));
      }),
    );
    const models = discovered.flat();

    sendJson(res, 200, { data: models });
    return true;
  }

  return false;
}

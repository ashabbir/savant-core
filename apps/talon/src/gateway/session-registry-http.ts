import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import { loadConfig } from "../config/config.js";
import { loadSessionStore, resolveStorePath, updateSessionStore, resolveSessionFilePath } from "../config/sessions.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import { getBearerToken, resolveAgentIdFromHeader } from "./http-utils.js";
import { sendUnauthorized, sendJson, sendMethodNotAllowed, readJsonBodyOrError } from "./http-common.js";

type SessionRegistryHttpOptions = {
    auth: ResolvedGatewayAuth;
    trustedProxies?: string[];
    maxBodyBytes?: number;
};

export async function handleSessionRegistryHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    opts: SessionRegistryHttpOptions,
): Promise<boolean> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);

    if (!url.pathname.startsWith("/v1/sessions")) {
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

    const agentId = resolveAgentIdFromHeader(req) || "jarvis"; // Default to jarvis or main
    const cfg = loadConfig();
    const storePath = resolveStorePath(undefined, { agentId });

    // GET /v1/sessions/transcript?sessionKey=...
    if (url.pathname === "/v1/sessions/transcript" && req.method === "GET") {
        const sessionKey = url.searchParams.get("sessionKey");
        if (!sessionKey) {
            sendJson(res, 400, { error: "sessionKey required" });
            return true;
        }

        try {
            const store = loadSessionStore(storePath);
            const entry = store[sessionKey];
            if (!entry) {
                sendJson(res, 404, { error: "Session not found" });
                return true;
            }

            const filePath = resolveSessionFilePath(entry.sessionId, entry, { agentId });
            if (!fs.existsSync(filePath)) {
                sendJson(res, 200, { messages: [] });
                return true;
            }

            const content = fs.readFileSync(filePath, "utf-8");
            const lines = content.split("\n").filter(l => l.trim());
            const messages = lines
                .map(line => {
                    try {
                        return JSON.parse(line);
                    } catch {
                        return null;
                    }
                })
                .filter(msg => msg && (msg.role === "user" || msg.role === "assistant"));

            const formatted = messages.map(msg => {
                let text = "";
                if (Array.isArray(msg.content)) {
                    text = msg.content.map((c: any) => c.text || "").join("");
                } else if (typeof msg.content === "string") {
                    text = msg.content;
                }
                return {
                    role: msg.role === "assistant" ? "jarvis" : msg.role,
                    content: text,
                    model: msg.model,
                    timestamp: msg.timestamp
                };
            });

            sendJson(res, 200, { messages: formatted });
        } catch (err) {
            sendJson(res, 500, { error: String(err) });
        }
        return true;
    }

    if (url.pathname === "/v1/sessions" && req.method === "GET") {
        try {
            const store = loadSessionStore(storePath);
            const sessions = Object.entries(store).map(([key, entry]) => ({
                key,
                sessionId: entry.sessionId,
                label: entry.label || entry.subject || entry.sessionId.slice(0, 8),
                updatedAt: entry.updatedAt,
                model: entry.model,
                chatType: entry.chatType,
            })).sort((a, b) => b.updatedAt - a.updatedAt);

            sendJson(res, 200, { sessions });
        } catch (err) {
            sendJson(res, 500, { error: String(err) });
        }
        return true;
    }

    if (url.pathname === "/v1/sessions" && req.method === "DELETE") {
        const sessionKey = url.searchParams.get("sessionKey")?.trim();
        if (!sessionKey) {
            sendJson(res, 400, { error: "sessionKey required" });
            return true;
        }

        try {
            let removed = false;
            let deletedFile = false;
            await updateSessionStore(storePath, (store: Record<string, any>) => {
                const entry = store[sessionKey];
                if (!entry) return;
                removed = true;
                const filePath = resolveSessionFilePath(entry.sessionId, entry, { agentId });
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    deletedFile = true;
                }
                delete store[sessionKey];
            });

            sendJson(res, 200, { ok: true, removed, deletedFile });
        } catch (err) {
            sendJson(res, 500, { error: String(err) });
        }
        return true;
    }

    if (url.pathname === "/v1/sessions" && (req.method === "POST" || req.method === "PATCH")) {
        const body = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? 1024 * 1024);
        if (body === undefined) return true;

        const { sessionKey, label } = body as { sessionKey?: string; label?: string };
        if (!sessionKey || !label) {
            sendJson(res, 400, { error: "sessionKey and label required" });
            return true;
        }

        try {
            await updateSessionStore(storePath, (store: Record<string, any>) => {
                const existing = store[sessionKey] || {};
                store[sessionKey] = {
                    ...existing,
                    sessionId: existing.sessionId || sessionKey,
                    label: label.trim(),
                    updatedAt: Date.now(),
                };
            });
            sendJson(res, 200, { ok: true });
        } catch (err) {
            sendJson(res, 500, { error: String(err) });
        }
        return true;
    }

    sendMethodNotAllowed(res, "GET, POST, PATCH, DELETE");
    return true;
}

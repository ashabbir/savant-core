import fs from "node:fs";
import path from "node:path";
import { agentRegistry, AgentConfigSchema } from "../agents/registry.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import {
    readJsonBodyOrError,
    sendJson,
    sendMethodNotAllowed,
    sendUnauthorized,
} from "./http-common.js";
import { getBearerToken } from "./http-utils.js";
import { resolveStateDir } from "../config/paths.js";
import { AUTH_PROFILE_FILENAME } from "../agents/auth-profiles/constants.js";

type AgentRegistryHttpOptions = {
    auth: ResolvedGatewayAuth;
    maxBodyBytes?: number;
    trustedProxies?: string[];
};

function copyGlobalAuthToAgent(agentId: string) {
    try {
        const root = resolveStateDir();
        const mainAuthPath = path.join(root, "agents", "main", "agent", AUTH_PROFILE_FILENAME);
        const agentAuthDir = path.join(root, "agents", agentId, "agent");
        const agentAuthPath = path.join(agentAuthDir, AUTH_PROFILE_FILENAME);

        if (fs.existsSync(mainAuthPath)) {
            if (!fs.existsSync(agentAuthDir)) {
                fs.mkdirSync(agentAuthDir, { recursive: true });
            }
            fs.copyFileSync(mainAuthPath, agentAuthPath);
            console.log(`[registry] Copied global auth to agent: ${agentId}`);
        }
    } catch (err) {
        console.error(`[registry] Failed to copy global auth to agent ${agentId}:`, err);
    }
}

export async function handleAgentRegistryHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    opts: AgentRegistryHttpOptions,
): Promise<boolean> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
    if (!url.pathname.startsWith("/v1/agents")) {
        return false;
    }

    // Auth check
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

    const pathParts = url.pathname.split("/").filter(Boolean); // ["v1", "agents", "optional_id"]
    const agentId = pathParts[2];

    if (req.method === "GET") {
        if (agentId) {
            const agent = agentRegistry.get(agentId);
            if (agent) {
                sendJson(res, 200, agent);
            } else {
                sendJson(res, 404, { error: "Agent not found" });
            }
        } else {
            const agents = agentRegistry.list();
            sendJson(res, 200, { data: agents });
        }
        return true;
    }

    if (req.method === "POST" || req.method === "PUT") {
        const body = await readJsonBodyOrError(req, res, opts.maxBodyBytes ?? 1024 * 1024);
        if (body === undefined) {
            return true; // Error already sent
        }

        // Validation
        const result = AgentConfigSchema.safeParse(body);
        if (!result.success) {
            sendJson(res, 400, { error: result.error });
            return true;
        }

        const agentConfig = result.data;
        if (agentId && agentConfig.id !== agentId) {
            sendJson(res, 400, { error: "ID mismatch between URL and body" });
            return true;
        }

        if (req.method === "POST") {
            agentRegistry.create(agentConfig);
            copyGlobalAuthToAgent(agentConfig.id);
            sendJson(res, 201, agentConfig);
        } else { // PUT
            const updated = agentRegistry.update(agentConfig.id, agentConfig);
            copyGlobalAuthToAgent(agentConfig.id);
            if (updated) {
                sendJson(res, 200, updated);
            } else {
                // Upsert
                agentRegistry.create(agentConfig);
                sendJson(res, 201, agentConfig);
            }
        }
        return true;
    }

    if (req.method === "DELETE") {
        if (agentId) {
            const deleted = agentRegistry.delete(agentId);
            if (deleted) {
                sendJson(res, 200, { ok: true });
            } else {
                sendJson(res, 404, { error: "Agent not found" });
            }
        } else {
            sendJson(res, 400, { error: "Missing agent ID" });
        }
        return true;
    }

    sendMethodNotAllowed(res);
    return true;
}

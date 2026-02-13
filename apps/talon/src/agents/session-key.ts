export const DEFAULT_AGENT_ID = process.env.TALON_DEFAULT_AGENT_ID || "default";
export const DEFAULT_ACCOUNT_ID = "default";
export const DEFAULT_MAIN_KEY = "default";

export function normalizeAgentId(id: string | null | undefined): string {
    const trimmed = id?.trim()?.toLowerCase();
    return trimmed || DEFAULT_AGENT_ID;
}

export function sanitizeAgentId(id: string): string {
    return id.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function normalizeAccountId(id: any): string {
    return String(id).toLowerCase();
}

export function parseAgentSessionKey(sessionKey?: string): any {
    if (!sessionKey) {
        return { agentId: DEFAULT_AGENT_ID };
    }
    const parts = sessionKey.split(":");
    if (parts.length >= 2) {
        return {
            agentId: normalizeAgentId(parts[0]),
            accountId: parts[1],
        };
    }
    return {
        agentId: normalizeAgentId(sessionKey),
    };
}

export function normalizeMainKey(mainKey?: string): string {
    const trimmed = mainKey?.trim()?.toLowerCase();
    return trimmed && trimmed !== "" ? trimmed : "main";
}

export function buildAgentMainSessionKey(params: { agentId: string; mainKey?: string }): string {
    const agentId = normalizeAgentId(params.agentId);
    const mainKey = normalizeMainKey(params.mainKey);
    return `${agentId}:${mainKey}`;
}

export function resolveAgentIdFromSessionKey(sessionKey: string | null | undefined): string {
    if (!sessionKey) {
        return DEFAULT_AGENT_ID;
    }
    return parseAgentSessionKey(sessionKey).agentId;
}

export function isSubagentSessionKey(sessionKey: string | null | undefined): boolean {
    if (!sessionKey) {
        return false;
    }
    return sessionKey.includes(":subagent:");
}

export function isAcpSessionKey(sessionKey: string): boolean {
    return sessionKey.startsWith("acp:");
}

export function classifySessionKeyShape(sessionKey: string): any {
    return {};
}

export function toAgentStoreSessionKey(sessionKey: any): string {
    return sessionKey.sessionKey || sessionKey;
}

export function toAgentRequestSessionKey(sessionKey: string): string {
    return sessionKey;
}

export function resolveThreadSessionKeys(params: {
    baseSessionKey: string;
    threadId?: string | number | null;
    useSuffix?: boolean;
}): { sessionKey: string; baseSessionKey: string } {
    const { baseSessionKey, threadId, useSuffix = true } = params;
    if (threadId == null || (typeof threadId === "string" && !threadId.trim())) {
        return { sessionKey: baseSessionKey, baseSessionKey };
    }
    const suffix = useSuffix ? `:thread:${threadId}` : "";
    return {
        sessionKey: `${baseSessionKey}${suffix}`,
        baseSessionKey,
    };
}

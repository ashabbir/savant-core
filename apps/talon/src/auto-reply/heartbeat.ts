export type HeartbeatOutcome = "sent" | "skipped" | "error";

export const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 100;
export const DEFAULT_HEARTBEAT_EVERY = "15m";

export function formatHeartbeatLog(_params: any): string {
    return "";
}

export function buildHeartbeatMessage(_params: any): string {
    return "";
}

export function resolveHeartbeatPrompt(prompt?: string): string {
    return prompt || "Pulse check.";
}

export function stripHeartbeatToken(text: any, _opts: any): { text: string; shouldSkip: boolean } {
    return { text: String(text || ""), shouldSkip: false };
}

export function isHeartbeatContentEffectivelyEmpty(_content: string): boolean {
    return false;
}

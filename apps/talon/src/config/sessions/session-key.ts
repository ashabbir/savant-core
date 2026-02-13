import {
  buildAgentMainSessionKey,
  DEFAULT_AGENT_ID,
  normalizeMainKey,
} from "../../agents/session-key.js";

export function deriveSessionKey(_scope: any, ctx: any) {
  const from = ctx.From?.trim() || "unknown";
  return from;
}

export function resolveSessionKey(scope: any, ctx: any, mainKey?: string) {
  const explicit = ctx.SessionKey?.trim();
  if (explicit) {
    return explicit.toLowerCase();
  }
  if (scope === "global") {
    return "global";
  }
  const canonicalMainKey = normalizeMainKey(mainKey);
  const canonical = buildAgentMainSessionKey({
    agentId: DEFAULT_AGENT_ID,
    mainKey: canonicalMainKey,
  });
  return canonical;
}

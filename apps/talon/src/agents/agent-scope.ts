import os from "node:os";
import path from "node:path";
import type { TalonConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import {
  DEFAULT_AGENT_ID,
  normalizeAgentId,
  parseAgentSessionKey,
} from "./session-key.js";
import { resolveUserPath } from "../utils.js";
import { DEFAULT_AGENT_WORKSPACE_DIR } from "./workspace.js";
import { agentRegistry } from "./registry.js";

export { resolveAgentIdFromSessionKey } from "./session-key.js";

type AgentEntry = NonNullable<NonNullable<TalonConfig["agents"]>["list"]>[number];

type ResolvedAgentConfig = {
  name?: string;
  workspace?: string;
  agentDir?: string;
  model?: AgentEntry["model"];
  skills?: AgentEntry["skills"];
  memorySearch?: AgentEntry["memorySearch"];
  humanDelay?: AgentEntry["humanDelay"];
  heartbeat?: AgentEntry["heartbeat"];
  identity?: AgentEntry["identity"];
  groupChat?: AgentEntry["groupChat"];
  subagents?: AgentEntry["subagents"];
  sandbox?: AgentEntry["sandbox"];
  tools?: AgentEntry["tools"];
};

let defaultAgentWarned = false;

function listAgents(cfg: TalonConfig): AgentEntry[] {
  const list = cfg.agents?.list;
  const base = Array.isArray(list) ? list.filter((entry): entry is AgentEntry => Boolean(entry && typeof entry === "object")) : [];

  // Merge from agentRegistry
  const registered = agentRegistry.list().map(a => ({
    id: a.id,
    name: a.name,
    model: a.model as any,
    tools: a.tools as any,
    skills: a.skills as any,
    systemPrompt: a.systemPrompt as any,
    // We could map more fields here if needed
  }));

  const seen = new Set(base.map(a => normalizeAgentId(a.id)));
  for (const a of registered) {
    if (!seen.has(normalizeAgentId(a.id))) {
      base.push(a as any);
      seen.add(normalizeAgentId(a.id));
    }
  }

  return base;
}

export function listAgentIds(cfg: TalonConfig): string[] {
  const agents = listAgents(cfg);
  if (agents.length === 0) {
    return [DEFAULT_AGENT_ID];
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const entry of agents) {
    const id = normalizeAgentId(entry?.id);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids.length > 0 ? ids : [DEFAULT_AGENT_ID];
}

export function resolveDefaultAgentId(cfg: TalonConfig): string {
  if (process.env.TALON_DEFAULT_AGENT_ID) {
    return normalizeAgentId(process.env.TALON_DEFAULT_AGENT_ID);
  }
  const agents = listAgents(cfg);
  if (agents.length === 0) {
    return DEFAULT_AGENT_ID;
  }
  const defaults = agents.filter((agent) => agent?.default);
  if (defaults.length > 1 && !defaultAgentWarned) {
    defaultAgentWarned = true;
    console.warn("Multiple agents marked default=true; using the first entry as default.");
  }
  const chosen = (defaults[0] ?? agents[0])?.id?.trim();
  return normalizeAgentId(chosen || DEFAULT_AGENT_ID);
}

export function resolveSessionAgentIds(params: { sessionKey?: string; config?: TalonConfig }): {
  defaultAgentId: string;
  sessionAgentId: string;
} {
  const defaultAgentId = resolveDefaultAgentId(params.config ?? {});
  const sessionKey = params.sessionKey?.trim();
  const normalizedSessionKey = sessionKey ? sessionKey.toLowerCase() : undefined;
  const parsed = normalizedSessionKey ? parseAgentSessionKey(normalizedSessionKey) : null;
  const sessionAgentId = parsed?.agentId ? normalizeAgentId(parsed.agentId) : defaultAgentId;
  return { defaultAgentId, sessionAgentId };
}

export function resolveSessionAgentId(params: {
  sessionKey?: string;
  config?: TalonConfig;
}): string {
  return resolveSessionAgentIds(params).sessionAgentId;
}

function resolveAgentEntry(cfg: TalonConfig, agentId: string): AgentEntry | undefined {
  const id = normalizeAgentId(agentId);
  const fromConfig = listAgents(cfg).find((entry) => normalizeAgentId(entry.id) === id);
  if (fromConfig) return fromConfig;

  // Fallback to registry directly for safety
  const fromRegistry = agentRegistry.get(id);
  if (fromRegistry) {
    return {
      id: fromRegistry.id,
      name: fromRegistry.name,
      model: fromRegistry.model as any
    } as any;
  }
  return undefined;
}

export function resolveAgentConfig(
  cfg: TalonConfig,
  agentId: string,
): ResolvedAgentConfig | undefined {
  const id = normalizeAgentId(agentId);
  const entry = resolveAgentEntry(cfg, id);
  if (!entry) {
    return undefined;
  }

  // Check if it's from our registry
  const fromRegistry = agentRegistry.get(id);

  return {
    name: typeof entry.name === "string" ? entry.name : undefined,
    workspace: typeof entry.workspace === "string" ? entry.workspace : undefined,
    agentDir: typeof entry.agentDir === "string" ? entry.agentDir : undefined,
    model:
      typeof entry.model === "string" || (entry.model && typeof entry.model === "object")
        ? entry.model
        : undefined,
    skills: Array.isArray(entry.skills) ? entry.skills : undefined,
    memorySearch: entry.memorySearch,
    humanDelay: entry.humanDelay,
    heartbeat: entry.heartbeat,
    identity: entry.identity,
    groupChat: entry.groupChat,
    subagents: typeof entry.subagents === "object" && entry.subagents ? entry.subagents : undefined,
    sandbox: entry.sandbox,
    tools: entry.tools,
  };
}

export function resolveAgentSkillsFilter(
  cfg: TalonConfig,
  agentId: string,
): string[] | undefined {
  const raw = resolveAgentConfig(cfg, agentId)?.skills;
  if (!raw) {
    return undefined;
  }
  const normalized = raw.map((entry) => String(entry).trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : [];
}

export function resolveAgentModelPrimary(cfg: TalonConfig, agentId: string): string | undefined {
  const raw = resolveAgentConfig(cfg, agentId)?.model;
  if (!raw) {
    return undefined;
  }
  if (typeof raw === "string") {
    return raw.trim() || undefined;
  }
  const primary = raw.primary?.trim();
  return primary || undefined;
}

export function resolveAgentModelFallbacksOverride(
  cfg: TalonConfig,
  agentId: string,
): string[] | undefined {
  const raw = resolveAgentConfig(cfg, agentId)?.model;
  if (!raw || typeof raw === "string") {
    return undefined;
  }
  // Important: treat an explicitly provided empty array as an override to disable global fallbacks.
  if (!Object.hasOwn(raw, "fallbacks")) {
    return undefined;
  }
  return Array.isArray(raw.fallbacks) ? raw.fallbacks : undefined;
}

export function resolveAgentWorkspaceDir(cfg: TalonConfig, agentId: string) {
  const id = normalizeAgentId(agentId);
  const configured = resolveAgentConfig(cfg, id)?.workspace?.trim();
  if (configured) {
    return resolveUserPath(configured);
  }
  const defaultAgentId = resolveDefaultAgentId(cfg);
  if (id === defaultAgentId) {
    const fallback = cfg.agents?.defaults?.workspace?.trim();
    if (fallback) {
      return resolveUserPath(fallback);
    }
    return DEFAULT_AGENT_WORKSPACE_DIR;
  }
  return path.join(os.homedir(), ".talon", `workspace-${id}`);
}

export function resolveAgentDir(cfg: TalonConfig, agentId: string) {
  const id = normalizeAgentId(agentId);
  const configured = resolveAgentConfig(cfg, id)?.agentDir?.trim();
  if (configured) {
    return resolveUserPath(configured);
  }
  const root = resolveStateDir(process.env, os.homedir);
  return path.join(root, "agents", id, "agent");
}

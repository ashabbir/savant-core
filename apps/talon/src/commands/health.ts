import type { TalonConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { withProgress } from "../cli/progress.js";
import { loadConfig } from "../config/config.js";
import { loadSessionStore, resolveStorePath } from "../config/sessions.js";
import { buildGatewayConnectionDetails, callGateway } from "../gateway/call.js";
import { info } from "../globals.js";
import { isTruthyEnvValue } from "../infra/env.js";
import {
  type HeartbeatSummary,
  resolveHeartbeatSummaryForAgent,
} from "../infra/heartbeat-runner.js";
import { normalizeAgentId } from "../agents/session-key.js";
import { theme } from "../terminal/theme.js";

export type ChannelAccountHealthSummary = {
  accountId: string;
  configured?: boolean;
  linked?: boolean;
  authAgeMs?: number | null;
  probe?: unknown;
  lastProbeAt?: number | null;
  [key: string]: unknown;
};

export type ChannelHealthSummary = ChannelAccountHealthSummary & {
  accounts?: Record<string, ChannelAccountHealthSummary>;
};

export type AgentHeartbeatSummary = HeartbeatSummary;

export type AgentHealthSummary = {
  agentId: string;
  name?: string;
  isDefault: boolean;
  heartbeat: AgentHeartbeatSummary;
  sessions: HealthSummary["sessions"];
};

export type HealthSummary = {
  ok: true;
  ts: number;
  durationMs: number;
  channels: Record<string, ChannelHealthSummary>;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  heartbeatSeconds: number;
  defaultAgentId: string;
  agents: AgentHealthSummary[];
  sessions: {
    path: string;
    count: number;
    recent: Array<{
      key: string;
      updatedAt: number | null;
      age: number | null;
    }>;
  };
};

const DEFAULT_TIMEOUT_MS = 10_000;

const resolveHeartbeatSummary = (cfg: ReturnType<typeof loadConfig>, agentId: string) =>
  resolveHeartbeatSummaryForAgent(cfg, agentId);

const resolveAgentOrder = (cfg: ReturnType<typeof loadConfig>) => {
  const defaultAgentId = resolveDefaultAgentId(cfg);
  const entries = Array.isArray(cfg.agents?.list) ? cfg.agents.list : [];
  const seen = new Set<string>();
  const ordered: Array<{ id: string; name?: string }> = [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const id = normalizeAgentId(entry.id);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ordered.push({ id, name: typeof entry.id === "string" ? entry.id : undefined });
  }

  if (!seen.has(defaultAgentId)) {
    ordered.unshift({ id: defaultAgentId });
  }

  return { defaultAgentId, ordered };
};

const buildSessionSummary = (storePath: string) => {
  const store = loadSessionStore(storePath);
  const sessions = Object.entries(store)
    .filter(([key]) => key !== "global" && key !== "unknown")
    .map(([key, entry]) => ({ key, updatedAt: entry?.updatedAt ?? 0 }))
    .toSorted((a, b) => b.updatedAt - a.updatedAt);
  const recent = sessions.slice(0, 5).map((s) => ({
    key: s.key,
    updatedAt: s.updatedAt || null,
    age: s.updatedAt ? Date.now() - s.updatedAt : null,
  }));
  return {
    path: storePath,
    count: sessions.length,
    recent,
  } satisfies HealthSummary["sessions"];
};

export async function getHealthSnapshot(params?: {
  timeoutMs?: number;
  probe?: boolean;
}): Promise<HealthSummary> {
  const start = Date.now();
  const cfg = loadConfig();
  const { defaultAgentId, ordered } = resolveAgentOrder(cfg);

  const agents: AgentHealthSummary[] = ordered.map((entry) => {
    const storePath = resolveStorePath(cfg.session?.store, { agentId: entry.id });
    return {
      agentId: entry.id,
      name: entry.name,
      isDefault: entry.id === defaultAgentId,
      heartbeat: resolveHeartbeatSummary(cfg, entry.id),
      sessions: buildSessionSummary(storePath),
    };
  });

  const defaultAgent = agents.find((agent) => agent.isDefault) ?? agents[0];
  const heartbeatSeconds = defaultAgent?.heartbeat.everyMs
    ? Math.round(defaultAgent.heartbeat.everyMs / 1000)
    : 0;

  return {
    ok: true,
    ts: Date.now(),
    durationMs: Date.now() - start,
    channels: {
      webchat: { accountId: "default", configured: true, linked: true }
    },
    channelOrder: ["webchat"],
    channelLabels: { webchat: "WebChat" },
    heartbeatSeconds,
    defaultAgentId,
    agents,
    sessions: defaultAgent.sessions,
  };
}

export async function healthCommand(
  opts: { json?: boolean; timeoutMs?: number; verbose?: boolean; config?: TalonConfig },
  runtime: RuntimeEnv,
) {
  const cfg = opts.config ?? loadConfig();
  const summary = await withProgress(
    {
      label: "Checking gateway health…",
      indeterminate: true,
      enabled: opts.json !== true,
    },
    async () =>
      await callGateway<HealthSummary>({
        method: "health",
        params: opts.verbose ? { probe: true } : undefined,
        timeoutMs: opts.timeoutMs,
        config: cfg,
      }),
  );

  if (opts.json) {
    runtime.log(JSON.stringify(summary, null, 2));
  } else {
    runtime.log(info(`Gateway health: OK`));
    runtime.log(`  Default Agent: ${summary.defaultAgentId}`);
    runtime.log(`  Agents: ${summary.agents.map(a => a.agentId).join(", ")}`);
    runtime.log(`  Channels: ${Object.keys(summary.channels).join(", ")}`);
  }
}
export function formatHealthChannelLines(_summary: HealthSummary): string[] {
  return [];
}

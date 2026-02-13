import type { ChannelId } from "../../channels/plugins/types.js";
import type { TalonConfig } from "../../config/config.js";
import type { ResolvedMessagingTarget } from "./target-resolver.js";
import {
  buildAgentSessionKey,
  type RoutePeer,
  type RoutePeerKind,
} from "../../routing/resolve-route.js";
import { resolveThreadSessionKeys } from "../../agents/session-key.js";

export type OutboundSessionRoute = {
  sessionKey: string;
  baseSessionKey: string;
  peer: RoutePeer;
  chatType: "direct" | "group" | "channel";
  from: string;
  to: string;
  threadId?: string | number;
};

export type ResolveOutboundSessionRouteParams = {
  cfg: TalonConfig;
  channel: ChannelId;
  agentId: string;
  accountId?: string | null;
  target: string;
  resolvedTarget?: ResolvedMessagingTarget;
  replyToId?: string | null;
  threadId?: string | number | null;
};

function normalizeThreadId(value?: string | number | null): string | undefined {
  if (value == null) {
    return undefined;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    return String(Math.trunc(value));
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function buildBaseSessionKey(params: {
  cfg: TalonConfig;
  agentId: string;
  channel: ChannelId;
  accountId?: string | null;
  peer: RoutePeer;
}): string {
  return buildAgentSessionKey({
    agentId: params.agentId,
    channel: params.channel,
    accountId: params.accountId,
    peer: params.peer,
    dmScope: params.cfg.session?.dmScope ?? "main",
    identityLinks: params.cfg.session?.identityLinks,
  });
}

function resolveWebSession(
  params: ResolveOutboundSessionRouteParams,
): OutboundSessionRoute | null {
  const isGroup = params.resolvedTarget?.kind === "group" || params.target.includes("@g.us");
  const peer: RoutePeer = {
    kind: isGroup ? "group" : "dm",
    id: params.target,
  };
  const baseSessionKey = buildBaseSessionKey({
    cfg: params.cfg,
    agentId: params.agentId,
    channel: "web",
    accountId: params.accountId,
    peer,
  });
  return {
    sessionKey: baseSessionKey,
    baseSessionKey,
    peer,
    chatType: isGroup ? "group" : "direct",
    from: params.target,
    to: params.target,
  };
}

export async function resolveOutboundSessionRoute(
  params: ResolveOutboundSessionRouteParams,
): Promise<OutboundSessionRoute | null> {
  const channel = params.channel;
  if (channel === "web") {
    return resolveWebSession(params);
  }

  // Generic fallback for other channels if they ever come back as plugins
  const peerKind: RoutePeerKind = params.resolvedTarget?.kind === "user" ? "dm" : "group";
  const peer: RoutePeer = {
    kind: peerKind,
    id: params.target,
  };
  const baseSessionKey = buildBaseSessionKey({
    cfg: params.cfg,
    agentId: params.agentId,
    channel,
    accountId: params.accountId,
    peer,
  });
  const threadId = normalizeThreadId(params.threadId ?? params.replyToId);
  const threadKeys = resolveThreadSessionKeys({
    baseSessionKey,
    threadId,
  });

  return {
    sessionKey: threadKeys.sessionKey,
    baseSessionKey,
    peer,
    chatType: peerKind === "dm" ? "direct" : "group",
    from: `${channel}:${params.target}`,
    to: params.target,
    threadId,
  };
}

export async function ensureOutboundSessionEntry(params: {
  cfg: TalonConfig;
  route: OutboundSessionRoute;
}) {
  // Placeholder for session persistence logic if needed
}

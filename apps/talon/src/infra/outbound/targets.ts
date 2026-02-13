import type { TalonConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { AgentDefaultsConfig } from "../../config/types.agent-defaults.js";
import {
  type DeliverableMessageChannel,
  type GatewayMessageChannel,
  INTERNAL_MESSAGE_CHANNEL,
} from "../../utils/message-channel.js";

export type ChannelOutboundTargetMode = "explicit" | "implicit" | "heartbeat" | "auto";

export type OutboundChannel = DeliverableMessageChannel | "none";

export type HeartbeatTarget = OutboundChannel | "last";

export type OutboundTarget = {
  channel: OutboundChannel;
  to?: string;
  reason?: string;
  accountId?: string;
  lastChannel?: DeliverableMessageChannel;
  lastAccountId?: string;
};

export type HeartbeatSenderContext = {
  sender: string;
  provider?: DeliverableMessageChannel;
  allowFrom: string[];
};

export type OutboundTargetResolution = { ok: true; to: string } | { ok: false; error: Error };

export type SessionDeliveryTarget = {
  channel?: DeliverableMessageChannel;
  to?: string;
  accountId?: string;
  threadId?: string | number;
  mode: ChannelOutboundTargetMode;
  lastChannel?: DeliverableMessageChannel;
  lastTo?: string;
  lastAccountId?: string;
  lastThreadId?: string | number;
};

export function resolveSessionDeliveryTarget(params: {
  entry?: SessionEntry;
  requestedChannel?: GatewayMessageChannel | "last";
  explicitTo?: string;
  explicitThreadId?: string | number;
  fallbackChannel?: DeliverableMessageChannel;
  mode?: ChannelOutboundTargetMode;
}): SessionDeliveryTarget {
  return {
    channel: "webchat",
    to: params.explicitTo,
    mode: "implicit",
    lastChannel: "webchat",
  };
}

export function resolveOutboundTarget(params: {
  channel: GatewayMessageChannel;
  to?: string;
  cfg?: TalonConfig;
  accountId?: string | null;
  mode?: ChannelOutboundTargetMode;
}): OutboundTargetResolution {
  return { ok: true, to: params.to ?? "webchat" };
}

export function resolveHeartbeatDeliveryTarget(_params: {
  cfg: TalonConfig;
  entry?: SessionEntry;
  heartbeat?: AgentDefaultsConfig["heartbeat"];
}): OutboundTarget {
  return {
    channel: "none",
    reason: "not-supported",
  };
}

export function resolveHeartbeatSenderContext(_params: {
  cfg: TalonConfig;
  entry?: SessionEntry;
  delivery: OutboundTarget;
}): HeartbeatSenderContext {
  return { sender: "heartbeat", allowFrom: [] };
}

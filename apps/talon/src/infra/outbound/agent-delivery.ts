import type { TalonConfig } from "../../config/config.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { OutboundTargetResolution, ChannelOutboundTargetMode } from "./targets.js";
import {
  INTERNAL_MESSAGE_CHANNEL,
  isDeliverableMessageChannel,
  type GatewayMessageChannel,
} from "../../utils/message-channel.js";
import {
  resolveOutboundTarget,
  resolveSessionDeliveryTarget,
  type SessionDeliveryTarget,
} from "./targets.js";

const DEFAULT_CHAT_CHANNEL = "webchat";

export type AgentDeliveryPlan = {
  baseDelivery: SessionDeliveryTarget;
  resolvedChannel: GatewayMessageChannel;
  resolvedTo?: string;
  resolvedAccountId?: string;
  resolvedThreadId?: string | number;
  deliveryTargetMode?: ChannelOutboundTargetMode;
};

export function resolveAgentDeliveryPlan(params: {
  sessionEntry?: SessionEntry;
  requestedChannel?: string;
  explicitTo?: string;
  explicitThreadId?: string | number;
  accountId?: string;
  wantsDelivery: boolean;
}): AgentDeliveryPlan {
  const baseDelivery = resolveSessionDeliveryTarget({
    entry: params.sessionEntry,
    explicitTo: params.explicitTo,
    explicitThreadId: params.explicitThreadId,
  });

  return {
    baseDelivery,
    resolvedChannel: params.wantsDelivery ? DEFAULT_CHAT_CHANNEL : INTERNAL_MESSAGE_CHANNEL,
    resolvedTo: params.explicitTo || "webchat",
    deliveryTargetMode: params.explicitTo ? "explicit" : "implicit",
  };
}

export function resolveAgentOutboundTarget(params: {
  cfg: TalonConfig;
  plan: AgentDeliveryPlan;
  targetMode?: ChannelOutboundTargetMode;
  validateExplicitTarget?: boolean;
}): {
  resolvedTarget: OutboundTargetResolution | null;
  resolvedTo?: string;
  targetMode: ChannelOutboundTargetMode;
} {
  const targetMode =
    params.targetMode ??
    params.plan.deliveryTargetMode ??
    (params.plan.resolvedTo ? "explicit" : "implicit");

  if (!isDeliverableMessageChannel(params.plan.resolvedChannel)) {
    return {
      resolvedTarget: null,
      resolvedTo: params.plan.resolvedTo,
      targetMode: targetMode as ChannelOutboundTargetMode,
    };
  }

  const resolvedTarget = resolveOutboundTarget({
    channel: params.plan.resolvedChannel,
    to: params.plan.resolvedTo,
    cfg: params.cfg,
    accountId: params.plan.resolvedAccountId,
    mode: targetMode as ChannelOutboundTargetMode,
  });

  return {
    resolvedTarget,
    resolvedTo: resolvedTarget.ok ? resolvedTarget.to : params.plan.resolvedTo,
    targetMode: targetMode as ChannelOutboundTargetMode,
  };
}

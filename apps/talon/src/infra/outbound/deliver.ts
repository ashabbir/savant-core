import type { ReplyPayload } from "../../auto-reply/types.js";
import type { TalonConfig } from "../../config/config.js";
import type { NormalizedOutboundPayload } from "./payloads.js";
import type { OutboundChannel } from "./targets.js";

export type { NormalizedOutboundPayload } from "./payloads.js";
export { normalizeOutboundPayloads } from "./payloads.js";

export type OutboundSendDeps = {
  [key: string]: any;
};

export type OutboundDeliveryResult = {
  channel: Exclude<OutboundChannel, "none">;
  messageId: string;
  chatId?: string;
  channelId?: string;
  roomId?: string;
  conversationId?: string;
  timestamp?: number;
  toJid?: string;
  pollId?: string;
  meta?: Record<string, unknown>;
};

export async function deliverOutboundPayloads(params: {
  cfg: TalonConfig;
  channel: Exclude<OutboundChannel, "none">;
  to: string;
  accountId?: string;
  payloads: ReplyPayload[];
  replyToId?: string | null;
  threadId?: string | number | null;
  deps?: OutboundSendDeps;
  gifPlayback?: boolean;
  abortSignal?: AbortSignal;
  bestEffort?: boolean;
  onError?: (err: unknown, payload: NormalizedOutboundPayload) => void;
  onPayload?: (payload: NormalizedOutboundPayload) => void;
  mirror?: {
    sessionKey: string;
    agentId?: string;
    text?: string;
    mediaUrls?: string[];
  };
}): Promise<OutboundDeliveryResult[]> {
  // Minimal stub for now
  return [];
}

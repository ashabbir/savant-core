export const INTERNAL_MESSAGE_CHANNEL = "internal";

export type GatewayMessageChannel = "webchat" | "internal" | "default";

export const GATEWAY_MESSAGE_CHANNELS: Set<GatewayMessageChannel> = new Set([
  "webchat",
  "internal",
  "default",
]);

export function isGatewayMessageChannel(channel: unknown): channel is GatewayMessageChannel {
  return typeof channel === "string" && GATEWAY_MESSAGE_CHANNELS.has(channel as GatewayMessageChannel);
}

export function isDeliverableMessageChannel(channel: unknown): boolean {
  return isGatewayMessageChannel(channel) && channel !== "internal";
}

export function isMarkdownCapableMessageChannel(channel: unknown): boolean {
  return channel === "webchat";
}

export function normalizeMessageChannel(channel: unknown): GatewayMessageChannel | undefined {
  if (typeof channel !== "string") {
    return undefined;
  }
  const normalized = channel.trim().toLowerCase();
  if (isGatewayMessageChannel(normalized)) {
    return normalized as GatewayMessageChannel;
  }
  return undefined;
}

export type DeliverableMessageChannel = Exclude<GatewayMessageChannel, "internal">;

export function isWebchatClient(raw: unknown): boolean {
  return raw === "webchat" || (typeof raw === "string" && raw.startsWith("webchat:"));
}

export function isGatewayCliClient(client: unknown): boolean {
  if (typeof client === "string") {
    return client === GATEWAY_CLIENT_NAMES.CLI;
  }
  if (client && typeof client === "object") {
    return (client as { id?: string }).id === GATEWAY_CLIENT_NAMES.CLI;
  }
  return false;
}

export function listDeliverableMessageChannels(): GatewayMessageChannel[] {
  return Array.from(GATEWAY_MESSAGE_CHANNELS).filter((c) => c !== INTERNAL_MESSAGE_CHANNEL);
}

export function resolveGatewayMessageChannel(val: unknown): GatewayMessageChannel {
  const norm = normalizeMessageChannel(val);
  return norm ?? "webchat";
}

export function resolveMessageChannel(
  val: unknown,
  fallback: GatewayMessageChannel = "webchat",
): GatewayMessageChannel {
  const norm = normalizeMessageChannel(val);
  return norm ?? fallback;
}

export function isInternalMessageChannel(channel: unknown): boolean {
  return channel === INTERNAL_MESSAGE_CHANNEL;
}

export const GATEWAY_CLIENT_NAMES = {
  WEBCHAT_UI: "webchat-ui",
  CONTROL_UI: "talon-control-ui",
  WEBCHAT: "webchat",
  CLI: "cli",
  GATEWAY_CLIENT: "gateway-client",
  MACOS_APP: "talon-macos",
  IOS_APP: "talon-ios",
  ANDROID_APP: "talon-android",
  NODE_HOST: "node-host",
  TEST: "test",
  FINGERPRINT: "fingerprint",
  PROBE: "talon-probe",
} as const;

export type GatewayClientName = (typeof GATEWAY_CLIENT_NAMES)[keyof typeof GATEWAY_CLIENT_NAMES];

export const GATEWAY_CLIENT_MODES = {
  WEBCHAT: "webchat",
  CLI: "cli",
  UI: "ui",
  BACKEND: "backend",
  NODE: "node",
  PROBE: "probe",
  TEST: "test",
} as const;

export type GatewayClientMode = (typeof GATEWAY_CLIENT_MODES)[keyof typeof GATEWAY_CLIENT_MODES];

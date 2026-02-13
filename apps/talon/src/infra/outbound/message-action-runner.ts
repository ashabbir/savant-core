import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ChannelId,
  ChannelMessageActionName,
  ChannelThreadingToolContext,
} from "../../channels/plugins/types.js";
import type { TalonConfig } from "../../config/config.js";
import type { OutboundSendDeps } from "./deliver.js";
import type { MessagePollResult, MessageSendResult } from "./message.js";
import { resolveSessionAgentId } from "../../agents/agent-scope.js";
import { assertMediaNotDataUrl, resolveSandboxedMediaSource } from "../../agents/sandbox-paths.js";
import {
  readNumberParam,
  readStringArrayParam,
  readStringParam,
} from "../../agents/tools/common.js";
import { parseReplyDirectives } from "../../auto-reply/reply/reply-directives.js";
import { dispatchChannelMessageAction } from "../../channels/plugins/message-actions.js";
import { extensionForMime } from "../../media/mime.js";
import {
  normalizeMessageChannel,
  type GatewayClientMode,
  type GatewayClientName,
} from "../../utils/message-channel.js";
import { loadWebMedia } from "../../web/media.js";
import {
  listConfiguredMessageChannels,
  resolveMessageChannelSelection,
} from "./channel-selection.js";
import {
  applyCrossContextDecoration,
  buildCrossContextDecoration,
  type CrossContextDecoration,
  shouldApplyCrossContextMarker,
} from "./outbound-policy.js";
import {
  executePollAction,
  executeSendAction,
  type OutboundSendContext,
} from "./outbound-send-service.js";
import { ensureOutboundSessionEntry, resolveOutboundSessionRoute } from "./outbound-session.js";
import { resolveChannelTarget, type ResolvedMessagingTarget } from "./target-resolver.js";

export type MessageActionRunnerGateway = {
  url?: string;
  token?: string;
  timeoutMs?: number;
  clientName: GatewayClientName;
  clientDisplayName?: string;
  mode: GatewayClientMode;
};

export type RunMessageActionParams = {
  cfg: TalonConfig;
  action: ChannelMessageActionName;
  params: Record<string, unknown>;
  defaultAccountId?: string;
  toolContext?: ChannelThreadingToolContext;
  gateway?: MessageActionRunnerGateway;
  deps?: OutboundSendDeps;
  sessionKey?: string;
  agentId?: string;
  sandboxRoot?: string;
  dryRun?: boolean;
  abortSignal?: AbortSignal;
};

export type MessageActionRunResult =
  | {
    kind: "send";
    channel: ChannelId;
    action: "send";
    to: string;
    handledBy: "plugin" | "core";
    payload: unknown;
    toolResult?: AgentToolResult<unknown>;
    sendResult?: MessageSendResult;
    dryRun: boolean;
  }
  | {
    kind: "broadcast";
    channel: ChannelId;
    action: "broadcast";
    handledBy: "core" | "dry-run";
    payload: {
      results: Array<{
        channel: ChannelId;
        to: string;
        ok: boolean;
        error?: string;
        result?: MessageSendResult;
      }>;
    };
    dryRun: boolean;
  }
  | {
    kind: "poll";
    channel: ChannelId;
    action: "poll";
    to: string;
    handledBy: "plugin" | "core";
    payload: unknown;
    toolResult?: AgentToolResult<unknown>;
    pollResult?: MessagePollResult;
    dryRun: boolean;
  }
  | {
    kind: "action";
    channel: ChannelId;
    action: Exclude<ChannelMessageActionName, "send" | "poll">;
    handledBy: "plugin" | "dry-run";
    payload: unknown;
    toolResult?: AgentToolResult<unknown>;
    dryRun: boolean;
  };

export function getToolResult(
  result: MessageActionRunResult,
): AgentToolResult<unknown> | undefined {
  return "toolResult" in result ? result.toolResult : undefined;
}

function extractToolPayload(result: AgentToolResult<unknown>): unknown {
  if (result.details !== undefined) {
    return result.details;
  }
  const textBlock = Array.isArray(result.content)
    ? result.content.find(
      (block) =>
        block &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    : undefined;
  const text = (textBlock as { text?: string } | undefined)?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return result.content ?? result;
}

function applyCrossContextMessageDecoration({
  params,
  message,
  decoration,
  preferEmbeds,
}: {
  params: Record<string, unknown>;
  message: string;
  decoration: CrossContextDecoration;
  preferEmbeds: boolean;
}): string {
  const applied = applyCrossContextDecoration({
    message,
    decoration,
    preferEmbeds,
  });
  params.message = applied.message;
  if (applied.embeds?.length) {
    params.embeds = applied.embeds;
  }
  return applied.message;
}

async function maybeApplyCrossContextMarker(params: {
  cfg: TalonConfig;
  channel: ChannelId;
  action: ChannelMessageActionName;
  target: string;
  toolContext?: ChannelThreadingToolContext;
  accountId?: string | null;
  args: Record<string, unknown>;
  message: string;
  preferEmbeds: boolean;
}): Promise<string> {
  if (!shouldApplyCrossContextMarker(params.action) || !params.toolContext) {
    return params.message;
  }
  const decoration = await buildCrossContextDecoration({
    cfg: params.cfg,
    channel: params.channel,
    target: params.target,
    toolContext: params.toolContext,
    accountId: params.accountId ?? undefined,
  });
  if (!decoration) {
    return params.message;
  }
  return applyCrossContextMessageDecoration({
    params: params.args,
    message: params.message,
    decoration,
    preferEmbeds: params.preferEmbeds,
  });
}

function readBooleanParam(params: Record<string, unknown>, key: string): boolean | undefined {
  const raw = params[key];
  if (typeof raw === "boolean") {
    return raw;
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === "true") {
      return true;
    }
    if (trimmed === "false") {
      return false;
    }
  }
  return undefined;
}

async function resolveChannel(cfg: TalonConfig, params: Record<string, unknown>) {
  const channelHint = readStringParam(params, "channel");
  const selection = await resolveMessageChannelSelection({
    cfg,
    channel: channelHint,
  });
  return selection.channel;
}

async function resolveActionTarget(params: {
  cfg: TalonConfig;
  channel: ChannelId;
  action: ChannelMessageActionName;
  args: Record<string, unknown>;
  accountId?: string | null;
}): Promise<ResolvedMessagingTarget | undefined> {
  let resolvedTarget: ResolvedMessagingTarget | undefined;
  const toRaw = typeof params.args.to === "string" ? params.args.to.trim() : "";
  if (toRaw) {
    const resolved = await resolveChannelTarget({
      cfg: params.cfg,
      channel: params.channel,
      input: toRaw,
      accountId: params.accountId ?? undefined,
    });
    if (resolved.ok) {
      params.args.to = resolved.target.to;
      resolvedTarget = resolved.target;
    } else {
      throw resolved.error;
    }
  }
  return resolvedTarget;
}

function resolveGateway(input: RunMessageActionParams): any {
  if (!input.gateway) {
    return undefined;
  }
  return {
    url: input.gateway.url,
    token: input.gateway.token,
    timeoutMs: input.gateway.timeoutMs,
    clientName: input.gateway.clientName,
    clientDisplayName: input.gateway.clientDisplayName,
    mode: input.gateway.mode,
  };
}

async function handleBroadcastAction(
  input: RunMessageActionParams,
  params: Record<string, unknown>,
): Promise<MessageActionRunResult> {
  throwIfAborted(input.abortSignal);
  const rawTargets = readStringArrayParam(params, "targets", { required: true }) ?? [];
  if (rawTargets.length === 0) {
    throw new Error("Broadcast requires at least one target in --targets.");
  }
  const channelHint = readStringParam(params, "channel");
  const configured = await listConfiguredMessageChannels(input.cfg);
  if (configured.length === 0) {
    throw new Error("Broadcast requires at least one configured channel.");
  }
  const targetChannels =
    channelHint && channelHint.trim().toLowerCase() !== "all"
      ? [await resolveChannel(input.cfg, { channel: channelHint })]
      : configured;
  const results: Array<{
    channel: ChannelId;
    to: string;
    ok: boolean;
    error?: string;
    result?: MessageSendResult;
  }> = [];
  const isAbortError = (err: unknown): boolean => err instanceof Error && err.name === "AbortError";
  for (const targetChannel of (targetChannels as ChannelId[])) {
    throwIfAborted(input.abortSignal);
    for (const target of rawTargets) {
      throwIfAborted(input.abortSignal);
      try {
        const resolved = await resolveChannelTarget({
          cfg: input.cfg,
          channel: targetChannel,
          input: target,
        });
        if (!resolved.ok) {
          throw resolved.error;
        }
        const sendResult = await runMessageAction({
          ...input,
          action: "send",
          params: {
            ...params,
            channel: targetChannel,
            target: resolved.target.to,
          },
        });
        results.push({
          channel: targetChannel,
          to: resolved.target.to,
          ok: true,
          result: sendResult.kind === "send" ? sendResult.sendResult : undefined,
        });
      } catch (err) {
        if (isAbortError(err)) {
          throw err;
        }
        results.push({
          channel: targetChannel,
          to: target,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return {
    kind: "broadcast",
    channel: (targetChannels[0] as ChannelId) ?? "web",
    action: "broadcast" as any,
    handledBy: input.dryRun ? "dry-run" : "core",
    payload: { results },
    dryRun: Boolean(input.dryRun),
  };
}

function throwIfAborted(abortSignal?: AbortSignal): void {
  if (abortSignal?.aborted) {
    const err = new Error("Message send aborted");
    err.name = "AbortError";
    throw err;
  }
}

async function handleSendAction(
  ctx: OutboundSendContext,
  input: RunMessageActionParams,
  agentId?: string,
  resolvedTarget?: ResolvedMessagingTarget,
): Promise<MessageActionRunResult> {
  const { cfg, params, channel, accountId, dryRun, gateway, abortSignal } = ctx;
  throwIfAborted(abortSignal);
  const action: ChannelMessageActionName = "send";
  const to = readStringParam(params, "to", { required: true });
  const mediaHint =
    readStringParam(params, "media", { trim: false }) ??
    readStringParam(params, "path", { trim: false }) ??
    readStringParam(params, "filePath", { trim: false });
  const hasCard = params.card != null && typeof params.card === "object";
  let message =
    readStringParam(params, "message", {
      required: !mediaHint && !hasCard,
      allowEmpty: true,
    }) ?? "";
  if (message.includes("\\n")) {
    message = message.replaceAll("\\n", "\n");
  }

  const parsed = parseReplyDirectives(message);
  const mergedMediaUrls: string[] = [];
  const seenMedia = new Set<string>();
  const pushMedia = (value?: string | null) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    if (seenMedia.has(trimmed)) {
      return;
    }
    seenMedia.add(trimmed);
    mergedMediaUrls.push(trimmed);
  };
  pushMedia(mediaHint);
  if (parsed.mediaUrls) {
    for (const url of parsed.mediaUrls) {
      pushMedia(url);
    }
  }
  pushMedia(parsed.mediaUrl);

  const normalizedMediaUrls = await normalizeSandboxMediaList({
    values: mergedMediaUrls,
    sandboxRoot: input.sandboxRoot,
  });
  mergedMediaUrls.length = 0;
  mergedMediaUrls.push(...normalizedMediaUrls);

  message = parsed.text;
  params.message = message;
  if (!params.replyTo && parsed.replyToId) {
    params.replyTo = parsed.replyToId;
  }
  if (!params.media) {
    params.media = mergedMediaUrls[0] || undefined;
  }

  const threadId = readStringParam(params, "threadId") || undefined;
  const replyToId = readStringParam(params, "replyTo") || undefined;

  const route = await resolveOutboundSessionRoute({
    cfg,
    channel,
    agentId: agentId || "default",
    accountId,
    target: to,
    resolvedTarget,
    replyToId,
    threadId,
  });

  if (route) {
    await ensureOutboundSessionEntry({ cfg, route });
  }

  message = await maybeApplyCrossContextMarker({
    cfg,
    channel,
    action,
    target: to,
    toolContext: input.toolContext,
    accountId,
    args: params,
    message,
    preferEmbeds: readBooleanParam(params, "preferEmbeds") ?? false,
  });

  const result = await executeSendAction({
    ctx,
    to,
    message,
    mediaUrl: mergedMediaUrls[0],
    mediaUrls: mergedMediaUrls,
  });

  return {
    kind: "send",
    channel,
    action: "send",
    to,
    handledBy: result.handledBy,
    payload: params,
    toolResult: ctx.params.action === "send" ? undefined : (result.toolResult as any),
    sendResult: result.sendResult,
    dryRun: Boolean(dryRun),
  };
}

async function handlePollAction(ctx: OutboundSendContext): Promise<MessageActionRunResult> {
  const { params, channel, dryRun, abortSignal } = ctx;
  throwIfAborted(abortSignal);
  const action: ChannelMessageActionName = "poll";
  const to = readStringParam(params, "to", { required: true });
  const question = readStringParam(params, "pollQuestion", { required: true });
  const options = readStringArrayParam(params, "pollOption", { required: true }) ?? [];

  const result = await executePollAction({
    ctx,
    to,
    question,
    options,
    maxSelections: readBooleanParam(params, "pollMulti") ? options.length : 1,
    durationHours: readNumberParam(params, "pollDurationHours"),
  });

  return {
    kind: "poll",
    channel,
    action: "poll",
    to,
    handledBy: result.handledBy,
    payload: params,
    toolResult: undefined,
    pollResult: result.pollResult,
    dryRun: Boolean(dryRun),
  };
}

export async function runMessageAction(
  input: RunMessageActionParams,
): Promise<MessageActionRunResult> {
  const { cfg, action, abortSignal } = input;
  throwIfAborted(abortSignal);
  const params = { ...input.params };

  if (action === "broadcast") {
    return handleBroadcastAction(input, params);
  }

  const channel = (await resolveChannel(cfg, params)) as ChannelId;
  const dryRun = Boolean(input.dryRun);
  const accountId = params.accountId ? String(params.accountId) : input.defaultAccountId;

  const resolvedTarget = await resolveActionTarget({
    cfg,
    channel,
    action,
    args: params,
    accountId,
  });

  const ctx: OutboundSendContext = {
    cfg,
    params,
    channel,
    accountId,
    dryRun,
    gateway: resolveGateway(input),
    toolContext: input.toolContext,
    deps: input.deps,
    abortSignal,
  };

  if (action === "send" || action === "reply" || action === "thread-reply") {
    return handleSendAction(ctx, input, input.agentId, resolvedTarget);
  }

  if (action === "poll") {
    return handlePollAction(ctx);
  }

  const toolResult = dryRun
    ? undefined
    : await dispatchChannelMessageAction({
      cfg,
      channel,
      accountId: accountId ?? undefined,
      action,
      params,
      gateway: ctx.gateway,
      abortSignal,
    });

  return {
    kind: "action",
    channel,
    action: action as any,
    handledBy: "plugin",
    payload: params,
    toolResult,
    dryRun,
  };
}

async function normalizeSandboxMediaList(params: {
  values: string[];
  sandboxRoot?: string;
}): Promise<string[]> {
  const sandboxRoot = params.sandboxRoot?.trim();
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of params.values) {
    const raw = value?.trim();
    if (!raw) {
      continue;
    }
    assertMediaNotDataUrl(raw);
    const resolved = sandboxRoot
      ? await resolveSandboxedMediaSource({ media: raw, sandboxRoot })
      : raw;
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);
    normalized.push(resolved);
  }
  return normalized;
}



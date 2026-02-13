import type { TalonConfig } from "../config/config.js";
import { defaultRuntime } from "../runtime.js";

export type ChannelMessageActionName = string;
export type ChannelAgentTool = any;

/**
 * Get the list of supported message actions for a specific channel.
 * Returns an empty array if channel is not found or has no actions configured.
 */
export function listChannelSupportedActions(params: {
  cfg?: TalonConfig;
  channel?: string;
}): ChannelMessageActionName[] {
  return [];
}

/**
 * Get the list of all supported message actions across all configured channels.
 */
export function listAllChannelSupportedActions(params: {
  cfg?: TalonConfig;
}): ChannelMessageActionName[] {
  return [];
}

export function listChannelAgentTools(params: { cfg?: TalonConfig }): ChannelAgentTool[] {
  return [];
}

export function resolveChannelMessageToolHints(params: {
  cfg?: TalonConfig;
  channel?: string | null;
  accountId?: string | null;
}): string[] {
  return [];
}

import { Type } from "@sinclair/typebox";
import type { TalonConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

type MessageToolOptions = {
  agentAccountId?: string;
  agentSessionKey?: string;
  config?: TalonConfig;
  currentChannelId?: string;
  currentChannelProvider?: string;
  currentThreadTs?: string;
  replyToMode?: "off" | "first" | "all";
  hasRepliedRef?: { value: boolean };
  sandboxRoot?: string;
  requireExplicitTarget?: boolean;
};

const MessageToolSchema = Type.Object({
  action: Type.String({ description: "Action to perform (e.g. send)." }),
  message: Type.Optional(Type.String({ description: "The message content." })),
  to: Type.Optional(Type.String({ description: "Target recipient." })),
}, { additionalProperties: true });

export function createMessageTool(options?: MessageToolOptions): AnyAgentTool {
  return {
    label: "Message",
    name: "message",
    description: "Send and manage messages.",
    parameters: MessageToolSchema,
    execute: async (_toolCallId, args, signal) => {
      if (signal?.aborted) {
        const err = new Error("Message send aborted");
        err.name = "AbortError";
        throw err;
      }
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });

      // Generic stub result
      return jsonResult({
        status: "success",
        action,
        message: "Message tool is currently in stub mode.",
      });
    },
  };
}

export type MessagingToolSend = {
  tool: string;
  provider: string;
  accountId?: string;
  to?: string;
};

const CORE_MESSAGING_TOOLS = new Set(["sessions_send", "message"]);

export function isMessagingTool(toolName: string): boolean {
  return CORE_MESSAGING_TOOLS.has(toolName);
}

export function isMessagingToolSendAction(
  toolName: string,
  args: Record<string, unknown>,
): boolean {
  const action = typeof args.action === "string" ? args.action.trim() : "";
  if (toolName === "sessions_send") {
    return true;
  }
  if (toolName === "message") {
    return action === "send" || action === "thread-reply";
  }
  return false;
}

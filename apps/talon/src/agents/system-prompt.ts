import type { ReasoningLevel, ThinkLevel } from "./types.js";
import type { MemoryCitationsMode } from "../config/types.memory.js";
import type { ResolvedTimeFormat } from "./date-time.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";
import { listDeliverableMessageChannels } from "../utils/message-channel.js";

const SILENT_REPLY_TOKEN = "[[silent]]";

/**
 * Controls which hardcoded sections are included in the system prompt.
 * - "full": All sections (default, for main agent)
 * - "minimal": Reduced sections (Tooling, Workspace, Runtime) - used for subagents
 * - "none": Just basic identity line, no sections
 */
export type PromptMode = "full" | "minimal" | "none";

function buildSkillsSection(params: {
  skillsPrompt?: string;
  isMinimal: boolean;
  readToolName: string;
}) {
  if (params.isMinimal) {
    return [];
  }
  const trimmed = params.skillsPrompt?.trim();
  if (!trimmed) {
    return [];
  }
  return [
    "## Skills (mandatory)",
    "Before replying: scan <available_skills> <description> entries.",
    `- If exactly one skill clearly applies: read its SKILL.md at <location> with \`${params.readToolName}\`, then follow it.`,
    "- If multiple could apply: choose the most specific one, then read/follow it.",
    "- If none clearly apply: do not read any SKILL.md.",
    "Constraints: never read more than one skill up front; only read after selecting.",
    trimmed,
    "",
  ];
}

function buildMemorySection(params: {
  isMinimal: boolean;
  availableTools: Set<string>;
  citationsMode?: MemoryCitationsMode;
}) {
  if (params.isMinimal) {
    return [];
  }
  if (!params.availableTools.has("memory_search") && !params.availableTools.has("memory_get")) {
    return [];
  }
  const lines = [
    "## Memory Recall",
    "Before answering anything about prior work, decisions, dates, people, preferences, or todos: run memory_search on MEMORY.md + memory/*.md; then use memory_get to pull only the needed lines. If low confidence after search, say you checked.",
    "Before proposing any file change for a task: run memory_search first. If results include architecture.md, ADRs, or memory_bank guidance, follow those constraints over default behavior.",
  ];
  if (params.citationsMode === "off") {
    lines.push(
      "Citations are disabled: do not mention file paths or line numbers in replies unless the user explicitly asks.",
    );
  } else {
    lines.push(
      "Citations: include Source: <path#line> when it helps the user verify memory snippets.",
    );
  }
  lines.push("");
  return lines;
}

function buildUserIdentitySection(ownerLine: string | undefined, isMinimal: boolean) {
  if (!ownerLine || isMinimal) {
    return [];
  }
  return ["## User Identity", ownerLine, ""];
}

function buildTimeSection(params: { userTimezone?: string }) {
  if (!params.userTimezone) {
    return [];
  }
  return ["## Current Date & Time", `Time zone: ${params.userTimezone}`, ""];
}

function buildMessagingSection(params: {
  isMinimal: boolean;
  availableTools: Set<string>;
  messageChannelOptions: string;
  messageToolHints?: string[];
}) {
  if (params.isMinimal) {
    return [];
  }
  return [
    "## Messaging",
    "- Reply in current session → automatically routes to the source channel",
    "- Cross-session messaging → use sessions_send(sessionKey, message)",
    "- Never use exec/curl for provider messaging; Talon handles all routing internally.",
    params.availableTools.has("message")
      ? [
        "",
        "### message tool",
        "- Use `message` for proactive sends + channel actions (polls, reactions, etc.).",
        "- For `action=send`, include `to` and `message`.",
        `- If multiple channels are configured, pass \`channel\` (${params.messageChannelOptions}).`,
        `- If you use \`message\` (\`action=send\`) to deliver your user-visible reply, respond with ONLY: ${SILENT_REPLY_TOKEN} (avoid duplicate replies).`,
        ...(params.messageToolHints ?? []),
      ]
        .filter(Boolean)
        .join("\n")
      : "",
    "",
  ];
}

function buildDocsSection(params: { docsPath?: string; isMinimal: boolean; readToolName: string }) {
  const docsPath = params.docsPath?.trim();
  if (!docsPath || params.isMinimal) {
    return [];
  }
  return [
    "## Documentation",
    `Talon docs: ${docsPath}`,
    "For Talon behavior, commands, config, or architecture: consult local docs first.",
    "When diagnosing issues, run `talon status` yourself when possible.",
    "",
  ];
}

export function buildAgentSystemPrompt(params: {
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  reasoningTagHint?: boolean;
  toolNames?: string[];
  toolSummaries?: Record<string, string>;
  modelAliasLines?: string[];
  userTimezone?: string;
  userTime?: string;
  userTimeFormat?: ResolvedTimeFormat;
  contextFiles?: EmbeddedContextFile[];
  skillsPrompt?: string;
  heartbeatPrompt?: string;
  docsPath?: string;
  workspaceNotes?: string[];
  ttsHint?: string;
  /** Controls which hardcoded sections to include. Defaults to "full". */
  promptMode?: PromptMode;
  runtimeInfo?: {
    agentId?: string;
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
    defaultModel?: string;
    channel?: string;
    capabilities?: string[];
    repoRoot?: string;
  };
  messageToolHints?: string[];
  sandboxInfo?: {
    enabled: boolean;
    workspaceDir?: string;
    workspaceAccess?: "none" | "ro" | "rw";
    agentWorkspaceMount?: string;
    browserBridgeUrl?: string;
    browserNoVncUrl?: string;
    hostBrowserAllowed?: boolean;
    elevated?: {
      allowed: boolean;
      defaultLevel: "on" | "off" | "ask" | "full";
    };
  };
  memoryCitationsMode?: MemoryCitationsMode;
}) {
  const coreToolSummaries: Record<string, string> = {
    read: "Read file contents",
    write: "Create or overwrite files",
    edit: "Make precise edits to files",
    apply_patch: "Apply multi-file patches",
    grep: "Search file contents for patterns",
    find: "Find files by glob pattern",
    ls: "List directory contents",
    exec: "Run shell commands",
    process: "Manage background exec sessions",
    web_search: "Search the web",
    web_fetch: "Fetch and extract readable content from a URL",
    browser: "Control web browser",
    canvas: "Present/eval/snapshot the Canvas",
    cron: "Manage cron jobs and reminders",
    message: "Send messages",
    gateway: "Manage Talon process",
    agents_list: "List agent ids",
    sessions_list: "List other sessions",
    sessions_history: "Fetch history",
    sessions_send: "Send message to session",
    session_status: "Show status",
  };

  const toolOrder = [
    "read",
    "write",
    "edit",
    "apply_patch",
    "grep",
    "find",
    "ls",
    "exec",
    "process",
    "web_search",
    "web_fetch",
    "browser",
    "canvas",
    "cron",
    "message",
    "gateway",
    "agents_list",
    "sessions_list",
    "sessions_history",
    "sessions_send",
    "session_status",
  ];

  const rawToolNames = (params.toolNames ?? []).map((tool) => tool.trim());
  const canonicalToolNames = rawToolNames.filter(Boolean);
  const canonicalByNormalized = new Map<string, string>();
  for (const name of canonicalToolNames) {
    const normalized = name.toLowerCase();
    if (!canonicalByNormalized.has(normalized)) {
      canonicalByNormalized.set(normalized, name);
    }
  }
  const resolveToolName = (normalized: string) =>
    canonicalByNormalized.get(normalized) ?? normalized;

  const normalizedTools = canonicalToolNames.map((tool) => tool.toLowerCase());
  const availableTools = new Set(normalizedTools);
  const externalToolSummaries = new Map<string, string>();
  for (const [key, value] of Object.entries(params.toolSummaries ?? {})) {
    const normalized = key.trim().toLowerCase();
    if (!normalized || !value?.trim()) {
      continue;
    }
    externalToolSummaries.set(normalized, value.trim());
  }
  const extraTools = Array.from(
    new Set(normalizedTools.filter((tool) => !toolOrder.includes(tool))),
  );
  const enabledTools = toolOrder.filter((tool) => availableTools.has(tool));
  const toolLines = enabledTools.map((tool) => {
    const summary = coreToolSummaries[tool] ?? externalToolSummaries.get(tool);
    const name = resolveToolName(tool);
    return summary ? `- ${name}: ${summary}` : `- ${name}`;
  });
  for (const tool of extraTools.toSorted()) {
    const summary = coreToolSummaries[tool] ?? externalToolSummaries.get(tool);
    const name = resolveToolName(tool);
    toolLines.push(summary ? `- ${name}: ${summary}` : `- ${name}`);
  }

  const readToolName = resolveToolName("read");
  const execToolName = resolveToolName("exec");
  const processToolName = resolveToolName("process");
  const extraSystemPrompt = params.extraSystemPrompt?.trim();
  const ownerNumbers = (params.ownerNumbers ?? []).map((value) => value.trim()).filter(Boolean);
  const ownerLine =
    ownerNumbers.length > 0
      ? `Owner numbers: ${ownerNumbers.join(", ")}. Treat messages from these numbers as the user.`
      : undefined;
  const reasoningHint = params.reasoningTagHint
    ? [
      "ALL internal reasoning MUST be inside <think>...</think>.",
      "Do not output any analysis outside <think>.",
      "Format every reply as <think>...</think> then <final>...</final>, with no other text.",
    ].join(" ")
    : undefined;
  const reasoningLevel = params.reasoningLevel ?? "off";
  const userTimezone = params.userTimezone?.trim();
  const skillsPrompt = params.skillsPrompt?.trim();
  const heartbeatPrompt = params.heartbeatPrompt?.trim();
  const heartbeatPromptLine = heartbeatPrompt
    ? `Heartbeat prompt: ${heartbeatPrompt}`
    : "Heartbeat prompt: (configured)";
  const runtimeInfo = params.runtimeInfo;
  const runtimeChannel = runtimeInfo?.channel?.trim().toLowerCase();
  const messageChannelOptions = listDeliverableMessageChannels().join("|");
  const promptMode = params.promptMode ?? "full";
  const isMinimal = promptMode === "minimal" || promptMode === "none";
  const skillsSection = buildSkillsSection({
    skillsPrompt,
    isMinimal,
    readToolName,
  });
  const memorySection = buildMemorySection({
    isMinimal,
    availableTools,
    citationsMode: params.memoryCitationsMode,
  });
  const docsSection = buildDocsSection({
    docsPath: params.docsPath,
    isMinimal,
    readToolName,
  });
  const workspaceNotes = (params.workspaceNotes ?? []).map((note) => note.trim()).filter(Boolean);

  if (promptMode === "none") {
    return "You are a personal assistant running inside Talon.";
  }

  const lines = [
    "You are a personal assistant running inside Talon.",
    "",
    "## Tooling",
    "Tool names are case-sensitive.",
    toolLines.length > 0 ? toolLines.join("\n") : "",
    "",
    "## Tool Call Style",
    "Keep narration brief and value-dense.",
    "",
    "## Talon CLI Quick Reference",
    "- talon status",
    "- talon gateway restart",
    "",
    ...skillsSection,
    ...memorySection,
    "",
    "## Workspace",
    `Your working directory is: ${params.workspaceDir}`,
    ...workspaceNotes,
    "",
    ...docsSection,
    params.sandboxInfo?.enabled ? "## Sandbox" : "",
    params.sandboxInfo?.enabled ? "You are running in a sandboxed runtime." : "",
    ...buildUserIdentitySection(ownerLine, isMinimal),
    ...buildTimeSection({
      userTimezone,
    }),
    "## Workspace Files (injected)",
    "",
    ...buildMessagingSection({
      isMinimal,
      availableTools,
      messageChannelOptions,
      messageToolHints: params.messageToolHints,
    }),
  ];

  if (extraSystemPrompt) {
    const contextHeader =
      promptMode === "minimal" ? "## Subagent Context" : "## Context";
    lines.push(contextHeader, extraSystemPrompt, "");
  }
  if (reasoningHint) {
    lines.push("## Reasoning Format", reasoningHint, "");
  }

  const contextFiles = params.contextFiles ?? [];
  if (contextFiles.length > 0) {
    lines.push("# Project Context", "");
    for (const file of contextFiles) {
      lines.push(`## ${file.path}`, "", file.content, "");
    }
  }

  if (!isMinimal) {
    lines.push(
      "## Silent Replies",
      `When you have nothing to say, respond with ONLY: ${SILENT_REPLY_TOKEN}`,
      "",
    );
  }

  if (!isMinimal) {
    lines.push(
      "## Heartbeats",
      heartbeatPromptLine,
      "If you receive a heartbeat poll, reply exactly: HEARTBEAT_OK",
      "",
    );
  }

  lines.push(
    "## Runtime",
    buildRuntimeLine(runtimeInfo, runtimeChannel, [], params.defaultThinkLevel),
    `Reasoning: ${reasoningLevel}.`,
  );

  return lines.filter(Boolean).join("\n");
}

export function buildRuntimeLine(
  runtimeInfo?: {
    agentId?: string;
    host?: string;
    os?: string;
    arch?: string;
    node?: string;
    model?: string;
    defaultModel?: string;
    repoRoot?: string;
  },
  runtimeChannel?: string,
  _runtimeCapabilities: string[] = [],
  defaultThinkLevel?: ThinkLevel,
): string {
  return `Runtime: ${[
    runtimeInfo?.agentId ? `agent=${runtimeInfo.agentId}` : "",
    runtimeInfo?.host ? `host=${runtimeInfo.host}` : "",
    runtimeInfo?.model ? `model=${runtimeInfo.model}` : "",
    runtimeChannel ? `channel=${runtimeChannel}` : "",
    `thinking=${defaultThinkLevel ?? "off"}`,
  ]
    .filter(Boolean)
    .join(" | ")}`;
}

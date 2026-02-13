import {
    cancel as clackCancel,
    isCancel,
    note,
    select,
    spinner as clackSpinner,
    text,
} from "@clack/prompts";
import crypto from "node:crypto";
import { listAgentIds } from "../../agents/agent-scope.js";
import { normalizeAgentId } from "../../agents/session-key.js";
import { loadConfig } from "../../config/config.js";
import { loadSessionStore, resolveStorePath } from "../../config/sessions.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { agentCliCommand, type AgentCliOpts } from "../agent-via-gateway.js";

function formatAge(ms: number | null | undefined) {
    if (ms === null || ms === undefined || ms < 0) return "unknown";
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 48) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
}

export async function chatCommand(opts: { agent?: string; local?: boolean }) {
    const cfg = loadConfig();
    let agentId = normalizeAgentId(opts.agent);

    const knownAgents = listAgentIds(cfg);
    if (!opts.agent && knownAgents.length > 1) {
        const selectedAgent = await select({
            message: "Select an agent to chat with:",
            options: knownAgents.map((id: string) => ({ value: id, label: id })),
        });
        if (isCancel(selectedAgent)) return;
        agentId = selectedAgent as string;
    } else if (!opts.agent && knownAgents.length === 1) {
        agentId = knownAgents[0];
    } else if (!opts.agent) {
        agentId = "jarvis"; // Fallback to jarvis
    }

    const storePath = resolveStorePath(undefined, { agentId });
    const store = loadSessionStore(storePath);

    const sessions = Object.entries(store)
        .toSorted((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0))
        .slice(0, 15);

    const sessionOptions = [
        { value: "new", label: "✨ Start a new session", hint: "Fresh context" },
        ...sessions.map(([key, entry]) => ({
            value: key,
            label: `Continue: ${entry.label || entry.subject || entry.sessionId.slice(0, 8)}`,
            hint: `${formatAge(Date.now() - entry.updatedAt)} (${entry.model || "default"})`,
        })),
    ];

    const choice = await select({
        message: `Session selector for ${theme.accent(agentId)}:`,
        options: sessionOptions,
    });

    if (isCancel(choice)) return;

    let sessionId: string | undefined;
    let sessionKey: string | undefined;

    if (choice === "new") {
        sessionId = crypto.randomUUID();
        note(`Starting a fresh session: ${theme.muted(sessionId)}`);
    } else {
        sessionKey = choice as string;
        sessionId = store[sessionKey].sessionId;
        note(`Resuming session: ${theme.accent(sessionKey)}`);
    }

    // Interactive Loop
    while (true) {
        const input = await text({
            message: `${theme.success("You")}:`,
            placeholder: "Ask something... (/new for new session, /exit to quit)",
            validate: (value) => {
                if (!value || !value.trim()) return "Please enter a message";
                return;
            },
        });

        if (isCancel(input)) break;
        const body = input.trim();
        if (body === "/exit" || body === "/quit") break;
        if (body === "/new") {
            sessionId = crypto.randomUUID();
            sessionKey = undefined;
            note("✨ Started a fresh session context.");
            continue;
        }

        const s = clackSpinner();
        s.start(`${theme.accent(agentId)} is thinking...`);

        try {
            const cliOpts: AgentCliOpts = {
                message: body,
                agent: agentId,
                sessionId,
                local: opts.local ?? true,
            };
            await agentCliCommand(cliOpts, defaultRuntime);
            s.stop("Turn completed.");
        } catch (err) {
            s.stop("Thinking failed.");
            defaultRuntime.error(err instanceof Error ? err.message : String(err));
        }
    }

    clackCancel(`Chat session with ${theme.accent(agentId)} ended.`);
}

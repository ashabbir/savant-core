export type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type ReasoningLevel = "off" | "on" | "stream";
export type VerboseLevel = "off" | "on" | "full";

export type SessionScope = "global" | "per-sender" | "per-chat";

export type SessionOrigin = {
    label?: string;
    provider?: string;
    surface?: string;
    chatType?: string;
    from?: string;
    to?: string;
    accountId?: string;
    threadId?: string;
};

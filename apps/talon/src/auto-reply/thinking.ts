export type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
export type VerboseLevel = "off" | "on" | "full";

export function normalizeThinkLevel(level: unknown): ThinkLevel | undefined {
    const s = String(level).toLowerCase();
    if (s === "off" || s === "minimal" || s === "low" || s === "medium" || s === "high" || s === "xhigh") {
        return s as ThinkLevel;
    }
    return undefined;
}

export function normalizeVerboseLevel(level: unknown): VerboseLevel | undefined {
    const s = String(level).toLowerCase();
    if (s === "off" || s === "on" || s === "full") {
        return s as VerboseLevel;
    }
    return undefined;
}

export function formatThinkingLevels(provider?: string, model?: string): string {
    return "off, minimal, low, medium, high, xhigh";
}

export function supportsXHighThinking(provider?: string, model?: string): boolean {
    return false;
}

export function formatXHighModelHint(provider?: string, model?: string): string {
    return "";
}

export function normalizeElevatedLevel(level: unknown): string {
    return "none";
}

export function normalizeReasoningLevel(level: unknown): string {
    return "none";
}

export function normalizeUsageDisplay(usage: unknown): string {
    return "";
}

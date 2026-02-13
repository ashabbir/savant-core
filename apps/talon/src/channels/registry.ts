export const CHANNEL_IDS: string[] = [];
export const DEFAULT_CHAT_CHANNEL = "webchat";
export const CHAT_CHANNEL_ORDER: string[] = ["webchat"];

export function normalizeAnyChannelId(id: string): string | undefined {
    if (!id) return undefined;
    return id.toLowerCase();
}

export function normalizeChannelId(id: string): string | undefined {
    if (!id) return undefined;
    return id.toLowerCase();
}

export function listChatChannels(): any[] {
    return [];
}

export function formatChannelPrimerLine(params: any): string {
    return "";
}

export function formatChannelSelectionLine(params: any, formatter?: any): string {
    return "";
}

export function getChatChannelMeta(id: string): any {
    return undefined;
}

export function normalizeChatChannelId(id: string): string | undefined {
    return id ? id.toLowerCase() : undefined;
}

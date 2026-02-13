export type NormalizedChatType = string;

export function normalizeChatType(type: string): NormalizedChatType {
    return type.toLowerCase();
}

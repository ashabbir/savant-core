export function dispatchChannelMessageAction(params: any): Promise<any> {
    return Promise.resolve({ success: false, error: "Not implemented" });
}

export function listChannelMessageActions(cfg: any): string[] {
    return [];
}

export function supportsChannelMessageButtons(cfg: any): boolean {
    return false;
}

export function supportsChannelMessageCards(cfg: any): boolean {
    return false;
}

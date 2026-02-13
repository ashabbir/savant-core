export function getChannelPlugin(id: string): any {
    return undefined;
}

export function listChannelPlugins(): any[] {
    return [];
}

export function normalizeChannelId(id: string): string | undefined {
    if (!id) return undefined;
    return id.toLowerCase();
}

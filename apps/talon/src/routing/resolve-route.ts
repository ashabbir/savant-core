export type RoutePeerKind = "dm" | "group" | "channel" | "unknown";

export type RoutePeer = {
    kind: RoutePeerKind;
    id: string;
};

export function buildAgentSessionKey(params: any): string {
    const { agentId, channel, accountId, peer } = params;
    const accountPart = accountId ? `:${accountId}` : "";
    return `agent:${agentId}:channel:${channel}${accountPart}:peer:${peer.id}`;
}

export function resolveAgentRoute() {
    return {};
}

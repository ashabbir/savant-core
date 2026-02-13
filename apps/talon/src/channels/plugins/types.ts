export type ChannelId = string;
export type ChannelMessageActionName = string;
export const CHANNEL_MESSAGE_ACTION_NAMES: string[] = [];
export type ChannelOutboundTargetMode = "explicit" | "implicit" | "heartbeat" | "auto";

export interface ChannelPlugin {
    id: string;
    meta: {
        label: string;
        [key: string]: any;
    };
    config: {
        listAccountIds: (cfg: any) => string[];
        resolveAccount: (cfg: any, id: string) => any;
        isEnabled?: (account: any, cfg: any) => boolean;
        isConfigured?: (account: any, cfg: any) => Promise<boolean> | boolean;
    };
    status?: {
        probeAccount?: (params: any) => Promise<any>;
        buildChannelSummary?: (params: any) => Promise<any> | any;
        logSelfId?: (params: any) => void;
    };
    heartbeat?: {
        checkReady?: (params: any) => Promise<{ ok: boolean; reason?: string }>;
    };
}

export interface ChannelAccountSnapshot {
    accountId: string;
    enabled: boolean;
    configured: boolean;
    probe?: any;
    lastProbeAt?: number;
}

export interface ChannelHeartbeatDeps {
    [key: string]: any;
}

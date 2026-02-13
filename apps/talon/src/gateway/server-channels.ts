export type ChannelRuntimeSnapshot = {
  channels: Record<string, any>;
  channelAccounts: Record<string, any>;
};

export type ChannelManager = {
  getRuntimeSnapshot: () => ChannelRuntimeSnapshot;
  startChannels: () => Promise<void>;
  startChannel: (channel: string, accountId?: string) => Promise<void>;
  stopChannel: (channel: string, accountId?: string) => Promise<void>;
  markChannelLoggedOut: (channelId: string, cleared: boolean, accountId?: string) => void;
};

export function createChannelManager(): ChannelManager {
  return {
    getRuntimeSnapshot: () => ({ channels: {}, channelAccounts: {} }),
    startChannels: async () => { },
    startChannel: async () => { },
    stopChannel: async () => { },
    markChannelLoggedOut: () => { },
  };
}

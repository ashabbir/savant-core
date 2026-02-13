export type DaemonService = {
    label: string;
    loadedText: string;
    notLoadedText: string;
    isLoaded: (opts: any) => Promise<boolean>;
    install: (opts: any) => Promise<void>;
    uninstall: (opts: any) => Promise<void>;
    restart: (opts: any) => Promise<void>;
    stop: (opts: any) => Promise<void>;
    readCommand: (opts: any) => Promise<any>;
    readRuntime: (opts: any) => Promise<any>;
};

export function resolveNodeService(): DaemonService {
    return {
        label: "talon-node",
        loadedText: "running",
        notLoadedText: "stopped",
        isLoaded: async () => false,
        install: async () => { },
        uninstall: async () => { },
        restart: async () => { },
        stop: async () => { },
        readCommand: async () => ({}),
        readRuntime: async () => ({ status: "stopped" }),
    };
}

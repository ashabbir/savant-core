export type GatewayServiceRuntime = {
    status: "running" | "stopped" | "failed" | "unknown";
    detail?: string;
    missingUnit?: boolean;
};

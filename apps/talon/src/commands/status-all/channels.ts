import type { TalonConfig } from "../../config/config.js";

export type ChannelRow = {
  id: string;
  label: string;
  enabled: boolean;
  state: "ok" | "setup" | "warn" | "off";
  detail: string;
};

export async function buildChannelsTable(
  _cfg: TalonConfig,
  _opts?: { showSecrets?: boolean },
): Promise<{
  rows: ChannelRow[];
  details: Array<{
    title: string;
    columns: string[];
    rows: Array<Record<string, string>>;
  }>;
}> {
  return {
    rows: [
      {
        id: "webchat",
        label: "WebChat",
        enabled: true,
        state: "ok",
        detail: "webchat active",
      }
    ],
    details: [],
  };
}

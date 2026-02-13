import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes } from "../protocol/index.js";

export const channelsHandlers: GatewayRequestHandlers = {
  "channels.status": async ({ respond }) => {
    respond(true, {
      ts: Date.now(),
      channelOrder: ["webchat"],
      channelLabels: { webchat: "WebChat" },
      channelDetailLabels: { webchat: "WebChat" },
      channels: {
        webchat: { configured: true, state: "ok" }
      },
      channelAccounts: {
        webchat: []
      },
      channelDefaultAccountId: {
        webchat: "default"
      }
    }, undefined);
  },
  "channels.logout": async ({ respond }) => {
    respond(false, undefined, { code: ErrorCodes.UNAVAILABLE, message: "Method not found" });
  },
};

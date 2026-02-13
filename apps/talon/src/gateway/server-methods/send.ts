import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes } from "../protocol/index.js";

export const sendHandlers: GatewayRequestHandlers = {
  send: async ({ respond }) => {
    respond(false, undefined, { code: ErrorCodes.UNAVAILABLE, message: "Use webchat instead" });
  },
  poll: async ({ respond }) => {
    respond(false, undefined, { code: ErrorCodes.UNAVAILABLE, message: "Method not found" });
  },
};

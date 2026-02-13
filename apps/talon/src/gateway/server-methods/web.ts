import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const webHandlers: GatewayRequestHandlers = {
  "web.login.start": async ({ respond }) => {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "QR login not supported"));
  },
  "web.login.wait": async ({ respond }) => {
    respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, "QR login not supported"));
  },
};

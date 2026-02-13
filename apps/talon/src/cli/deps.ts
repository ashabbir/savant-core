import type { OutboundSendDeps } from "../infra/outbound/deliver.js";
import { logWebSelfId } from "../channels/web/index.js";

export type CliDeps = Record<string, never>;

export function createDefaultDeps(): CliDeps {
  return {};
}

// Provider docking: extend this mapping when adding new outbound send deps.
export function createOutboundSendDeps(deps: CliDeps): OutboundSendDeps {
  return {};
}

export { logWebSelfId };


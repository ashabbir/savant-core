import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { DEFAULT_AGENT_ID } from "../agents/session-key.js";
import { resolveUserPath } from "../utils.js";

export function resolveTalonAgentDir(): string {
  const override =
    process.env.TALON_AGENT_DIR?.trim() || process.env.PI_CODING_AGENT_DIR?.trim();
  if (override) {
    return resolveUserPath(override);
  }
  const defaultAgentDir = path.join(resolveStateDir(), "agents", DEFAULT_AGENT_ID, "agent");
  return resolveUserPath(defaultAgentDir);
}

export function ensureTalonAgentEnv(): string {
  const dir = resolveTalonAgentDir();
  if (!process.env.TALON_AGENT_DIR) {
    process.env.TALON_AGENT_DIR = dir;
  }
  if (!process.env.PI_CODING_AGENT_DIR) {
    process.env.PI_CODING_AGENT_DIR = dir;
  }
  return dir;
}

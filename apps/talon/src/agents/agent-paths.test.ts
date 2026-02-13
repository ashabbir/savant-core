import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveTalonAgentDir } from "./agent-paths.js";

describe("resolveTalonAgentDir", () => {
  const previousStateDir = process.env.TALON_STATE_DIR;
  const previousAgentDir = process.env.TALON_AGENT_DIR;
  const previousPiAgentDir = process.env.PI_CODING_AGENT_DIR;
  let tempStateDir: string | null = null;

  afterEach(async () => {
    if (tempStateDir) {
      await fs.rm(tempStateDir, { recursive: true, force: true });
      tempStateDir = null;
    }
    if (previousStateDir === undefined) {
      delete process.env.TALON_STATE_DIR;
    } else {
      process.env.TALON_STATE_DIR = previousStateDir;
    }
    if (previousAgentDir === undefined) {
      delete process.env.TALON_AGENT_DIR;
    } else {
      process.env.TALON_AGENT_DIR = previousAgentDir;
    }
    if (previousPiAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousPiAgentDir;
    }
  });

  it("defaults to the multi-agent path when no overrides are set", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "talon-agent-"));
    process.env.TALON_STATE_DIR = tempStateDir;
    delete process.env.TALON_AGENT_DIR;
    delete process.env.PI_CODING_AGENT_DIR;

    const resolved = resolveTalonAgentDir();

    expect(resolved).toBe(path.join(tempStateDir, "agents", "main", "agent"));
  });

  it("honors TALON_AGENT_DIR overrides", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "talon-agent-"));
    const override = path.join(tempStateDir, "agent");
    process.env.TALON_AGENT_DIR = override;
    delete process.env.PI_CODING_AGENT_DIR;

    const resolved = resolveTalonAgentDir();

    expect(resolved).toBe(path.resolve(override));
  });
});

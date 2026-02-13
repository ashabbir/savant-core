import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatCliCommand } from "./command-format.js";
import { applyCliProfileEnv, parseCliProfileArgs } from "./profile.js";

describe("parseCliProfileArgs", () => {
  it("leaves gateway --dev for subcommands", () => {
    const res = parseCliProfileArgs([
      "node",
      "talon",
      "gateway",
      "--dev",
      "--allow-unconfigured",
    ]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBeNull();
    expect(res.argv).toEqual(["node", "talon", "gateway", "--dev", "--allow-unconfigured"]);
  });

  it("still accepts global --dev before subcommand", () => {
    const res = parseCliProfileArgs(["node", "talon", "--dev", "gateway"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("dev");
    expect(res.argv).toEqual(["node", "talon", "gateway"]);
  });

  it("parses --profile value and strips it", () => {
    const res = parseCliProfileArgs(["node", "talon", "--profile", "work", "status"]);
    if (!res.ok) {
      throw new Error(res.error);
    }
    expect(res.profile).toBe("work");
    expect(res.argv).toEqual(["node", "talon", "status"]);
  });

  it("rejects missing profile value", () => {
    const res = parseCliProfileArgs(["node", "talon", "--profile"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (dev first)", () => {
    const res = parseCliProfileArgs(["node", "talon", "--dev", "--profile", "work", "status"]);
    expect(res.ok).toBe(false);
  });

  it("rejects combining --dev with --profile (profile first)", () => {
    const res = parseCliProfileArgs(["node", "talon", "--profile", "work", "--dev", "status"]);
    expect(res.ok).toBe(false);
  });
});

describe("applyCliProfileEnv", () => {
  it("fills env defaults for dev profile", () => {
    const env: Record<string, string | undefined> = {};
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    const expectedStateDir = path.join("/home/peter", ".talon-dev");
    expect(env.TALON_PROFILE).toBe("dev");
    expect(env.TALON_STATE_DIR).toBe(expectedStateDir);
    expect(env.TALON_CONFIG_PATH).toBe(path.join(expectedStateDir, "talon.json"));
    expect(env.TALON_GATEWAY_PORT).toBe("19001");
  });

  it("does not override explicit env values", () => {
    const env: Record<string, string | undefined> = {
      TALON_STATE_DIR: "/custom",
      TALON_GATEWAY_PORT: "19099",
    };
    applyCliProfileEnv({
      profile: "dev",
      env,
      homedir: () => "/home/peter",
    });
    expect(env.TALON_STATE_DIR).toBe("/custom");
    expect(env.TALON_GATEWAY_PORT).toBe("19099");
    expect(env.TALON_CONFIG_PATH).toBe(path.join("/custom", "talon.json"));
  });
});

describe("formatCliCommand", () => {
  it("returns command unchanged when no profile is set", () => {
    expect(formatCliCommand("talon doctor --fix", {})).toBe("talon doctor --fix");
  });

  it("returns command unchanged when profile is default", () => {
    expect(formatCliCommand("talon doctor --fix", { TALON_PROFILE: "default" })).toBe(
      "talon doctor --fix",
    );
  });

  it("returns command unchanged when profile is Default (case-insensitive)", () => {
    expect(formatCliCommand("talon doctor --fix", { TALON_PROFILE: "Default" })).toBe(
      "talon doctor --fix",
    );
  });

  it("returns command unchanged when profile is invalid", () => {
    expect(formatCliCommand("talon doctor --fix", { TALON_PROFILE: "bad profile" })).toBe(
      "talon doctor --fix",
    );
  });

  it("returns command unchanged when --profile is already present", () => {
    expect(
      formatCliCommand("talon --profile work doctor --fix", { TALON_PROFILE: "work" }),
    ).toBe("talon --profile work doctor --fix");
  });

  it("returns command unchanged when --dev is already present", () => {
    expect(formatCliCommand("talon --dev doctor", { TALON_PROFILE: "dev" })).toBe(
      "talon --dev doctor",
    );
  });

  it("inserts --profile flag when profile is set", () => {
    expect(formatCliCommand("talon doctor --fix", { TALON_PROFILE: "work" })).toBe(
      "talon --profile work doctor --fix",
    );
  });

  it("trims whitespace from profile", () => {
    expect(formatCliCommand("talon doctor --fix", { TALON_PROFILE: "  jbtalon  " })).toBe(
      "talon --profile jbtalon doctor --fix",
    );
  });

  it("handles command with no args after talon", () => {
    expect(formatCliCommand("talon", { TALON_PROFILE: "test" })).toBe(
      "talon --profile test",
    );
  });

  it("handles pnpm wrapper", () => {
    expect(formatCliCommand("pnpm talon doctor", { TALON_PROFILE: "work" })).toBe(
      "pnpm talon --profile work doctor",
    );
  });
});

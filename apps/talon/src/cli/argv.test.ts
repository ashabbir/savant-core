import { describe, expect, it } from "vitest";
import {
  buildParseArgv,
  getFlagValue,
  getCommandPath,
  getPrimaryCommand,
  getPositiveIntFlagValue,
  getVerboseFlag,
  hasHelpOrVersion,
  hasFlag,
  shouldMigrateState,
  shouldMigrateStateFromPath,
} from "./argv.js";

describe("argv helpers", () => {
  it("detects help/version flags", () => {
    expect(hasHelpOrVersion(["node", "talon", "--help"])).toBe(true);
    expect(hasHelpOrVersion(["node", "talon", "-V"])).toBe(true);
    expect(hasHelpOrVersion(["node", "talon", "status"])).toBe(false);
  });

  it("extracts command path ignoring flags and terminator", () => {
    expect(getCommandPath(["node", "talon", "status", "--json"], 2)).toEqual(["status"]);
    expect(getCommandPath(["node", "talon", "agents", "list"], 2)).toEqual(["agents", "list"]);
    expect(getCommandPath(["node", "talon", "status", "--", "ignored"], 2)).toEqual(["status"]);
  });

  it("returns primary command", () => {
    expect(getPrimaryCommand(["node", "talon", "agents", "list"])).toBe("agents");
    expect(getPrimaryCommand(["node", "talon"])).toBeNull();
  });

  it("parses boolean flags and ignores terminator", () => {
    expect(hasFlag(["node", "talon", "status", "--json"], "--json")).toBe(true);
    expect(hasFlag(["node", "talon", "--", "--json"], "--json")).toBe(false);
  });

  it("extracts flag values with equals and missing values", () => {
    expect(getFlagValue(["node", "talon", "status", "--timeout", "5000"], "--timeout")).toBe(
      "5000",
    );
    expect(getFlagValue(["node", "talon", "status", "--timeout=2500"], "--timeout")).toBe(
      "2500",
    );
    expect(getFlagValue(["node", "talon", "status", "--timeout"], "--timeout")).toBeNull();
    expect(getFlagValue(["node", "talon", "status", "--timeout", "--json"], "--timeout")).toBe(
      null,
    );
    expect(getFlagValue(["node", "talon", "--", "--timeout=99"], "--timeout")).toBeUndefined();
  });

  it("parses verbose flags", () => {
    expect(getVerboseFlag(["node", "talon", "status", "--verbose"])).toBe(true);
    expect(getVerboseFlag(["node", "talon", "status", "--debug"])).toBe(false);
    expect(getVerboseFlag(["node", "talon", "status", "--debug"], { includeDebug: true })).toBe(
      true,
    );
  });

  it("parses positive integer flag values", () => {
    expect(getPositiveIntFlagValue(["node", "talon", "status"], "--timeout")).toBeUndefined();
    expect(
      getPositiveIntFlagValue(["node", "talon", "status", "--timeout"], "--timeout"),
    ).toBeNull();
    expect(
      getPositiveIntFlagValue(["node", "talon", "status", "--timeout", "5000"], "--timeout"),
    ).toBe(5000);
    expect(
      getPositiveIntFlagValue(["node", "talon", "status", "--timeout", "nope"], "--timeout"),
    ).toBeUndefined();
  });

  it("builds parse argv from raw args", () => {
    const nodeArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["node", "talon", "status"],
    });
    expect(nodeArgv).toEqual(["node", "talon", "status"]);

    const versionedNodeArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["node-22", "talon", "status"],
    });
    expect(versionedNodeArgv).toEqual(["node-22", "talon", "status"]);

    const versionedNodeWindowsArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["node-22.2.0.exe", "talon", "status"],
    });
    expect(versionedNodeWindowsArgv).toEqual(["node-22.2.0.exe", "talon", "status"]);

    const versionedNodePatchlessArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["node-22.2", "talon", "status"],
    });
    expect(versionedNodePatchlessArgv).toEqual(["node-22.2", "talon", "status"]);

    const versionedNodeWindowsPatchlessArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["node-22.2.exe", "talon", "status"],
    });
    expect(versionedNodeWindowsPatchlessArgv).toEqual(["node-22.2.exe", "talon", "status"]);

    const versionedNodeWithPathArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["/usr/bin/node-22.2.0", "talon", "status"],
    });
    expect(versionedNodeWithPathArgv).toEqual(["/usr/bin/node-22.2.0", "talon", "status"]);

    const nodejsArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["nodejs", "talon", "status"],
    });
    expect(nodejsArgv).toEqual(["nodejs", "talon", "status"]);

    const nonVersionedNodeArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["node-dev", "talon", "status"],
    });
    expect(nonVersionedNodeArgv).toEqual(["node", "talon", "node-dev", "talon", "status"]);

    const directArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["talon", "status"],
    });
    expect(directArgv).toEqual(["node", "talon", "status"]);

    const bunArgv = buildParseArgv({
      programName: "talon",
      rawArgs: ["bun", "src/entry.ts", "status"],
    });
    expect(bunArgv).toEqual(["bun", "src/entry.ts", "status"]);
  });

  it("builds parse argv from fallback args", () => {
    const fallbackArgv = buildParseArgv({
      programName: "talon",
      fallbackArgv: ["status"],
    });
    expect(fallbackArgv).toEqual(["node", "talon", "status"]);
  });

  it("decides when to migrate state", () => {
    expect(shouldMigrateState(["node", "talon", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "talon", "health"])).toBe(false);
    expect(shouldMigrateState(["node", "talon", "sessions"])).toBe(false);
    expect(shouldMigrateState(["node", "talon", "memory", "status"])).toBe(false);
    expect(shouldMigrateState(["node", "talon", "agent", "--message", "hi"])).toBe(false);
    expect(shouldMigrateState(["node", "talon", "agents", "list"])).toBe(true);
    expect(shouldMigrateState(["node", "talon", "message", "send"])).toBe(true);
  });

  it("reuses command path for migrate state decisions", () => {
    expect(shouldMigrateStateFromPath(["status"])).toBe(false);
    expect(shouldMigrateStateFromPath(["agents", "list"])).toBe(true);
  });
});

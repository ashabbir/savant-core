import { describe, expect, it } from "vitest";
import { buildAgentSystemPrompt } from "./system-prompt.js";

describe("context-first prompt rules", () => {
  it("requires memory_search before proposing file changes", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/workspace",
      toolNames: ["memory_search", "memory_get"],
    });

    expect(prompt).toContain("Before proposing any file change for a task: run memory_search first.");
    expect(prompt).toContain("architecture.md, ADRs, or memory_bank guidance");
  });
});

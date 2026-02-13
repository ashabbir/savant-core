import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTaskMasterTool } from "./task-master-tool.js";

describe("createTaskMasterTool", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it("should return a tool with correct name and description", () => {
        const tool = createTaskMasterTool({ apiKey: "test-key" });
        expect(tool.name).toBe("task_master");
        expect(tool.label).toBe("Task Master");
        expect(tool.description).toContain("Task Master");
    });

    it("should post a comment successfully", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    ok: true,
                    data: { id: "comment_123", body: "Test comment" },
                }),
        });

        const tool = createTaskMasterTool({
            apiUrl: "http://localhost:3333",
            apiKey: "test-key",
        });

        const result = await tool.execute("call_1", {
            action: "post_comment",
            taskId: "task_123",
            body: "Test comment",
        }) as { content: Array<{ text: string }> };

        expect(fetch).toHaveBeenCalledWith(
            "http://localhost:3333/api/tasks/task_123/comments",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "x-api-key": "test-key",
                }),
            })
        );

        expect(result.content[0].text).toContain("ok");
    });

    it("should update task status successfully", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    ok: true,
                    data: { id: "task_123", columnName: "Done" },
                }),
        });

        const tool = createTaskMasterTool({
            apiUrl: "http://localhost:3333",
            apiKey: "test-key",
        });

        const result = await tool.execute("call_2", {
            action: "update_status",
            taskId: "task_123",
            columnName: "Done",
        }) as { content: Array<{ text: string }> };

        expect(fetch).toHaveBeenCalledWith(
            "http://localhost:3333/api/tasks/task_123",
            expect.objectContaining({
                method: "PATCH",
            })
        );

        expect(result.content[0].text).toContain("ok");
    });

    it("should get task details successfully", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    ok: true,
                    data: { id: "task_123", title: "Test Task", columnName: "Todo" },
                }),
        });

        const tool = createTaskMasterTool({
            apiUrl: "http://localhost:3333",
            apiKey: "test-key",
        });

        const result = await tool.execute("call_3", {
            action: "get_task",
            taskId: "task_123",
        }) as { content: Array<{ text: string }> };

        expect(fetch).toHaveBeenCalledWith(
            "http://localhost:3333/api/tasks/task_123",
            expect.objectContaining({
                method: "GET",
            })
        );

        expect(result.content[0].text).toContain("ok");
    });

    it("should return error when taskId is missing", async () => {
        const tool = createTaskMasterTool({
            apiUrl: "http://localhost:3333",
            apiKey: "test-key",
        });

        const result = await tool.execute("call_4", {
            action: "get_task",
        }) as { content: Array<{ text: string }> };

        expect(result.content[0].text).toContain("taskId is required");
    });

    it("should return error when apiKey is missing", async () => {
        const tool = createTaskMasterTool({
            apiUrl: "http://localhost:3333",
            apiKey: "",
        });

        const result = await tool.execute("call_5", {
            action: "get_task",
            taskId: "task_123",
        }) as { content: Array<{ text: string }> };

        expect(result.content[0].text).toContain("TASK_MASTER_API_KEY is not configured");
    });
});

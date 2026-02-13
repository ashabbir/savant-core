/**
 * Task Master Tool
 *
 * Provides agents with the ability to interact with Task Master API:
 * - Post comments on tasks
 * - Update task status (move to different columns)
 * - Get task details
 */

import { Type } from "@sinclair/typebox";
import { loadConfig } from "../../config/config.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult, readStringParam } from "./common.js";

const TASK_MASTER_API_URL = process.env.TASK_MASTER_API_URL || "http://task-master-api:3333";
const TASK_MASTER_API_KEY = process.env.TASK_MASTER_API_KEY || "";

const TaskMasterToolSchema = Type.Object({
    action: Type.Union([
        Type.Literal("post_comment"),
        Type.Literal("update_status"),
        Type.Literal("get_task"),
        Type.Literal("start_work"),
        Type.Literal("stop_work"),
    ]),
    taskId: Type.String({ description: "The ID of the task to interact with." }),
    body: Type.Optional(Type.String({ description: "Comment body for post_comment action." })),
    columnName: Type.Optional(
        Type.String({
            description:
                "Column name for update_status action (e.g., 'Todo', 'Inprogress', 'Review', 'Done').",
        })
    ),
    outcome: Type.Optional(Type.Union([Type.Literal("review"), Type.Literal("blocked")])),
    reason: Type.Optional(Type.String({ description: "Reason for stop_work (e.g. why it is blocked)." })),
});

type TaskMasterToolOptions = {
    apiUrl?: string;
    apiKey?: string;
    agentId?: string;
    /** Task ID from session metadata (auto-filled if available). */
    taskId?: string;
};

async function callTaskMasterApi(params: {
    method: string;
    path: string;
    apiUrl: string;
    apiKey: string;
    body?: Record<string, unknown>;
}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const { method, path, apiUrl, apiKey, body } = params;
    const url = `${apiUrl}${path}`;

    try {
        const response = await fetch(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
            },
            body: body ? JSON.stringify(body) : undefined,
        });

        const json = await response.json();

        if (!response.ok) {
            return {
                ok: false,
                error: json.error || json.message || `HTTP ${response.status}`,
            };
        }

        return { ok: true, data: json.data ?? json };
    } catch (err) {
        return { ok: false, error: String(err) };
    }
}

export function createTaskMasterTool(options?: TaskMasterToolOptions): AnyAgentTool {
    const apiUrl = options?.apiUrl || TASK_MASTER_API_URL;
    const apiKey = options?.apiKey || TASK_MASTER_API_KEY;
    const agentId = options?.agentId;

    return {
        label: "Task Master",
        name: "task_master",
        description:
            "Interact with Task Master to post comments, update task status, or get task details. " +
            "Use start_work and stop_work to manage your assignment lifecycle.",
        parameters: TaskMasterToolSchema,
        execute: async (_toolCallId, args, signal) => {
            if (signal?.aborted) {
                const err = new Error("Task Master action aborted");
                err.name = "AbortError";
                throw err;
            }

            const params = args as Record<string, unknown>;
            const action = readStringParam(params, "action", { required: true });
            const taskId = readStringParam(params, "taskId") || options?.taskId;

            if (!taskId) {
                return jsonResult({ ok: false, error: "taskId is required" });
            }

            if (!apiKey) {
                return jsonResult({
                    ok: false,
                    error: "TASK_MASTER_API_KEY is not configured",
                });
            }

            switch (action) {
                case "post_comment": {
                    const body = readStringParam(params, "body");
                    if (!body) {
                        return jsonResult({ ok: false, error: "body is required for post_comment" });
                    }

                    const result = await callTaskMasterApi({
                        method: "POST",
                        path: `/api/tasks/${taskId}/comments`,
                        apiUrl,
                        apiKey,
                        body: { body, author: agentId },
                    });

                    return jsonResult(result);
                }

                case "update_status": {
                    const columnName = readStringParam(params, "columnName");
                    if (!columnName) {
                        return jsonResult({ ok: false, error: "columnName is required for update_status" });
                    }

                    const result = await callTaskMasterApi({
                        method: "PATCH",
                        path: `/api/tasks/${taskId}`,
                        apiUrl,
                        apiKey,
                        body: { columnName },
                    });

                    return jsonResult(result);
                }

                case "get_task": {
                    const result = await callTaskMasterApi({
                        method: "GET",
                        path: `/api/tasks/${taskId}`,
                        apiUrl,
                        apiKey,
                    });

                    return jsonResult(result);
                }

                case "start_work": {
                    const result = await callTaskMasterApi({
                        method: "POST",
                        path: `/api/tasks/${taskId}/start-work`,
                        apiUrl,
                        apiKey,
                        body: { agent: agentId },
                    });

                    return jsonResult(result);
                }

                case "stop_work": {
                    const outcome = readStringParam(params, "outcome");
                    const reason = readStringParam(params, "reason");
                    const result = await callTaskMasterApi({
                        method: "POST",
                        path: `/api/tasks/${taskId}/stop-work`,
                        apiUrl,
                        apiKey,
                        body: { agent: agentId, outcome, reason },
                    });

                    return jsonResult(result);
                }

                default:
                    return jsonResult({ ok: false, error: `Unknown action: ${action}` });
            }
        },
    };
}


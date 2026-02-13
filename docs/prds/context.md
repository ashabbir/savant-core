This document is a formal **Product Requirements & System Design Specification** for the **Savant Core Context Gateway**. It is structured for an AI agent to consume as a "source of truth" for implementation.

---

# System Spec: Savant Core Context Gateway & Indexing Engine

## 1. Overview

The **Context Gateway** is a specialized infrastructure layer in Savant Core that bridges **Task Master** (Management) and **Talon** (Execution). It automates the ingestion of repository knowledge into a **Model Context Protocol (MCP)** compatible interface.

## 2. Core Flows

### Flow A: Automated Repository Ingestion

1. **Event Trigger**: Task Master creates a new `Repository` record.
2. **Indexing Request**: A background worker (BullMQ/RabbitMQ) sends a request to the `mcp-gateway` to initialize an index.
3. **Execution**: The Gateway runs `savant-context index repo <path> --name <repo_name>` within a dedicated container.
4. **State Update**: Once the CLI returns `0`, the Gateway notifies Task Master via webhook that the repo is "Agent-Ready."

### Flow B: Talon Agent Context Retrieval

1. **Agent Search**: Before task execution, Talon calls the Gateway’s `memory_search` tool.
2. **Context Extraction**: The Gateway queries the local SQLite/Vector index and returns Markdown snippets.
3. **Knowledge Injection**: Talon uses the results to augment its plan (e.g., identifying the correct `memory_bank/runbooks/` file to follow).

---

## 3. Endpoint Contracts (API)

### Gateway Internal API (`mcp-gateway:4444`)

| Method | Endpoint | Description | Payload |
| --- | --- | --- | --- |
| `POST` | `/v1/index/repo` | Trigger manual/auto repo indexing. | `{ "repo_id": "uuid", "path": "string", "name": "string" }` |
| `GET` | `/v1/status/:repo_name` | Check if index is healthy/stale. | `Returns: { "status": "indexed", "last_updated": "iso8601" }` |
| `POST` | `/v1/mcp/query` | Standard MCP `call_tool` endpoint. | `{ "tool": "memory_search", "arguments": { "query": "string" } }` |

---

## 4. Event Stack (Message Bus)

| Event Name | Producer | Consumer | Action |
| --- | --- | --- | --- |
| `repo.created` | Task Master | Gateway | Starts `savant-context index`. |
| `index.completed` | Gateway | Task Master | Flips `is_indexed` flag in DB. |
| `ticket.assigned` | Task Master | Talon | Triggers Talon to perform a "Context Warmup" query. |

---

## 5. Implementation Strategy for AI Agent

### Step 1: Docker Orchestration

* **Base Image**: Use `python:3.10-slim` for the Indexer.
* **Gateway Host**: Use a Node.js-based MCP proxy to expose the Python tools via HTTP/SSE.
* **Persistence**: Mount a volume at `/app/data` to share the `context.db` between the indexer and the query tools.

### Step 2: Tooling Configuration

The agent must register two primary MCP tools in the gateway:

1. **`memory_search(query, repo)`**: Returns top-k relevant Markdown chunks using the prototype's logic.
2. **`memory_read(path, repo)`**: Returns the full content of a specific file in the `memory_bank/` directory.

### Step 3: Talon Reasoning Loop

Modify the Talon Agent's **System Prompt**:

> "Always search the `memory_bank` via the MCP tool before proposing a file change. If the search returns a relevant `architecture.md` or ADR, prioritize those constraints over default model behavior."

---

## 6. Security & Governance

* **Auth**: The Gateway must validate JWTs issued by Savant Core's Identity Provider.
* **Isolation**: Each repo index is namespaced within the DB to prevent cross-tenant data leakage.
* **Audit**: Tool calls from Talon are logged to the Gateway's internal audit table (not a local file) for observability.

--
This implementation strategy follows the Savant Core development standards, utilizing a TDD-driven approach where each commit represents a functional milestone.

Phase 1: The Gateway Infrastructure
Commit 1: Initialize MCP Gateway Container & Bridge

Action: Create the docker-compose.yml and Dockerfile for the mcp-gateway.

TDD Target: A health-check test ensuring the container starts and the Python environment can execute savant-context --version.

Key Logic: Install the standard MCP TypeScript SDK to act as the host and map the Python prototype scripts into the container environment.

Commit 2: Register Memory Bank MCP Tools

Action: Map the memory search and memory read CLI commands to MCP call_tool definitions.

TDD Target: A JSON-RPC test case that sends a call_tool request for "search" and receives a structured response from the Python indexer.

Contract:

Input: { "query": "string", "repo": "string" }

Output: [ { "path": "string", "content": "string", "score": "number" } ].

Phase 2: Task Master Automation (The Trigger)
Commit 3: Repository Event Observer & Job Queue

Action: In apps/task-master, implement a service listener for repo creation and a BullMQ worker for indexing.

TDD Target: Mock the repository creation event and verify that a job is dispatched with the correct repo_id and path.

Savant Rule: Ensure small, focused changes that do not break existing repo management flows.

Commit 4: Indexer Integration Webhook

Action: Connect the worker to the Gateway's /v1/index/repo endpoint.

TDD Target: Assert that the worker handles 202 Accepted from the Gateway and updates the Task Master DB status to INDEXING.

Validation: The system must run savant-context status to verify the database is properly initialized.

Phase 3: Talon Orchestration (The Intelligence)
Commit 5: Context-First Reasoning Loop

Action: Update the Talon Runtime agent prompt to include a mandatory "Context Retrieval" tool-call step.

TDD Target: Create an integration test where an agent is given a ticket about "architecture"; the test passes only if the agent's first action is calling memory_search.

Logic: Before any file edits, Talon must look for memory_bank/README.md to establish the entry point.

Commit 6: Automated Sync (The Loop Closure)

Action: Implement a trigger that re-runs the indexer whenever a PR is merged or Markdown files are updated.

TDD Target: Update a mock Markdown file and verify the savant-context index command is re-executed by the worker.

Phase 4: Validation & Hardening
Commit 7: End-to-End Persistence & Error Handling

Action: Configure shared Docker volumes for the SQLite/Vector DB and implement deterministic error shapes.

TDD Target: Simulate a failed indexing (e.g., malformed Markdown) and ensure Task Master displays an actionable error message rather than a "false-success" state.

Final Response Contract Check
Changed: Gateway container added, Task Master hooks established, Talon prompt updated.

Files: docker/mcp-gateway/*, apps/task-master/src/services/repo-observer.ts, apps/talon/src/agents/prompts/context-prompt.ts.

Validation: All tool calls verified via JSON-RPC unit tests and end-to-end event bus logs.

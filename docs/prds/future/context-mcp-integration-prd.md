# Context MCP Integration PRD (Task Master + Talon)

## Goal

Enable Task Master users to register and index repositories, then allow Talon agents to use those indexes through MCP tools to reason about tasks and code issues.

Constraint: all integration must be done through MCP tool calls (no direct DB coupling between Task Master/Talon and Context).

## Problem Statement

Today, `savant-context` provides MCP search/read/status tools, but repository indexing is initiated via CLI workflows. Task Master cannot currently manage indexing lifecycle from UI, and Talon cannot reliably depend on a Task Master-managed index catalog.

## Success Criteria

1. Task Master UI can register repositories and trigger indexing/reindexing via MCP.
2. Task Master shows indexing status and basic health (files/chunks/errors/timestamp).
3. Talon agents can query indexed repos via MCP (`code_search`, `memory_bank_search`, etc.).
4. Integration is multi-repo and scoped by repository name.
5. No direct SQL/DB access from Task Master or Talon to Context internals.

## Current State

### Context MCP

Existing MCP tools in `context`:
- `code_search`
- `memory_bank_search`
- `memory_resources_list`
- `memory_resources_read`
- `repos_list`
- `repo_status`

Gap:
- No MCP tool for repository indexing lifecycle (index, reindex, delete), even though indexing exists in `Indexer`.

### Task Master

- No dedicated MCP client module for Context.
- No UI for Context repo management.
- No DB entities for external context index registrations.

### Talon

- Can run with MCP config at CLI/backend level.
- ACP session path currently ignores per-session `mcpServers` payload; MCP should be configured at agent/backend level.

## Scope

### In Scope

- MCP-only integration path.
- Task Master API + UI support for Context repository setup/index management.
- Talon runtime configuration to consume Context MCP search tools during task execution.

### Out of Scope (Phase 1)

- Replacing Context embedding model/runtime.
- Cross-service transactional orchestration.
- Real-time file watching/index auto-refresh (scheduled/manual reindex only).

## Proposed Architecture

1. `savant-context` runs as an MCP server process.
2. Task Master API acts as MCP client for administrative Context actions.
3. Task Master Web calls Task Master API to manage repo registrations and index runs.
4. Talon agent runtime is configured with the same Context MCP server and uses search/read tools while solving tasks.

Logical flow:
- User registers repo in Task Master UI.
- Task Master API calls Context MCP tool to index repo.
- Context stores chunks/embeddings and returns stats.
- Talon agent, during a task run, calls Context MCP search tools to find relevant code/docs.

## MCP Tool Contract Changes (Context)

Add new MCP tools to `context`:

1. `repo_index`
- Input: `path` (string), `name` (optional string), `reindex` (optional boolean default true)
- Output: `repo_name`, `repo_path`, `files_indexed`, `chunks_indexed`, `memory_bank_files`, `errors`, `timestamp`

2. `repo_delete`
- Input: `name` (string)
- Output: `repo_name`, `deleted` (boolean)

3. `repo_get`
- Input: `name` (string)
- Output: repo metadata + stats (or not found error)

Notes:
- `repo_status` and `repos_list` remain for listing and UI status views.
- `repo_index` should be idempotent for same `(name, path)` where possible.

## Task Master Design

### API Layer

Add Context integration module in Task Master API:
- MCP transport wrapper (JSON-RPC request/response).
- Tool-specific methods:
  - `indexRepo()`
  - `deleteRepo()`
  - `listRepos()`
  - `repoStatus()`
  - `searchCode()` (optional Phase 2 for diagnostics)

New endpoints (proposed):
- `POST /api/context/repos` -> register + index (`repo_index`)
- `GET /api/context/repos` -> list (`repos_list`)
- `GET /api/context/repos/status` -> status (`repo_status`)
- `POST /api/context/repos/:name/reindex` -> `repo_index`
- `DELETE /api/context/repos/:name` -> `repo_delete`

### Data Model (Task Master DB)

Add `ContextRepo` entity (name subject to conventions):
- `id`
- `projectId` (nullable for global repos)
- `repoName` (Context logical name, unique)
- `repoPath`
- `enabled`
- `lastIndexedAt`
- `lastFileCount`
- `lastChunkCount`
- `lastError`
- `createdAt`, `updatedAt`

Purpose:
- UI persistence and ownership mapping.
- Auditing and retry UX.

### UI

Add Context section in Task Master:
- List registered repos and status.
- Add repo modal: path + logical name + project association.
- Reindex action.
- Delete action.
- Last index stats/errors display.

UI should follow Cyber-Onyx tokens/components from `apps/task-master/STYLE_GUIDE_CYBER_ONYX.md`.

## Talon Design

1. Configure Context MCP at Talon backend/CLI config level (not per ACP session).
2. Ensure agent tool policy allows MCP access to Context tools:
- `code_search`
- `memory_bank_search`
- `memory_resources_list`
- `memory_resources_read`
- `repos_list`/`repo_status` (optional read-only visibility)
3. Update agent prompts/runbooks to bias toward:
- query-retrieve-summarize workflow
- repo-filtered searches when task has project context

## Security & Guardrails

1. Path allowlist for indexing:
- Task Master should validate repo paths against configured allowed roots.
2. Tool-level allowlist:
- Task Master should only call approved Context MCP tools.
3. Auditing:
- Log who triggered index/reindex/delete and MCP result payload summary.
4. Rate limiting:
- Prevent repeated concurrent reindex requests per repo.

## Failure Modes

1. MCP server unavailable:
- Return actionable error in Task Master API/UI and preserve retry action.
2. Long index jobs:
- Phase 1 can be synchronous with timeout guard.
- Phase 2 can shift to async job model with poll endpoint.
3. Repo renamed/moved:
- Reindex fails; UI shows remediation with editable path/name.

## Rollout Plan

### Phase 1: MCP Capability Completion (Context)

- Add `repo_index`, `repo_delete`, `repo_get` tools.
- Keep response shape stable and JSON-only.

Exit criteria:
- Manual MCP calls can fully manage repo lifecycle.

### Phase 2: Task Master Integration

- Implement API MCP client + new endpoints.
- Add `ContextRepo` persistence.
- Build minimal UI for register/list/reindex/delete.

Exit criteria:
- User can manage repo indexing fully from Task Master UI.

### Phase 3: Talon Consumption

- Configure Talon MCP backend to include Context server.
- Update selected agents/prompts to use Context search tools.

Exit criteria:
- Assigned Talon agent uses Context index results in task execution traces.

### Phase 4: Hardening

- Async indexing jobs + progress polling.
- Retry strategy and operator alerts.
- Project-level repo defaults and templates.

## Open Questions

1. Should Context run as dedicated service in root `docker-compose.yml` now, or remain external in Phase 1?
2. Do we need project-scoped access control for repos before general rollout?
3. Should Task Master support non-local repo paths (e.g., mounted volumes, remote checkout workers)?
4. For Talon, do we want one shared Context MCP server or per-agent isolated instances?

## Implementation Notes

- This PRD assumes no direct imports of Context Python code into Task Master/Talon runtime.
- All cross-system behavior is mediated through MCP tool contracts.
- Keep tool naming and response schemas backward-compatible where possible.

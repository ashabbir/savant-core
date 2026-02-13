# Memory Bank — Task Master × Talon

## Architecture (Current)
- **Task Master API**: Node/Express + Prisma (MongoDB).
- **Task Master Web**: Vite + React.
- **Talon Runtime**: lives under `apps/talon`.

### Data Model (Mongo / Prisma)
- `User`
  - `projectIds: ObjectId[]` for access control.
  - `role` uses `ADMIN`/`MEMBER`.
  - `preferredAgentId` selects the default Talon agent for assignment triggers.
- `Project`
  - `columns` embedded as `{ name, order, enabled }`.
  - `description`, `repoPath`, `localPath`, `notes` stored for shared memory.
  - `monthlyTokenLimit`, `monthlyCostLimit` for Talon quotas.
- `Task`
  - `columnName` (string) instead of `columnId`.
- `Agent`
  - Fields: `name`, `role`, `model`, `soul`, `guardrails`, `status`, `sessionKey`.
- `TalonRetry`
  - Durable retry queue for failed Talon calls (`request`, `attempts`, `status`, `lastError`).
- `RoutingRule`
  - Per-project agent routing rules (type/priority/assignee → agentId).
- `UsageEntry`
  - Token/cost tracking for agent runs.
- `NotificationSubscription`
  - Slack/email subscriptions with optional mentions-only mode.

### Key API Behaviors
- **Auth**: `X-API-Key` required for most routes.
- **Boards**: `/api/projects/:id/board` returns project, embedded columns, and tasks ordered by `columnName` + `order`.
- **Project Context**:
  - `GET /api/projects/:id/context`
  - `PATCH /api/projects/:id/context`
- **Talon Triggers**:
  - Assignment changes or moves into `Todo` trigger Talon when configured.
  - Preferred agent routing uses `User.preferredAgentId` when set.
  - Routing rules (project-level) take precedence over preferred agent.
  - Session key format: `agent:<agentId>:task:<taskId>`.
  - Talon request uses `model: talon:<agentId>` and `x-talon-session-key` header.
  - Response text is persisted as a Task Comment; latency/model logged to Activity.
  - Failed calls retry with backoff; optional durable queue persists failures for later retries.
  - Quotas (project/user) can block Talon triggers when exceeded.

### Talon Config (Task Master)
- `TALON_GATEWAY_URL` — base URL for gateway (required to trigger).
- `TALON_GATEWAY_TOKEN` — bearer token for gateway auth (optional).
- `TALON_DEFAULT_AGENT_ID` — fallback agent ID if no assignee match.
- `TALON_MAX_ATTEMPTS` — retry attempts per request (default 3).
- `TALON_RETRY_DELAY_MS` — base delay between retries (default 500ms).
- `TALON_QUEUE_ENABLED` — persist failed calls to `TalonRetry`.
- `TALON_QUEUE_POLL_MS` — background retry interval (optional).

### UI Structure
- **ControlNav**: main left nav (top/bottom actions).
- **FilterDrawer**: left drawer for filters.
- **ActivityDrawer**: right drawer for activity/agents/chat/docs.
- **StoryBoard / EpicBoard**: board views.
- **TaskCard / EpicCard**: card components.
- **CardEditDrawer**: right-side edit drawer for tasks.
- **AppHeader / BoardHeader / AppFooter**: layout structure.
- **AgentsPage**: admin agent management UI (name/role/model/SOUL/guardrails).
- **RoutingRulesPanel**: project settings panel for admin routing rules.

## User Flows (Current)
- **Login** via `/api/login` and store `task_api_key`, `task_role`, `task_username` in localStorage.
- **Projects** list via `/api/projects` (admin sees all; members see `projectIds`).
- **Story Board** defaults group-by to `epic` on first load (stored in `task_group_by`).
- **Stories** default to collapsed on board load; **Epics** also default to collapsed.
- **Create Task** uses `columnName`; story tasks default `dueAt` to +1 day if omitted.
- **Profile** supports `preferred agent` selection for Talon routing.
- **Profile** supports notification subscriptions (Slack/email) and email address.
- **Admin Users** can attach a preferred agent to a user; agent chat author list is limited to users with a preferred agent.
- **Assignee/Created By** pickers show users only (no direct agent selection).

## Significant Events
- **2026-02-08:** Lex performed a deep dive into the Savant Core monorepo. Identified the primary components (Task Master and Talon), mapped out the API integration flows (triggers, sync, and callbacks), and created a `BOOTSTRAP.md` to guide future development. Established the workspace-level mission: refining the AI-driven task orchestration ecosystem.
- **2026-02-11:** Debugged and fixed a critical UI crash in the `LLMProvidersPage` where model synchronization failed due to a nested property access error (`Cannot read properties of undefined (reading 'syncedCount')`). Rebuilt the web production assets to deploy the fix.


# Savant Core Integration Current State (Stage 1 Exploration)

## Executive Answers

1. **Why Talon calls currently hang/fail**
- The `talon` Docker service is not starting the gateway server at all; it runs `tail -f /dev/null` (`docker-compose.yml:80`).
- Task Master points to `http://talon:18789` (`docker-compose.yml:33`), so requests fail because nothing is listening.
- Even when Talon is up, Task Master Talon calls use `fetch` with **no timeout** in key paths (`apps/task-master/apps/api/src/index.js:208`, `apps/task-master/apps/api/src/index.js:319`, `apps/task-master/apps/api/src/index.js:1995`), so some failure modes can appear as hangs.
- There are field-name mismatches (`talonId` vs `talonAgentId`) in Task Master lookup/delete logic (`apps/task-master/apps/api/src/index.js:84`, `apps/task-master/apps/api/src/index.js:302`, `apps/task-master/apps/api/src/index.js:432`, schema uses `talonAgentId` at `apps/task-master/apps/api/prisma/schema.prisma:195`).

2. **Exact path/filename for `/v1/auth/callback` implementation**
- Gateway HTTP routing entrypoint is `apps/talon/src/gateway/server-http.ts:276`.
- So `/v1/auth/callback` should be implemented there (or in a new handler module wired there, e.g. `apps/talon/src/gateway/auth-http.ts`, then invoked from `server-http.ts`).

3. **How `x-api-key` (Task Master) relates to `Bearer` token (Talon)**
- `x-api-key` secures **Task Master API** access (`apps/task-master/apps/api/src/index.js:742`).
- `Authorization: Bearer <token>` secures **Talon gateway** (`apps/talon/src/gateway/http-utils.ts:16`, `apps/talon/src/gateway/auth.ts:238`).
- They are separate trust domains:
  - Task Master -> Talon: uses `TALON_GATEWAY_TOKEN` bearer.
  - Talon tools -> Task Master: uses `TASK_MASTER_API_KEY` as `x-api-key` (`apps/talon/src/agents/tools/task-master-tool.ts:15`, `apps/talon/src/agents/tools/task-master-tool.ts:61`).

---

## Component Design Docs

## 1) Task Master API (Express) Component

### 1.1 Entry points and Talon-related routes
- API server is Express in `apps/task-master/apps/api/src/index.js`.
- Agent management routes:
  - `GET /api/agents` (`apps/task-master/apps/api/src/index.js:969`)
  - `POST /api/agents` (`apps/task-master/apps/api/src/index.js:977`)
  - `PATCH /api/agents/:id` (`apps/task-master/apps/api/src/index.js:1011`)
  - `DELETE /api/agents/:id` (`apps/task-master/apps/api/src/index.js:1053`)
- No `/api/talon` route exists.
- Existing Talon-admin routes are:
  - `GET /api/admin/talon/queue` (`apps/task-master/apps/api/src/index.js:1187`)
  - `POST /api/admin/talon/queue/process` (`apps/task-master/apps/api/src/index.js:1195`)

### 1.2 Talon call flow from Task Master
- Agent sync to Talon registry:
  - `syncAgentToTalon` (`apps/task-master/apps/api/src/index.js:208`)
  - `deleteAgentInTalon` (`apps/task-master/apps/api/src/index.js:298`)
- Task-triggered execution:
  - `triggerTalonSession` (`apps/task-master/apps/api/src/index.js:611`)
  - retries in `callTalonWithRetry` (`apps/task-master/apps/api/src/index.js:319`)
- Jarvis path:
  - `POST /api/jarvis/chat` (`apps/task-master/apps/api/src/index.js:1995`)
- Request builder helpers in `apps/task-master/apps/api/src/talon.js`.

### 1.3 Data model relevant to integration
- `Agent` model fields include `talonWorkspaceId`, `talonAgentId` (`apps/task-master/apps/api/prisma/schema.prisma:189`).
- Task Master API validation still uses payload key `talonId` and remaps to DB `talonAgentId` (`apps/task-master/apps/api/src/index.js:983`, `apps/task-master/apps/api/src/index.js:991`).

### 1.4 Identified risks in this component
- `talonId` is used in DB lookups where schema has `talonAgentId` (`apps/task-master/apps/api/src/index.js:84`, `apps/task-master/apps/api/src/index.js:432`).
- Delete sync uses `agent?.talonId` not `agent?.talonAgentId` (`apps/task-master/apps/api/src/index.js:302`).
- Missing outbound timeout on Talon fetch paths.

---

## 2) Talon Gateway Component

### 2.1 Server framework/protocol reality
- Current Talon gateway is **not Fastify** (no Fastify usage found).
- It is Node HTTP(S) + `ws` WebSocket multiplexing:
  - startup `startGatewayServer` (`apps/talon/src/gateway/server.impl.ts:151`)
  - HTTP server creation (`apps/talon/src/gateway/server-http.ts:276`)
  - WS upgrade attachment (`apps/talon/src/gateway/server-http.ts:419`)

### 2.2 Port and transport
- Default gateway port is 18789 (CLI docs/types indicate this; startup call uses supplied/default port).
- Single port supports:
  - REST endpoints (e.g. `/v1/agents`, `/v1/chat/completions`)
  - WebSocket upgrade on same server

### 2.3 REST endpoints currently wired
- `/v1/agents*` handler: `apps/talon/src/gateway/agent-registry-http.ts:24`
- `/v1/chat/completions`: `apps/talon/src/gateway/openai-http.ts:177`
- Both enforce Bearer auth via `authorizeGatewayConnect`.

### 2.4 Auth enforcement
- Bearer extraction: `apps/talon/src/gateway/http-utils.ts:16`
- Gateway auth decision: `apps/talon/src/gateway/auth.ts:238`
- Shared secret source from `gateway.auth.token` or `TALON_GATEWAY_TOKEN`.

### 2.5 Notable implementation state
- `apps/talon/src/gateway/server-runtime-config.ts:56` currently forces chat completions enabled with debug logging (`:54`, `:56`). This is a local debug state and should be treated carefully.

---

## 3) Provider Auth / OAuth Component (Stage 1 relevance)

### 3.1 Current auth model
- Provider auth is primarily CLI/profile based, not HTTP callback route based.
- Main login command: `models auth login` in `apps/talon/src/commands/models/auth.ts:330`.
- OAuth token/profile resolution and refresh in:
  - `apps/talon/src/agents/model-auth.ts`
  - `apps/talon/src/agents/auth-profiles/oauth.ts`

### 3.2 How OAuth callback is currently handled
- Example flow (Chutes) spins a **local temporary HTTP callback server** in CLI:
  - `waitForLocalCallback` in `apps/talon/src/commands/chutes-oauth.ts:36`
  - default callback URI uses `/oauth-callback` (`apps/talon/src/commands/auth-choice.apply.oauth.ts:15`)
- This is not a gateway `/v1/auth/callback` API.

### 3.3 Stage 1 gap
- There is no existing Talon gateway REST route for `/v1/auth/callback`.
- For API-driven model auth, gateway needs explicit auth endpoints and persistent profile update path in gateway server layer.

---

## 4) Agent Synchronization Component (Task Master -> Talon)

### 4.1 Current sync mechanics
- On agent create/update in Task Master, API pushes to Talon `/v1/agents` or `/v1/agents/:id` using Bearer token (`apps/task-master/apps/api/src/index.js:208`).
- Talon validates against `AgentConfigSchema` and stores in local registry file (`apps/talon/src/agents/registry.ts`).

### 4.2 Payload compatibility
- Task Master sends fields expected by Talon schema (`id`, `name`, `role`, `model`, optional prompt/api fields), so sync shape is largely aligned.
- Key mismatch issues are in Task Master DB lookup helpers (`talonId` vs `talonAgentId`) rather than Talon schema.

### 4.3 Reliability concerns
- `syncAgentToTalon` catches network errors and returns `{ ok: true, warning }`, so local DB may say “synced” when Talon wasn’t updated (`apps/task-master/apps/api/src/index.js:289`).

---

## 5) Deployment / Connectivity Component (Docker)

### 5.1 Service wiring
- Service names `task-master-api` and `talon` are reachable by those DNS names on default compose network.
- Env wiring is correct in principle:
  - Task Master -> Talon URL: `http://talon:18789` (`docker-compose.yml:33`)
  - Talon -> Task Master URL: `http://task-master-api:3333` (`docker-compose.yml:69`)

### 5.2 Root connectivity blocker
- Talon service command is disabled:
  - `sh -c "tail -f /dev/null"` (`docker-compose.yml:80`)
- So Task Master can’t call Talon REST endpoints because gateway process never starts.

### 5.3 REST acceptance from task-master-api container
- Yes, Talon gateway is designed to accept REST from peers if:
  - gateway process is running,
  - auth token matches (`Authorization: Bearer`).

---

## Recommended `/v1/auth/callback` placement and design boundary

- **Primary file to implement routing:** `apps/talon/src/gateway/server-http.ts`
- **Recommended structure:**
  - Add `handleAuthHttpRequest` module (e.g., `apps/talon/src/gateway/auth-http.ts`).
  - Wire it in `handleRequest` chain before 404 in `server-http.ts`.
  - Implement endpoints like:
    - `GET /v1/auth/providers`
    - `POST /v1/auth/start`
    - `POST /v1/auth/callback`
  - Reuse existing auth profile store/update utilities in `apps/talon/src/agents/auth-profiles/*`.

---

## Final Current-State Diagnosis

- Integration plumbing exists (Task Master routes, Talon `/v1/agents`, `/v1/chat/completions`, bearer auth).
- Stage 1 API-driven OAuth is incomplete because gateway auth callback endpoints are absent.
- Runtime failure is currently dominated by Docker Talon service not launching gateway.
- Secondary correctness issues (`talonId` vs `talonAgentId`, missing fetch timeouts, soft-failing sync) will continue to cause intermittent or silent integration failures even after Talon process is started.

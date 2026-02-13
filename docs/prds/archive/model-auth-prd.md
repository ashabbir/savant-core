# PRD: Savant Core – LLM Orchestration & Auth Bridge (Stage 1)

## 1. Document Purpose

This document defines the technical requirements to bridge **Task Master** (Management UI) and **Talon** (AI Runtime). The primary objective is to move from manual CLI-based configuration to an **API-driven Orchestration Layer** where authentication, model discovery, and agent assignment are managed via the web.

---

## 2. System Architecture & Setup

### 2.1 Container Networking & Startup

* **Fix:** The `talon` service in `docker-compose.yml` must be changed from `tail -f /dev/null` to the actual entry point: `node dist/gateway/index.js`.
* **Connectivity:** Task Master API must reach Talon via `http://talon:18789`.
* **Timeouts:** All HTTP calls from Task Master to Talon must implement a **15-second timeout** to prevent UI hanging.

### 2.2 Global Auth Model (The "Keyring")

* **Sourcing Auth:** Talon will no longer require local CLI login. It will expose REST endpoints to receive credentials from the Task Master UI.
* **Persistence:** Auth tokens (OAuth Refresh Tokens or API Keys) are stored in Talon’s persistent volume (`~/.talon/auth-profiles`).

---

## 3. Functional Requirements

### 3.1 LLM Provider Management (New Section)

Create a new **"LLM Providers"** tab in Task Master.

* **Supported Providers:**
* **Google Gemini CLI / Antigravity** (OAuth)
* **OpenAI** (ChatGPT Auth or API Key)
* **Anthropic** (OAuth or API Key)


* **OAuth Flow (Zero-Touch):**
1. User clicks "Connect" in React.
2. Node API calls Talon `/v1/auth/start`.
3. User completes login in a new tab.
4. Redirect hits Task Master API `/api/talon/callback`.
5. Node API relays the `code` to Talon `/v1/auth/exchange`.


* **API Key Flow:** Simple form field that POSTs the key directly to Talon.

### 3.2 Model Discovery

* Once a provider is "Connected," Task Master triggers a discovery call.
* **Endpoint:** `GET talon:18789/v1/providers/models`.
* Talon queries the provider and returns a list of available strings (e.g., `gpt-4o`, `claude-3-opus`).
* Task Master stores these in MongoDB to populate dropdowns.

### 3.3 Agent & Subagent Configuration

* **Renaming:** Rename the current "Agents" tab to **"Subagents"**.
* **Main Agent Settings:** New global UI to select the **Default** and **Fallback** models for the primary system agent.
* **Subagent Logic:**
* In the Subagents UI, add two dropdowns: `Default Model` and `Fallback Model`.
* These dropdowns are filtered based on "Connected" providers.
* **Field Mapping:** Ensure Prisma uses `talonAgentId` consistently.



---

## 4. Implementation Details for AI Agent

### 4.1 Talon Gateway (Fastify)

**File:** `apps/talon/src/gateway/server-http.ts`
Implement the following REST logic:

* `GET /v1/auth/providers`: Returns connection status.
* `POST /v1/auth/exchange`: The "Relay" endpoint to receive credentials.
* `GET /v1/providers/models`: The discovery engine.

### 4.2 Task Master API (Express/Prisma)

**File:** `apps/task-master/apps/api/prisma/schema.prisma`

* Add `defaultModel String?` and `fallbackModel String?` to the `Agent` model.
* **Endpoint:** `/api/talon/callback` to handle the OAuth redirect and forward to Talon.

### 4.3 Task Master Web (React)

**File:** `apps/task-master/apps/web/src/pages/LLMProvidersPage.tsx`

* Build the Provider Grid (Cards for Google, OpenAI, Anthropic).
* Add "Connect" and "Disconnect" state logic.

---

## 5. Definition of Done

1. **Headless Auth:** I can connect a Google Gemini account from the Web UI without opening a terminal.
2. **Model Discovery:** After connecting, the Subagents dropdowns immediately show the available models from that provider.
3. **Fallback Logic:** If I set a fallback model, Talon should attempt to use it if the primary model returns a 429 (Rate Limit) or 500 (Error).
4. **No Mismatches:** The `talonId` vs `talonAgentId` bug is resolved in the delete/sync logic.



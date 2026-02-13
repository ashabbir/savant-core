# PRD: Single Main Agent (Jarvis) + UI-Managed Sub-Agents

## 1) Overview

### 1.1 Problem
Agent routing currently depends on mixed sources (request payload, env fallbacks, DB records), causing ambiguity and failures (e.g., Jarvis chat returning “No agent specified for Jarvis”).

### 1.2 Vision
Adopt a clear agent model:
- **One canonical main agent**: `Jarvis`
- **All other agents are sub-agents**, managed via UI (`/agents` create/index)
- Jarvis chat and system-level actions always resolve through the main agent by default

### 1.3 Outcome
A predictable, resilient architecture where:
- “Jarvis” always works out-of-the-box
- sub-agent lifecycle is fully UI-driven
- Talon sync and identity mapping are consistent

---

## 2) Goals & Non-Goals

### 2.1 Goals
1. Guarantee exactly one main agent exists at all times.
2. Make Jarvis endpoint work without requiring `agentId` in request.
3. Make UI create agents as sub-agents by default.
4. Clearly separate “Main Agent” and “Sub Agents” in UI.
5. Ensure Talon sync uses canonical identifier fields (`talonAgentId`) consistently.

### 2.2 Non-Goals
1. Multi-main-agent orchestration (out of scope).
2. Dynamic policy routing across multiple “main” personas.
3. Full model-registry redesign (reuse existing registry behavior).

---

## 3) User Stories

1. **As Ahmed**, when I open Jarvis Command Bar and send a message, it should always route to Jarvis without manual agent selection.
2. **As an admin**, when I create a new agent in `/agents`, it should be created as a sub-agent by default.
3. **As an admin**, I can explicitly designate a different agent as the new main agent.
4. **As an admin**, I can easily see which agent is Main vs Sub in the agents list.
5. **As system operator**, I can trust migration to safely normalize existing agents without data loss.

---

## 4) Functional Requirements

### 4.1 Data Model
Add one of:
- `Agent.kind: 'main' | 'sub'` (preferred)
- OR `Agent.isMain: boolean`

Constraints:
- exactly one main agent
- DB-level uniqueness guard for main designation (where possible)
- canonical Talon ID field: `talonAgentId`

### 4.2 Jarvis Routing
`POST /api/jarvis/chat` resolution order:
1. explicit request `agentId` (optional override)
2. DB main agent
3. configured fallback (`TALON_DEFAULT_AGENT_ID`) as emergency only
4. explicit actionable 400/503 error with guidance

### 4.3 Agent Management UI
- `/agents` list must show:
  - “Main Agent” section (single record)
  - “Sub Agents” section (list)
- `/agents/create` default => sub-agent
- “Set as Main” action available in edit/list with confirmation modal
- Deleting main agent blocked unless reassignment performed

### 4.4 Talon Sync
- Use `talonAgentId` consistently in create/update and runtime lookup
- Remove inconsistent legacy references (`talonId`)
- Sync behavior identical for main and sub agents, except default routing preference to main

### 4.5 Guardrails
- Prevent multiple main agents through API validation + DB constraints
- All “set main” actions must be atomic (old main demoted, new main promoted)

---

## 5) Migration & Backfill

### 5.1 Migration Rules
On deploy:
1. If no main agent exists:
   - choose `Jarvis` by name if present
   - else choose deterministic first active agent
   - else create `Jarvis`
2. If multiple mains exist:
   - keep one deterministic winner (oldest created)
   - demote all others to sub

### 5.2 Data Integrity
- Preserve all existing agent metadata (model, prompts, guardrails, talonAgentId)
- No deletion during migration

---

## 6) UX Requirements

1. Main agent visually highlighted (badge: “MAIN”).
2. Sub-agent cards continue current behavior.
3. Create flow defaults to sub-agent; no confusion in form labels.
4. Main reassignment must show warning:
   - “Jarvis/default routing will switch immediately.”

---

## 7) API Changes (Proposed)

1. `GET /api/agents`  
   Include `kind` / `isMain`.

2. `POST /api/agents`  
   Default `kind='sub'`.

3. `PATCH /api/agents/:id`  
   Allow promoting/demoting with validation.

4. `POST /api/agents/:id/set-main` (optional convenience endpoint)  
   Atomic reassignment.

5. `POST /api/jarvis/chat`  
   No required `agentId`; resolves via main.

---

## 8) Acceptance Criteria

- [ ] Sending Jarvis message without `agentId` succeeds.
- [ ] Exactly one main agent exists after migration and during runtime.
- [ ] New UI-created agents are sub-agents by default.
- [ ] Main agent shown distinctly in `/agents`.
- [ ] “Set as Main” works atomically and updates routing instantly.
- [ ] Main agent deletion is prevented unless reassigned first.
- [ ] Talon sync/runtime uses `talonAgentId` consistently.
- [ ] No regression in existing agent chat/task flows.

---

## 9) Risks & Mitigations

1. **Risk:** Existing agent key mismatches break Talon routing  
   **Mitigation:** Backfill + validation script, sync smoke test post-migration.

2. **Risk:** Multiple mains from race conditions  
   **Mitigation:** server-side transaction + unique guard.

3. **Risk:** UI confusion during transition  
   **Mitigation:** clear labels, migration note, default-safe behaviors.

---

## 10) Rollout Plan

1. Ship migration + API validation first.
2. Run backfill and resync agents to Talon.
3. Release UI labels and “Set as Main.”
4. Enable Jarvis fallback behavior.
5. Smoke test:
   - Jarvis chat
   - agent create/edit
   - main reassignment
   - task-triggered agent actions

---

## 11) QA Checklist

- [ ] Fresh install with no agents creates Jarvis main correctly
- [ ] Existing install with 1 agent gets marked main
- [ ] Existing install with N agents, no main -> deterministic assignment
- [ ] Existing install with multiple mains -> normalized to one
- [ ] Jarvis chat works before/after page refresh
- [ ] Agent CRUD unaffected for sub-agents
- [ ] Talon receives expected agent IDs

# PRD: Single Main Agent (Jarvis) with UI-Managed Subagents

## 1. Summary

Savant Core must enforce a single-agent hierarchy:
- One hard-coded main agent: `jarvis`
- All other agents are subagents under `jarvis`
- Subagents are created and managed from Task Master UI

This replaces the current ambiguous "multiple top-level agents" behavior.

## 2. Problem

Current behavior mixes concepts:
- Talon registry can contain multiple top-level agents
- Task Master UI treats non-main agents as peers, but runtime resolution is inconsistent
- Jarvis chat and runtime sessions may not map cleanly to a single canonical parent agent

Result: confusion in routing, reporting, and configuration.

## 3. Goals

1. Enforce exactly one main agent identity: `jarvis`.
2. Ensure all user-created agents are subagents.
3. Represent and persist subagent ownership under Jarvis.
4. Keep Jarvis available even when no subagents exist.
5. Keep migration safe for existing data.

## 4. Non-Goals

1. Multiple main agents/personas.
2. Nested subagent trees (subagent of subagent).
3. Redesign of model provider registry beyond what is needed for hierarchy.

## 5. Core Product Rules

1. `jarvis` is system-defined and non-deletable.
2. `jarvis` is not created from UI and cannot be converted to subagent.
3. Every non-jarvis agent is a subagent.
4. Every subagent has a parent agent id equal to `jarvis`.
5. UI "Create Agent" means "Create Subagent".

## 6. Functional Requirements

### 6.1 Agent Hierarchy

- System must expose hierarchy metadata for every agent:
  - `type`: `main` or `subagent`
  - `parentAgentId`: nullable for main, required for subagents
- `jarvis` must always resolve as `type=main`.

### 6.2 Subagent Lifecycle (UI)

- In Task Master `/agents`:
  - show `Jarvis (Main Agent)` in a dedicated section
  - show subagents in a second section
- Create flow:
  - label/button copy updated to "Create Subagent"
  - backend sets `type=subagent`, `parentAgentId=jarvis`
- Edit flow:
  - can update subagent fields (name, role, models, prompts)
  - cannot change parent away from Jarvis in v1
- Delete flow:
  - allowed only for subagents
  - blocked for Jarvis

### 6.3 Runtime Routing

- Jarvis Command Bar uses main agent identity by default (`jarvis`).
- Task and comment automation that targets specific helpers must target subagents.
- Any API that accepts agent id must validate:
  - `jarvis` is valid main
  - non-jarvis ids must exist as subagents

### 6.4 Talon Sync

- Talon sync payload includes hierarchy fields (`type`, `parentAgentId`) or equivalent compatible mapping.
- If Talon lacks native hierarchy fields, Task Master keeps source-of-truth hierarchy and syncs compatible metadata.
- `talonAgentId` remains canonical external id for runtime calls.

## 7. API Requirements

### 7.1 Task Master API

- `GET /api/agents`
  - returns Jarvis + subagents with hierarchy fields
- `POST /api/agents`
  - creates subagent only
  - server ignores/rejects attempts to create another main agent
- `PATCH /api/agents/:id`
  - prevents changing Jarvis type
  - prevents promoting subagent to main in v1
- `DELETE /api/agents/:id`
  - rejects delete for Jarvis

### 7.2 Talon API / Gateway Expectations

- `GET /v1/agents` must be interpretable as:
  - one main (`jarvis`)
  - remaining records are subagents
- If needed, add dedicated endpoint in Task Master facade:
  - `GET /api/jarvis/agents-hierarchy`
  - normalized response shape for UI

## 8. Data Model Requirements

Add/normalize these fields in Task Master `Agent` model:
- `type` enum: `MAIN | SUBAGENT`
- `parentAgentId` (nullable for MAIN; required for SUBAGENT)
- `isSystem` boolean (true for Jarvis)

Constraints:
1. exactly one `MAIN`
2. `MAIN` must have `name='Jarvis'` and stable id/slug `jarvis`
3. every `SUBAGENT` must reference existing `MAIN` via `parentAgentId`
4. cannot delete `isSystem=true` row

## 9. Migration / Backfill

### 9.1 Existing Data Conversion

On migration:
1. Ensure Jarvis exists; create if missing.
2. Mark Jarvis as `MAIN`, `isSystem=true`.
3. Convert all other agents to `SUBAGENT`.
4. Set all subagents `parentAgentId` to Jarvis.
5. Preserve model/prompt/status/talonAgentId fields.

### 9.2 Safety

- Migration must be idempotent.
- No hard deletes.
- Log conversion summary (counts and ids changed).

## 10. UX Requirements

1. Main section is read-only except model/prompt tuning allowed by admin policy.
2. Subagent list supports search/filter as today.
3. Copy changes:
  - "Agents" -> "Subagents" where context is non-main.
4. Any forbidden action on Jarvis shows explicit error text.

## 11. Acceptance Criteria

1. System always has exactly one main agent (`jarvis`).
2. Creating from UI always creates a subagent under Jarvis.
3. Jarvis cannot be deleted from API or UI.
4. `/api/agents` clearly distinguishes main vs subagents.
5. Existing installations migrate without data loss.
6. Jarvis chat still works after migration.

## 12. Open Decisions

1. Should Jarvis row be fully immutable or partially editable (model/prompt only)?
2. Do we enforce canonical id string `jarvis` at DB layer or via service validation only?
3. Should Talon expose first-class subagent endpoint, or should Task Master own hierarchy projection?

## 13. Rollout Plan

1. Ship schema + migration.
2. Ship API validation and hierarchy response.
3. Update UI labels/flows for subagents.
4. Update Talon sync adapter.
5. Run smoke checks (create/edit/delete subagent, jarvis chat, task routing).

# Task Master & Talon Workflow Integration - PRD

**Goal:** Seamlessly connect Task Master (TM) with Talon for automated task execution and agent management.

**Status:** Phase 5 - Competitive Parity & Real-time Features (Completed)

---

## Summary

This PRD outlines the integration between Task Master (the task management system) and Talon (the AI agent execution platform). The integration enables automated task fulfillment by AI agents, human-in-the-loop collaboration via task comments, and centralized agent management within Task Master.

---

## Functional Requirements (Completed)

### 1. Provider & Model Management (LLM Registry)
*   **Provider Registration**: Admins can register AI providers (Google, OpenAI, Anthropic, Ollama, Azure) with encrypted credential storage.
*   **Connectivity Validation**: "Test Connection" button verifies provider reachability and credentials.
*   **Model Discovery**: Fetch available models directly from providers (e.g., Google `v1/models`, Ollama `api/tags`).
*   **Agent Selection**: Agents can be assigned to a specific registered model, replacing manual model strings with a structured selection.

### 2. Real-time Collaboration (WebSockets)
*   **Instant Updates**: Current polling mechanism replaced with **WebSocket (`socket.io`)** broadcasts.
*   **Live Events**: Creating, moving, or updating tasks, and posting comments, triggers instant UI updates across all clients.

### 3. Global Orchestration (Jarvis Mode)
*   **Global Command Bar**: A persistent UI element (Cmd+K) allowing chat with a main agent session from any page.
*   **Project-wide Context**: Jarvis can answer questions and perform actions across the entire board, not just specific tasks.

### 4. Expert Summons (@Mentions)
*   **Auto-Spawning**: @mentioning an agent (e.g., `@architect`) in a comment automatically spawns a specialized Talon session for that agent with the ticket's full context.

### 5. Formalized Agent Lifecycle
*   **Explicit Lifecycle**: Implemented `/start-work` and `/stop-work` endpoints.
*   **Tool Integration**: Talon's `task_master` tool updated to allow agents to precisely signal their progress and blockages.

---

## Technical Specifications

### 1. Real-time Protocol
**Technology:** `socket.io` (v4)
**Events:**
*   `task.create`: Broadcasts new task data.
*   `task.move`: Broadcasts status changes and column transitions.
*   `task.update`: Broadcasts general field updates (Title, Desc, Assignee).
*   `task.comment`: Broadcasts new comments in real-time.

### 2. Jarvis API
**Endpoint:** `POST /api/jarvis/chat`
**Description:** Routes a global chat message to the configured main agent using a persistent `jarvis:<username>` session key.

### 3. Agent Lifecycle API
**Endpoints:**
*   `POST /api/tasks/:id/start-work`: Moves task to `Inprogress` and sets agent status to `active`.
*   `POST /api/tasks/:id/stop-work`: Moves task to `Review` (or `Blocked`) and sets agent status to `idle`.

---

## Success Criteria Checklist
- [x] Admin can add/test LLM providers.
- [x] Board updates instantly when an agent moves a card (verified via WebSockets).
- [x] @Mentioning an agent in a comment spawns a Talon session.
- [x] Cmd+K opens the Jarvis command bar on any page.
- [x] Agent posts "I'm on it" to the Task ticket via `start-work`.
- [x] User reply is forwarded to the active Agent session.
- [x] Agent moves Task to "Review" via `stop-work` when finished.

---

# Roadmap Status

## PROJECT: Talon (Agent Runtime) - **COMPLETED**
*   **Epic 1: Dynamic Agent Management via API** (Done)
*   **Epic 2: Task Execution & Session Handling** (Done)

## PROJECT: Task Master (Management UI) - **COMPLETED**
*   **Epic 3: Agent Configuration UI** (Done)
*   **Epic 4: Workflow Automation (Triggers)** (Done)
*   **Epic 5: Competitive Parity & Real-time Features** (Done)

---

## Implementation Notes

### Security
- API keys encrypted at rest using AES-256-GCM.
- Credential selection prevents manual string exposure in the UI.

### Theming
- High-fidelity **Light Mode** implemented and verified across all components (TaskCard, EpicCard, UserEditDrawer, AppHeader).
- Hardcoded colors replaced with dynamic CSS variables.

*Last Updated: 2026-02-10*

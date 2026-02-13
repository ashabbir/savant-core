# Task Master API Test Cases (Today Features)

## Scope
- Agent lifecycle updates (create/update/delete behavior constraints)
- Jarvis chat/session behavior and error mapping
- Ticket-scoped agent chat and context injection
- Project analysis pipeline (async job, DB persistence, multi-file markdown)
- Provider OAuth callback integration updates

## Environment
- API running on `http://localhost:3333`
- Valid admin API key and member API key
- Talon gateway configured and reachable
- MongoDB running with latest Prisma schema pushed

## A. Agent CRUD and Constraints
1. Delete agent with dependent rows is blocked or handled safely
- Preconditions: Agent has related `AgentMessage` rows.
- Steps:
1. Call `DELETE /api/agents/:id`.
- Expected:
1. API does not silently leave dangling references.
1. API returns a deterministic result (success with cleanup or explicit error with reason).
1. No partial deletion state.

2. Delete protected main Jarvis agent is blocked
- Preconditions: Target agent is main/system Jarvis record.
- Steps:
1. Call `DELETE /api/agents/:jarvisId`.
- Expected:
1. 4xx response with message that Jarvis/system agent cannot be deleted.

3. Create agent persists orchestration model fields
- Preconditions: Valid payload includes primary/fallback model values.
- Steps:
1. Call `POST /api/agents`.
1. Read back via `GET /api/agents-hierarchy`.
- Expected:
1. `defaultModel` and `fallbackModel` are persisted exactly.
1. No fallback to legacy `custom(legacy)` unless explicitly provided.

4. Auto Talon agent id is safe and normalized
- Preconditions: Create agent with special chars in name/model.
- Steps:
1. Call `POST /api/agents` with name/model containing spaces/special chars.
1. Read created row.
- Expected:
1. `talonAgentId` is generated in safe normalized format and unique.

## B. Jarvis Sessions and Chat
5. Jarvis chat upstream 404/provider-key failures do not return misleading success text
- Preconditions: Force upstream provider error.
- Steps:
1. Call `POST /api/jarvis/chat`.
- Expected:
1. API returns appropriate error or recovered response.
1. No successful API response carrying only raw `HTTP 404` passthrough text as final answer.

6. Jarvis sessions transcript endpoint returns messages by session key
- Steps:
1. Create chat turns in one session.
1. Call `GET /api/jarvis/sessions/transcript?sessionKey=...`.
- Expected:
1. Returns full ordered transcript for that session.

7. Jarvis delete session endpoint removes session without extra confirmation dependency
- Steps:
1. Call `DELETE /api/jarvis/sessions?sessionKey=...`.
1. Re-query sessions list.
- Expected:
1. Session no longer exists in list/transcript.

## C. Ticket Agent Chat
8. Ticket chat resolves assignee preferred agent
- Preconditions: Ticket assignee has `preferredAgentId`.
- Steps:
1. Call `POST /api/tasks/:taskId/agent-chat`.
- Expected:
1. Uses assignee preferred agent key for routing.

9. Ticket chat fallback resolves by assignee when preferred agent absent
- Preconditions: Assignee has no preferred agent, matching agent exists by name/id/talon id.
- Steps:
1. Call `POST /api/tasks/:taskId/agent-chat`.
- Expected:
1. Chat still routes to resolved agent.

10. Ticket transcript endpoint returns stable task-scoped session history
- Steps:
1. Send two ticket chat turns.
1. Call `GET /api/tasks/:taskId/agent-chat/transcript`.
- Expected:
1. Returns both turns and consistent session key.

11. Context is injected at session start
- Steps:
1. Reset ticket chat.
1. Send first message.
- Expected:
1. Response payload includes `contextualized: true`.

12. Context refreshes after ticket update (contextVersion change)
- Steps:
1. Send one message.
1. Update ticket title/description.
1. Send next message in same session.
- Expected:
1. Context is re-injected for updated version.
1. `contextualized: true` on post-update message.

13. Restart chat removes all sessions related to ticket
- Steps:
1. Create multiple ticket-related sessions (including health suffix if present).
1. Call `POST /api/tasks/:taskId/agent-chat/reset`.
- Expected:
1. Response includes `removedSessions > 0`.
1. Follow-up transcript returns empty conversation.

14. Test ping endpoint returns online/offline deterministically
- Steps:
1. Call `POST /api/tasks/:taskId/agent-chat/test`.
- Expected:
1. Returns `status: online` on success.
1. Returns `status: offline` on upstream failure.

15. Ticket chat includes project analysis context when available
- Preconditions: Project analysis exists in DB.
- Steps:
1. Call ticket chat.
- Expected:
1. Prompt context includes project analysis metadata and summary.

## D. Project Analysis (Async + Multi-File Markdown in DB)
16. Start analysis returns accepted queued/running job
- Steps:
1. Call `POST /api/projects/:projectId/analysis/run`.
- Expected:
1. Immediate success with `accepted: true`, `jobId`, and `status=queued|running`.

17. Duplicate run while active does not start second job
- Preconditions: Existing queued/running job.
- Steps:
1. Call run endpoint again.
- Expected:
1. Returns existing active state (`alreadyRunning: true`), no duplicate processing.

18. Analysis polling endpoint reflects lifecycle
- Steps:
1. Poll `GET /api/projects/:projectId/analysis`.
- Expected:
1. Status transitions through `queued/running/complete` or `failed`.
1. `lastError` populated on failure path.

19. Successful analysis stores markdown report in DB
- Steps:
1. Run analysis to completion.
1. Read analysis row.
- Expected:
1. `reportMarkdown` contains markdown content.
1. `generatedAt`, `generatedBy`, `model` are populated.

20. Successful analysis stores multiple markdown files in DB
- Steps:
1. Run analysis.
1. Read analysis with included files.
- Expected:
1. `files` array has 1..N file records.
1. Every file has `filePath`, `title`, `contentMarkdown`, `order`.

21. Auth/provider failure path attempts fallback models
- Preconditions: Primary Jarvis provider key missing.
- Steps:
1. Run analysis.
- Expected:
1. Job retries direct model candidates.
1. Job completes if fallback model available.
1. Job fails with clear `lastError` otherwise.

22. Backward compatibility payload fields remain
- Steps:
1. Fetch analysis endpoint.
- Expected:
1. Response still includes `report` alias in addition to `reportMarkdown`.

## E. OAuth and Auth Flow API Contracts
23. Talon OAuth callback endpoint is not blocked by API-key middleware
- Steps:
1. Call `GET /api/talon/callback?...` without `x-api-key`.
- Expected:
1. Endpoint processes callback path instead of returning API unauthorized due to Task Master auth middleware.

24. Talon OAuth callback stores/returns deterministic success payload
- Steps:
1. Complete provider OAuth flow.
1. Observe callback response body.
- Expected:
1. Response uses stable JSON shape indicating success/failure.
1. No ambiguous HTML-only response for normal success path.

25. OpenAI Codex OAuth start endpoint is exposed and redirect-ready
- Steps:
1. Call API route used by UI to initiate `openai-codex` auth.
- Expected:
1. Returns redirect URL or redirect response with expected callback target.

## F. API/UI Consistency Contracts
26. Jarvis chat upstream failure returns non-2xx when unrecoverable
- Steps:
1. Force upstream 404/failover exhaustion.
1. Call `POST /api/jarvis/chat`.
- Expected:
1. API returns explicit error status (4xx/5xx) for unrecoverable failure.
1. Does not return `200 OK` with failed text payload masquerading as valid assistant answer.

27. Ticket chat transcript persists across client reconnects
- Steps:
1. Send ticket chat turns.
1. Re-call transcript endpoint from fresh client context.
- Expected:
1. Full prior transcript is returned from persisted session state.

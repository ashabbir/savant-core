# Task Master Web Test Cases (Today Features)

## Scope
- Agent CRUD UX consistency and immediate list refresh
- Agent create/edit model selection and Talon ID handling
- Sub-agent modal parity with edit tabs
- Agent health/test status rendering
- Jarvis chat UX flows (footer entry, sessions, deletion, persistence)
- Ticket edit agent chat and session lifecycle
- Project analysis tab, async job UX, markdown file viewer
- OAuth UI entry points and callback handling expectations

## Environment
- Web app running on `http://localhost:5173`
- API on `http://localhost:3333`
- Talon gateway reachable for chat/test actions
- Browser localStorage available

## A. Agent CRUD UX
1. Delete provider/agent removes row from UI without manual refresh
- Preconditions: At least two non-protected agents exist.
- Steps:
1. Delete one agent from UI.
- Expected:
1. Loading state shows progress.
1. After success, deleted row disappears immediately.
1. No full-page refresh required.

2. Delete with server failure keeps row and surfaces error
- Preconditions: Delete target that backend rejects (dependency/constraint).
- Steps:
1. Attempt delete.
- Expected:
1. Error message visible.
1. Agent remains in list.
1. No optimistic ghost removal.

3. Create agent appears immediately in hierarchy/list
- Steps:
1. Submit create form.
- Expected:
1. Success feedback shown.
1. New agent appears immediately in current list/drawer.

4. Edit agent updates list card fields without browser reload
- Steps:
1. Change name/model fields and save.
- Expected:
1. Updated values render immediately in same view.

## B. Create/Edit Agent Form
5. Model fields are `Primary` and `Fallback` using registered models
- Steps:
1. Open create modal.
- Expected:
1. No legacy `custom(legacy)` default shown.
1. Both dropdowns populated from registered model catalog.

6. Talon agent id is auto-generated safe string
- Steps:
1. Create agent with spaces/special chars in name.
- Expected:
1. Stored/generated id follows safe `talon:AGENTNAME:MODEL` normalized pattern.

7. Talon agent id shown as read-only in edit form
- Steps:
1. Open existing agent in edit mode.
- Expected:
1. Talon ID field visible.
1. Field is non-editable/read-only.

8. Sub-agent create modal tab parity with edit page
- Steps:
1. Open create sub-agent modal.
- Expected:
1. Tabs include `Meta`, `Soul`, `Guardrails`, `Bootstrap`, `Context`.
1. Tab switching preserves unsaved values in each tab.

## C. Agent Health and Status
9. Manual test action exists and triggers ping
- Steps:
1. Click `Test`/ping action for an agent.
- Expected:
1. Request sent.
1. Status indicator updates based on result.

10. Status rendering rules
- Steps:
1. Open agent list before any test.
1. Trigger successful test.
1. Trigger failing test.
- Expected:
1. Before test: no status badge text shown.
1. Success: green `online` badge.
1. Failure: red `offline` badge.
1. `unknown` is never displayed.

## D. Jarvis Chat Panel
11. Jarvis chat button is in app footer
- Steps:
1. Open app shell.
- Expected:
1. Jarvis entry point located in footer region.

12. New session + message response does not silently pass 404 text as success
- Steps:
1. Send prompt that causes upstream routing issue.
- Expected:
1. UI shows error state (or explicit failure), not misleading successful assistant response containing only `HTTP 404`.

13. Session deletion is one-click, no confirmation popup
- Steps:
1. Click delete icon on a session.
- Expected:
1. Session deletes immediately.
1. No blocking confirmation dialog appears.

14. Deleting active session navigates safely
- Steps:
1. Open a session.
1. Delete that same session.
- Expected:
1. UI switches to valid fallback session/new state.
1. No follow-up request to deleted session path.
1. No 404 visible in UI.

15. Switching sessions preserves per-session transcript
- Steps:
1. Send messages in session A.
1. Switch to session B and send message.
1. Switch back to session A.
- Expected:
1. Session A transcript still visible and intact.

16. Session persistence across reload/logout
- Steps:
1. Create/send messages in session.
1. Reload app and/or logout-login.
- Expected:
1. Session list and transcript can be restored from server-backed transcript API.

## E. Ticket Edit Agent Chat
17. Ticket edit screen exposes Agent Chat tab
- Steps:
1. Open ticket edit.
- Expected:
1. Agent chat tab/section is present and usable in-ticket.

18. Ticket chat initial send gets staged context behavior
- Steps:
1. Open ticket chat on fresh session.
1. Send first question.
- Expected:
1. Reply quality indicates ticket/project context was preloaded.
1. No generic “please provide ticket details” response when details exist.

19. Restart chat clears all ticket-linked sessions
- Steps:
1. Exchange multiple turns.
1. Click restart chat.
- Expected:
1. All related sessions for this ticket are cleared.
1. Conversation view resets to empty new start.

20. Closing/reopening ticket keeps transcript
- Steps:
1. Chat in ticket.
1. Close ticket drawer/page.
1. Reopen same ticket chat.
- Expected:
1. Previous conversation for that ticket remains available.

## F. Project Analysis UI
21. Analysis tab exists in project setup/detail
- Steps:
1. Open project setup/detail view.
- Expected:
1. Third tab `Analysis` is visible.

22. `Jarvis Analysis` button starts async run
- Steps:
1. Click `Jarvis Analysis`.
- Expected:
1. UI shows queued/running state immediately.
1. User can navigate away while job continues.

23. Completion bubble/notification appears when async analysis ends
- Steps:
1. Start analysis.
1. Wait for complete.
- Expected:
1. Bubble notification displayed at completion.

24. Analysis files list renders markdown artifacts
- Steps:
1. Open completed analysis.
- Expected:
1. Multiple files are listed as links.
1. Clicking file opens markdown viewer for that file.

25. Analysis failure shows actionable auth/provider error
- Steps:
1. Trigger run with missing provider key.
- Expected:
1. Error state visible with useful details.
1. UI does not claim success.

## G. OAuth Flows (UI Contract)
26. Google Gemini OAuth start flow redirects correctly
- Steps:
1. Start Gemini OAuth from provider settings.
- Expected:
1. Browser opens Google consent URL with callback to `/api/talon/callback`.

27. OpenAI Codex OAuth entry is visible and uses callback flow
- Steps:
1. Open provider auth options.
- Expected:
1. `openai-codex` OAuth option is available.
1. Flow routes back to local callback endpoint.

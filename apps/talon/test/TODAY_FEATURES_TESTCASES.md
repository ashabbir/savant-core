# Talon Test Cases (Today Features)

## Scope
- Jarvis routing/session behavior fixes
- Session deletion and transcript consistency
- Upstream error mapping (404/provider/auth)
- OAuth provider callback behavior
- Agent auth-profile selection and fallback behavior
- Async analysis execution dependencies

## Environment
- Talon gateway running (default `http://localhost:18789`)
- Task Master API configured to call Talon gateway
- Test agents configured in Talon data store
- Provider auth profiles available for success scenarios

## A. Session and Chat Routing
1. Chat requests route to correct backend for configured Jarvis model
- Preconditions: Jarvis configured to Ollama-backed model.
- Steps:
1. Send chat for Jarvis session.
- Expected:
1. Provider route uses Ollama path.
1. No accidental hard-route to Gemini provider.

2. Missing provider credentials return deterministic failure
- Preconditions: Remove auth for selected provider.
- Steps:
1. Send chat request.
- Expected:
1. Failure includes clear provider + auth-store hint.
1. Does not silently fallback to unrelated provider unless configured.

3. Upstream 404 is surfaced as transport/provider error type
- Steps:
1. Force backend 404 from upstream.
- Expected:
1. Talon response marks request as failed.
1. Does not emit assistant text payload containing only `HTTP 404` as success.

## B. Session Lifecycle
4. Session transcript stores turns and reads back in order
- Steps:
1. Send multiple turns in one session key.
1. Read transcript.
- Expected:
1. Ordered user/assistant turn sequence preserved.

5. DELETE session endpoint removes in-memory and persisted transcript
- Steps:
1. Create session and transcript file/state.
1. Call `DELETE /v1/sessions?sessionKey=...`.
1. Read transcript/list again.
- Expected:
1. Session unavailable after delete.
1. Transcript file/state removed.

6. Deleting current session does not poison subsequent requests
- Steps:
1. Delete active session.
1. Create/send in new session.
- Expected:
1. New session works.
1. No stale lookup causing 404 loop.

## C. Agent Resolution and Preferred Provider Behavior
7. Named agent resolution supports talon ID and mapped aliases
- Steps:
1. Route request using `talon:...` id.
1. Route request using alias if supported.
- Expected:
1. Both resolve to same configured agent.

8. Provider selection honors agent primary/fallback model chain
- Preconditions: Agent has primary + fallback models.
- Steps:
1. Fail primary provider auth.
1. Invoke request.
- Expected:
1. Talon tries fallback candidate(s).
1. Completes when fallback auth/model valid.

## D. OAuth Callback Behavior
9. `/api/talon/callback` path accepts provider callback without API key gate
- Steps:
1. Simulate OAuth callback request.
- Expected:
1. Callback accepted and processed without standard API-key auth middleware.

10. OpenAI Codex OAuth callback stores usable auth profile
- Steps:
1. Complete OpenAI Codex OAuth login.
1. Invoke agent using `openai-codex` provider.
- Expected:
1. Auth profile persisted for target agent/profile.
1. Next request authenticates successfully.

11. OAuth error states are normalized
- Steps:
1. Trigger provider denial/unknown error.
- Expected:
1. Talon emits stable error payload suitable for API/UI display.

## E. Analysis Agent Runtime Behavior
12. Analysis worker can run without hard dependency on Anthropic when fallback exists
- Preconditions: Anthropic key missing, fallback model available.
- Steps:
1. Trigger analysis run through API integration.
- Expected:
1. Talon model selection moves to fallback candidate.
1. Analysis can complete if fallback is valid.

13. Analysis run fails with actionable error when all providers unavailable
- Preconditions: Remove all relevant auth profiles.
- Steps:
1. Trigger analysis.
- Expected:
1. Failure contains provider-specific missing-auth message and agent auth-store path.

14. Concurrent analysis requests do not create Talon runtime conflict
- Steps:
1. Send near-simultaneous analysis triggers for same project.
- Expected:
1. Runtime processes single logical flow (or safely isolates); no corrupted outputs.

## F. Regression Guards
15. Existing gateway control UI tests still pass with new session deletion behavior
- Steps:
1. Run gateway/control test suite.
- Expected:
1. No regressions in control UI behavior.

16. Existing provider contract tests pass after chat error-shape changes
- Steps:
1. Run provider/inbound contract tests.
- Expected:
1. Contract remains compatible with API expectations.

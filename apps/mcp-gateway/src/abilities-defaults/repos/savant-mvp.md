---
id: repo.savant-mvp
type: repo
name: Savant MVP
aliases: [savant-mvp, savant, savant-app]
tags: [backend, frontend]
priority: 950
includes:
  - rules.backend.base
  - rules.frontend.base
  - policies.style.base
---
Repository Constraints: Savant MVP (sample)

- Languages/Runtime: Python 3.10+; TypeScript 5+.
- CLI: Use Click for Python CLIs; keep flags consistent.
- Testing: Pytest/Vitest; fast, isolated tests; add smoke tests for new flows.
- Migrations: reversible, idempotent; document rollout/backout steps.
- Security: never commit secrets; validate inputs; principle of least privilege.
- Observability: structured logs; key metrics for new surfaces.
- CI: deterministic builds; lint + type check required; PRs must be green.
- Frontend: a11y-first; no direct network calls from UI without data layer.
- Docs: update README or ADRs for notable changes and decisions.

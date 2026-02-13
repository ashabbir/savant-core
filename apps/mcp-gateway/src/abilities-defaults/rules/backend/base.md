---
id: rules.backend.base
type: rule
tags: [backend]
priority: 900
includes: []
---
- Prefer readability over micro-optimizations unless profiling indicates otherwise.
- Validate inputs and sanitize outputs; avoid footguns.
- Errors: use typed exceptions, avoid silent failures, include context.
- Data: migrations must be reversible; backfill with throttling.
- Concurrency: protect shared state, mind transactions and isolation.
- Observability: add metrics and structured logs for new surfaces.
- Interfaces: keep contracts small; document versioning and deprecations.
- Tests: cover critical logic and edge cases; add smoke/integration where needed.


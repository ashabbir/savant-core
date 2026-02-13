---
id: rules.backend.node.express_api
type: rule
tags: [backend, node, api, express]
priority: 905
includes: []
---
- Use middleware for auth/logging; keep handlers small.
- Validate request schemas (e.g., zod/joi); sanitize outputs.
- Centralize error handling; return consistent error shapes.
- Implement rate limiting and timeouts for external calls.


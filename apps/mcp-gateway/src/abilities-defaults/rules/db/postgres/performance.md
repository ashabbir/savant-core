---
id: rules.db.postgres.performance
type: rule
tags: [database, postgres, performance]
priority: 905
includes: []
---
- Avoid N+1; batch queries; prefer set-based operations.
- Add appropriate indexes; watch for bloat; analyze vacuum settings.
- Use EXPLAIN/ANALYZE before optimization; measure improvements.


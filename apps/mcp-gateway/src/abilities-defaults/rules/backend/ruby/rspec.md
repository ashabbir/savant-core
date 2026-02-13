---
id: rules.backend.ruby.rspec
type: rule
tags: [backend, ruby, rspec]
priority: 905
includes: []
---
- Prefer request/model specs over controller specs; test behavior not internals.
- Use factories minimally; favor explicit setup; avoid database when unnecessary.
- Name examples clearly; one expectation per behavior; use shared examples wisely.
- Keep specs fast and deterministic; isolate side effects.


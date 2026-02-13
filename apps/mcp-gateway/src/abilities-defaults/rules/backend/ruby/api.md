---
id: rules.backend.ruby.api
type: rule
tags: [backend, ruby, api]
priority: 905
includes: []
---
- Prefer RESTful routes and resourceful controllers; keep controllers thin.
- Use serializers/presenters for response shape; avoid leaking AR models.
- Validate inputs with strong parameters; return typed, actionable errors.
- Pagination, filtering, sorting must be explicit and bounded.
- Enforce idempotency for PUT/PATCH; avoid side effects on GET.


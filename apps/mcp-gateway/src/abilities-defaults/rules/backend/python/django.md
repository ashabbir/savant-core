---
id: rules.backend.python.django
type: rule
tags: [backend, python, django]
priority: 905
includes: []
---
- Keep fat models, thin views; business logic in services.
- Use select_related/prefetch_related to avoid N+1 queries.
- Prefer explicit migrations; avoid raw SQL unless necessary.
- Validate inputs in forms/serializers; return DRF Response for APIs.


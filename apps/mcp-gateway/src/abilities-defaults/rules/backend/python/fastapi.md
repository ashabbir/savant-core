---
id: rules.backend.python.fastapi
type: rule
tags: [backend, python, api, fastapi]
priority: 905
includes: []
---
- Prefer Pydantic models for request/response; validate strictly.
- Use dependency injection for auth/db; avoid globals.
- Return typed, consistent error shapes; document with OpenAPI.
- Add pagination, filtering, and sorting semantics explicitly.


---
id: rules.backend.python.pytest
type: rule
tags: [backend, python, testing, pytest]
priority: 905
includes: []
---
- Favor small, isolated tests; use fixtures thoughtfully.
- Avoid global state; use tmp_path and monkeypatch for isolation.
- Mark slow/network tests; keep unit tests fast.


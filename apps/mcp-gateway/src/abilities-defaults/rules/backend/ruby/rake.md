---
id: rules.backend.ruby.rake
type: rule
tags: [backend, ruby, rake]
priority: 905
includes: []
---
- Name tasks with namespaces; provide `--dry-run` where meaningful.
- Make tasks idempotent and restartable; log progress with timing.
- Guard dangerous tasks with confirmations and environment checks.
- Keep tasks small; orchestrate via Compose tasks rather than monoliths.


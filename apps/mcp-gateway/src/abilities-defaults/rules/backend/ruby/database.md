---
id: rules.backend.ruby.database
type: rule
tags: [backend, ruby, database]
priority: 905
includes: []
---
- Migrations: reversible, idempotent; avoid destructive changes in one step.
- Data Migrations: perform in batches; throttle; monitor; retry-safe.
- Seeding: use transactional seeds; no production-only secrets; idempotent.
- Indexing: add indexes for new FKs and query patterns; consider partial indexes.
- Constraints: prefer DB constraints (FK, CHECK) alongside model validations.


---
id: rules.db.redis.caching
type: rule
tags: [database, redis, caching]
priority: 905
includes: []
---
- Use TTLs for all caches; avoid unbounded keys.
- Version cache keys; handle stampede with locks/backoff.
- Monitor hit rate and memory; avoid large payloads.


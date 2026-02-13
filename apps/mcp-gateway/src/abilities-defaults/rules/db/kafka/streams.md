---
id: rules.db.kafka.streams
type: rule
tags: [database, kafka, streaming]
priority: 905
includes: []
---
- Use schemas and versioning; validate events at ingress.
- Design idempotent consumers; handle rebalances and retries.
- Monitor lag, DLQs; backpressure upstream on failure.


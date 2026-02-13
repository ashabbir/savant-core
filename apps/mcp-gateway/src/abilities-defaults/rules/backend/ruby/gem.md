---
id: rules.backend.ruby.gem
type: rule
tags: [backend, ruby, gem]
priority: 905
includes: []
---
- Keep public API minimal and well-documented; use semantic versioning.
- Avoid global state; prefer dependency injection and configuration objects.
- Provide thorough tests; document supported Ruby/Rails versions.
- Avoid heavy runtime deps; prefer optional integrations behind feature flags.
- Ship a CHANGELOG and README with examples.


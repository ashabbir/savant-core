---
id: rules.infra.docker
type: rule
tags: [infra, docker]
priority: 905
includes: []
---
- Use small base images; pin versions; avoid root.
- Multi-stage builds; cache layers; no secrets in image.
- Healthchecks; explicit ENTRYPOINT/CMD; minimal privileges.


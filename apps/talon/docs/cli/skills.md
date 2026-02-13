---
summary: "CLI reference for `talon skills` (list/info/check) and skill eligibility"
read_when:
  - You want to see which skills are available and ready to run
  - You want to debug missing binaries/env/config for skills
title: "skills"
---

# `talon skills`

Inspect skills (bundled + workspace + managed overrides) and see what’s eligible vs missing requirements.

Related:

- Skills system: [Skills](/tools/skills)
- Skills config: [Skills config](/tools/skills-config)
- Talon Registry installs: [Talon Registry](/tools/talon-registry)

## Commands

```bash
talon skills list
talon skills list --eligible
talon skills info <name>
talon skills check
```

---
id: rules.ci.github_actions
type: rule
tags: [ci, github_actions]
priority: 905
includes: []
---
- Pin action versions with SHAs; avoid latest.
- Cache dependencies; split jobs for parallelism; fail fast.
- Upload artifacts for debugging; protect main with required checks.


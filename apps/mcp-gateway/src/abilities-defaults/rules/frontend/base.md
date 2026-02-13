---
id: rules.frontend.base
type: rule
tags: [frontend]
priority: 900
includes: []
---
- Accessibility-first: semantic HTML, labels, focus order, ARIA where needed.
- Responsive design; prefer fluid layouts and system sizing.
- State: keep local; lift when shared; avoid unnecessary global stores.
- Performance: memoize hot components; defer heavy work; virtualize lists.
- Errors: show actionable messages; never swallow failures silently.
- Tests: cover interaction flows and rendering of critical states.


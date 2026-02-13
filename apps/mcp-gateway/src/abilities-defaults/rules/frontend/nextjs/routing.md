---
id: rules.frontend.nextjs.routing
type: rule
tags: [frontend, nextjs]
priority: 905
includes: []
---
- Prefer file-based routing; keep server-only code out of client components.
- Use dynamic imports for heavy components; enable ISR/SSG appropriately.
- Sanitize route params; handle 404/500 explicitly.


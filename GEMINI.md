# savant-core — Gemini Context

> **📌 All documentation has been consolidated into `AGENTS.md`**

This file exists for Gemini-specific tool compatibility. For complete project documentation, see:

**👉 [`AGENTS.md`](./AGENTS.md)** — Single source of truth for all AI agents

---

## Quick Reference

### Project Overview
`savant-core` is a monorepo containing:
- **Task Master** — Full-stack task management (React + Express + MongoDB)
- **Talon** — AI agent runtime

### Quick Start
```bash
docker compose up
```

### Key Locations
- Task Master API: `apps/task-master/apps/api`
- Task Master Web: `apps/task-master/apps/web`
- Talon: `apps/talon`
- UI Style Guide: `apps/task-master/STYLE_GUIDE_CYBER_ONYX.md`

### Agent Requirements
1. Leave session logs in `.codex/YYYY-MM-DD_HH-MM-SS.log`
2. Make git commits for completed tasks
3. Follow UI patterns in the style guide

---

**For full documentation, see [`AGENTS.md`](./AGENTS.md)**
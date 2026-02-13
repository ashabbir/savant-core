# savant-core — Agent Guide

> **📌 This is the single source of truth for all AI agents working in this repository.**

This document provides everything AI agents need to understand, build, and run the savant-core monorepo.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Repository Layout](#repository-layout)
3. [Building and Running](#building-and-running)
4. [Task Master Stack](#task-master-stack)
5. [Talon Stack](#talon-stack)
6. [Development Conventions](#development-conventions)
7. [UI Development](#ui-development)
8. [Agent Requirements](#agent-requirements)
9. [References](#references)

---

## Project Overview

`savant-core` is a monorepo housing two primary applications:

### Task Master
A full-stack task management application designed to enhance productivity.

- **Purpose:** Create, manage, and track tasks. Integrates deeply with Talon to automate agent-driven task execution.
- **Architecture:** React frontend + Node.js/Express backend
- **Key Technologies:**
  - **Frontend:** React, Vite, TanStack Query
  - **Backend:** Node.js, Express.js, Zod
  - **Database:** MongoDB, Prisma ORM
  - **Infrastructure:** Docker for local development
- **Integration:** Task assignment triggers agent runs. Agents manage task status and comments via the Task Master API.

### Talon
A reasoning engine that acts as the AI agent runtime.

- **Purpose:** Executes automated workflows based on tasks assigned from Task Master.
- **Location:** `apps/talon/`
- **Agents:** Utilize Task Master API keys to update task statuses and post comments.

---

## Repository Layout

```
savant-core/
├── apps/
│   ├── task-master/          # Task Master application
│   │   ├── apps/
│   │   │   ├── api/          # Express.js backend (port 3333)
│   │   │   └── web/          # React frontend (port 5173)
│   │   ├── prds/             # Product requirements
│   │   └── STYLE_GUIDE_CYBER_ONYX.md  # UI component guide
│   └── talon/                # Talon runtime
├── docker-compose.yml        # Local dev stack (Task Master + MongoDB)
├── AGENTS.md                 # This file (single source of truth)
└── .codex/                   # Agent session logs
```

---

## Building and Running

### Prerequisites
- Node.js (check `.nvmrc` or `package.json` for version)
- Docker & Docker Compose
- npm
- **Ollama** (optional, for local LLMs) - See `apps/talon/README.md` for model setup

### Quick Start (Recommended)

From repo root:
```bash
docker compose up
```

This starts:
- Task Master API (`http://localhost:3333`)
- Task Master Web (`http://localhost:5173`)
- MongoDB

### Manual Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Initialize database:**
   ```bash
   npm run dev:db
   ```
   This runs `prisma db push` and seeds the database.

3. **Run applications:**
   ```bash
   # All at once
   npm run dev

   # Or separately
   npm run dev:api   # API on port 3333
   npm run dev:web   # Web on port 5173
   ```

4. **Run Talon Gateway (optional):**
   ```bash
   npm --workspace apps/talon run dev
   ```
   Runs on `http://localhost:18789`

### Production Build

```bash
npm run build
```

Build artifacts are placed in `dist/` directory of each application.

### Database Commands

```bash
# Push schema changes
npm --workspace apps/task-master/apps/api run db:push

# Seed database
npm --workspace apps/task-master/apps/api run db:seed

# Launch Prisma Studio (GUI)
npm --workspace apps/task-master/apps/api run db:studio
```

---

## Task Master Stack

### API (`apps/task-master/apps/api`)

| Aspect | Details |
|--------|---------|
| Framework | Express.js |
| Validation | Zod schemas |
| Database | MongoDB via Prisma |
| Auth | API key in `x-api-key` header |
| Logging | User/system actions logged to Activity table |
| Schema | `apps/task-master/apps/api/prisma/schema.prisma` |

### Web (`apps/task-master/apps/web`)

| Aspect | Details |
|--------|---------|
| Framework | React + Vite |
| Data Fetching | TanStack Query (`@tanstack/react-query`) |
| Styling | CSS (Cyber-Onyx theme) |
| Entry Point | `apps/task-master/apps/web/src/App.jsx` |
| API Client | `apps/task-master/apps/web/src/api.js` |

---

## Talon Stack

| Aspect | Details |
|--------|---------|
| Location | `apps/talon/` |
| Gateway Port | 18789 |
| Docker | Not wired into Docker Compose yet |
| Documentation | See `apps/talon/README.md` |

---

## Development Conventions

### General Rules

- **Small, focused changes** — Prefer atomic commits and PRs
- **Update docs** — Keep documentation current when changing runtime or setup
- **Follow monorepo layout** — `apps/task-master/` and `apps/talon/`
- **Integration scope** — Keep Task Master/Talon integration scoped to PRD phases

### Code Style

- **API validation** — Use Zod for all request validation
- **Database access** — Always through Prisma
- **React components** — Follow existing patterns in `components/` directory
- **CSS** — Use design tokens, never hardcode colors

### Testing

- Currently no automated test suite
- Manual testing via browser and API calls

---

## UI Development

All UI work in Task Master **must** follow the Cyber-Onyx Style Guide:

📍 **Style Guide:** [`apps/task-master/STYLE_GUIDE_CYBER_ONYX.md`](./apps/task-master/STYLE_GUIDE_CYBER_ONYX.md)

The style guide contains:
- Design tokens (colors, typography, spacing)
- Component patterns (cards, buttons, modals, drawers, tabs)
- Layout system
- Animation guidelines
- Accessibility requirements
- Checklist for adding new components

---

## Agent Requirements

### Session Logging (Required)

All AI agents working in this repo **must** leave a session log:

- **Location:** `.codex/`
- **Filename:** `YYYY-MM-DD_HH-MM-SS.log`
- **Content:** Brief summary of changes made

**Applies to:**
- Codex App
- Codex CLI
- Claude
- Antigravity (Gemini)
- Any other AI agent

### Git Commits (Required)

All AI agents must make git commits when tasks are completed:
- Use short, clear commit messages
- Commit related changes together
- Don't leave uncommitted work

### Common Agent Tasks

| Task | Location |
|------|----------|
| Update Task Master API | `apps/task-master/apps/api` |
| Update Task Master UI | `apps/task-master/apps/web` |
| Update Talon runtime | `apps/talon` |
| Modify database schema | `apps/task-master/apps/api/prisma/schema.prisma` |

---

## References

| Document | Path |
|----------|------|
| Task Master PRD | `apps/task-master/prds/final_prd.md` |
| UI Style Guide | `apps/task-master/STYLE_GUIDE_CYBER_ONYX.md` |
| Talon Documentation | `apps/talon/README.md` |
| Prisma Schema | `apps/task-master/apps/api/prisma/schema.prisma` |
| CSS Styles | `apps/task-master/apps/web/src/app.css` |
| Themes | `apps/task-master/apps/web/src/themes.css` |
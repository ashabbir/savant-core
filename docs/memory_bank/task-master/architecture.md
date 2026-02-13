# Architecture

## Overview
Task Master is a full‑stack task manager integrated with Talon:
- **Web UI** (React + Vite)
- **API** (Express)
- **DB** (MongoDB via Prisma)
- **Auth** via API key header

```
[Web UI]  →  [Express API]  →  [MongoDB]
            (Prisma ORM)
```

## Components
- `apps/task-master/apps/web`: React SPA
- `apps/task-master/apps/api`: Express server + Prisma client
- `apps/task-master/apps/api/prisma/schema.prisma`: DB schema
- `apps/talon`: Talon runtime (separate, not in docker compose)

## Core Data Models
- **User**: `role`, `projectIds`, `preferredAgentId`, `email`, `monthlyTokenLimit`, `monthlyCostLimit`
- **Project**: embedded `columns`, shared memory (`description`, `repoPath`, `localPath`, `notes`), quotas
- **Task**: `columnName`, `ticketNumber`, `type` (`story|bug|epic`), `epicId` link, `assignee`
- **Comment** / **Activity**: task updates + timeline
- **Agent** / **AgentMessage**: Talon registry + chat
- **RoutingRule**: project‑scoped routing (`type`/`priority`/`assignee` → `agentId`)
- **UsageEntry**: token/cost tracking per agent run
- **NotificationSubscription**: per‑user Slack/email subscriptions
- **TalonRetry**: durable retry queue for failed Talon calls
- **Document**: project docs/notes

## Key Flows
- Board fetch: `/api/projects/:id/board`
- Epics fetch: `/api/projects/:id/epics`
- Activity feed: `/api/activity`
- Agent chat: `/api/agents/:id/messages`
- Routing rules: `/api/projects/:id/routing-rules`
- Notifications: `/api/me/notifications`

## Deployment Notes
- API reads `DATABASE_URL` from `.env`
- Mongo must run as a **replica set** for Prisma

## Security
- API key in `X-API-Key`
- Admin‑only endpoints protected server‑side

# Task Master

A full-stack task management application with AI agent integration via Talon.

## Features

- 📋 Kanban-style task board with drag-and-drop
- 👥 Multi-user support with project-based access control
- 🤖 AI agent integration (Talon) for automated task execution
- 📊 Activity logging and audit trail
- 🔔 Notifications (Slack webhooks, email)
- 📁 Project context and shared memory

## Tech Stack

- **Frontend**: React, Vite, TanStack Query
- **Backend**: Node.js, Express.js, Zod
- **Database**: MongoDB with Prisma ORM
- **AI Runtime**: Talon Gateway

## Quick Start

### Using Docker (Recommended)

From the repo root:
```bash
docker compose up
```

Services:
- Task Master Web: http://localhost:5173
- Task Master API: http://localhost:3333

### Local Development

```bash
# Install dependencies
npm install

# Initialize database
npm run dev:db

# Start API (Terminal 1)
npm run dev:api

# Start Web (Terminal 2)
npm run dev:web
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | MongoDB connection string | Required |
| `TALON_GATEWAY_URL` | Talon Gateway URL | - |
| `TALON_GATEWAY_TOKEN` | Auth token for Talon | - |
| `TALON_DEFAULT_AGENT_ID` | Default agent for task automation | - |

### Email Notifications (Optional)
| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `SMTP_SECURE` | Use TLS (true/false) |
| `SMTP_FROM` | Sender email address |

## API Reference

### Authentication

Login to get an API key:
```bash
curl -X POST http://localhost:3333/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"amdsh","password":"password"}'
```

Use the returned `apiKey` in the `X-API-Key` header.

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/login` | Login, returns API key |
| `GET` | `/api/projects` | List projects |
| `POST` | `/api/projects` | Create project |
| `GET` | `/api/projects/:id/board` | Get project board |
| `POST` | `/api/tasks` | Create task |
| `PATCH` | `/api/tasks/:id` | Update task |
| `PATCH` | `/api/tasks/:id/move` | Move task to column |
| `GET` | `/api/tasks/:id/comments` | Get task comments |
| `POST` | `/api/tasks/:id/comments` | Add comment |
| `GET` | `/api/agents` | List agents |
| `POST` | `/api/agents` | Create agent |
| `PATCH` | `/api/agents/:id` | Update agent |

### Project Context

```bash
# Get project context
curl http://localhost:3333/api/projects/:id/context \
  -H "X-API-Key: $API_KEY"

# Update project context
curl -X PATCH http://localhost:3333/api/projects/:id/context \
  -H "X-API-Key: $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"repoPath":"/path/to/repo","notes":"Project notes"}'
```

## Talon Integration

Task Master integrates with Talon for automated task execution:

### How It Works

1. **Agent Configuration**: Create agents in Task Master with soul, model, and guardrails
2. **Auto-Sync**: Agent configs automatically sync to Talon Gateway
3. **Todo Trigger**: When a task moves to "Todo" column, Talon agent starts working
4. **Feedback Loop**: Agent posts comments and status updates back to Task Master

### Agent Fields

| Field | Description |
|-------|-------------|
| `name` | Agent display name |
| `talonId` | Unique ID in Talon |
| `model` | LLM model (e.g., `anthropic/claude-opus-4`) |
| `role` | Agent role description |
| `soul` | System prompt / personality |
| `guardrails` | Safety instructions |
| `bootstrap` | Command to run on session start |
| `everyone` | Shared repository context |

### Routing Rules

Configure which agent handles which tasks:
```bash
# Create routing rule
curl -X POST http://localhost:3333/api/projects/:id/routing-rules \
  -H "X-API-Key: $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"agentId":"agent-id","field":"type","operator":"equals","value":"bug"}'
```

## Database

MongoDB with Prisma ORM. Schema: `apps/api/prisma/schema.prisma`

```bash
# Push schema changes
npm --workspace apps/api run db:push

# Seed database
npm --workspace apps/api run db:seed

# Open Prisma Studio
npm --workspace apps/api run db:studio
```

## Development

### Project Structure

```
apps/task-master/
├── apps/
│   ├── api/                 # Express.js backend
│   │   ├── prisma/          # Database schema + migrations
│   │   ├── src/
│   │   │   ├── index.js     # Main API routes
│   │   │   ├── talon.js     # Talon integration helpers
│   │   │   └── validate.js  # Zod schemas
│   │   └── test/
│   └── web/                 # React frontend
│       ├── src/
│       │   ├── App.jsx      # Main app component
│       │   ├── api.js       # API client
│       │   └── components/  # React components
│       └── public/
└── README.md
```

### Scripts

```bash
npm run dev        # Start both API and Web
npm run dev:api    # Start API only
npm run dev:web    # Start Web only
npm run dev:db     # Push schema + seed
npm run build      # Build for production
```

## Notes

- Demo users are created by `db:seed`. Check the seed script for credentials.
- Quotas: Set `monthlyTokenLimit` or `monthlyCostLimit` on projects/users to limit AI usage.
## Related

- [Root README](../../README.md) - Main project documentation and Docker setup
- [Talon README](../talon/README.md) - AI agent runtime documentation
- [Integration PRD](../../docs/prds/workflows-prd.md) - Detailed integration specifications

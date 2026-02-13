# Savant Core

Monorepo for **Task Master** (task management UI) and **Talon** (AI agent runtime).

## 🚀 Quick Start (Docker)

From the repo root, start all services with:

```bash
docker compose up
```

This starts:
- **Task Master Web**: http://localhost:5173
- **Task Master API**: http://localhost:3333
- **Talon Gateway**: http://localhost:18789
- **MongoDB**: mongodb://localhost:27017 (replica set `rs0`)

## 📁 Project Structure

```
savant-core/
├── apps/
│   ├── task-master/          # Task management application
│   │   ├── apps/
│   │   │   ├── api/          # Express.js backend
│   │   │   └── web/          # React frontend
│   │   └── README.md
│   └── talon/                # AI agent runtime
│       └── README.md
├── docs/
│   └── prds/                 # Product requirements
├── docker-compose.yml        # Full stack Docker setup
└── README.md                 # This file
```

## 🐳 Docker Services

| Service | Port | Description |
|---------|------|-------------|
| `mongo` | 27017 | MongoDB with replica set |
| `task-master-api` | 3333 | Task Master REST API |
| `task-master-web` | 5173 | Task Master React UI |
| `talon` | 18789 | Talon AI Gateway |

## ⚙️ Environment Variables

### Core Configuration

| Variable | Description | Service | Default |
|----------|-------------|---------|---------|
| `HOST` | Server bind address | Task Master API | `0.0.0.0` |
| `PORT` | Server port | Task Master API | `3333` |
| `DATABASE_URL` | MongoDB connection string with replica set | Task Master API | Required |

### Talon Integration

| Variable | Description | Service | Default |
|----------|-------------|---------|---------|
| `TALON_GATEWAY_URL` | URL of Talon Gateway for triggering agents | Task Master API | - |
| `TALON_GATEWAY_TOKEN` | Bearer token for Talon Gateway auth | Task Master API, Talon | - |
| `TALON_DEFAULT_AGENT_ID` | Fallback agent ID when no routing rule matches | Task Master API | - |
| `TALON_MAX_ATTEMPTS` | Max retry attempts for Talon requests | Task Master API | `3` |
| `TALON_RETRY_DELAY_MS` | Delay between retry attempts (ms) | Task Master API | `500` |
| `TALON_COST_PER_1K` | Cost estimate per 1K tokens for usage tracking | Task Master API | - |

### Talon Queue (Background Retries)

| Variable | Description | Service | Default |
|----------|-------------|---------|---------|
| `TALON_QUEUE_ENABLED` | Enable background retry queue for failed requests | Task Master API | `false` |
| `TALON_QUEUE_POLL_MS` | Polling interval for processing queue (ms) | Task Master API | `5000` |
| `TALON_QUEUE_BATCH` | Number of queue items to process per poll | Task Master API | `5` |
| `TALON_QUEUE_MAX_ATTEMPTS` | Max retry attempts from queue | Task Master API | `3` |

### Email Notifications (SMTP)

| Variable | Description | Service | Default |
|----------|-------------|---------|---------|
| `SMTP_HOST` | SMTP server hostname | Task Master API | - |
| `SMTP_PORT` | SMTP server port | Task Master API | `587` |
| `SMTP_USER` | SMTP username/email | Task Master API | - |
| `SMTP_PASS` | SMTP password | Task Master API | - |
| `SMTP_SECURE` | Use TLS encryption (`true`/`false`) | Task Master API | `false` |
| `SMTP_FROM` | Sender email address override | Task Master API | `SMTP_USER` |

### Talon Gateway Configuration

| Variable | Description | Service | Default |
|----------|-------------|---------|---------|
| `TASK_MASTER_API_URL` | URL of Task Master API for callbacks | Talon | - |
| `TASK_MASTER_API_KEY` | API key for Task Master authentication | Talon | - |

### Docker Compose Defaults

When using `docker compose up`, these are pre-configured:

```bash
# Task Master API
DATABASE_URL=mongodb://mongo:27017/task-manager?replicaSet=rs0
TALON_GATEWAY_URL=http://talon:18789
TALON_GATEWAY_TOKEN=${TALON_GATEWAY_TOKEN:-dev-token}

# Talon Gateway
TASK_MASTER_API_URL=http://task-master-api:3333
```

To override, create a `.env` file in the repo root:

```bash
# .env
TALON_GATEWAY_TOKEN=your-secure-token
TASK_MASTER_API_KEY=your-api-key
```

## 🛠️ Development Setup

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- npm or pnpm

### Option 1: Docker (Recommended)

```bash
# Start all services
docker compose up

# Or run in background
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Option 2: Local Development

```bash
# Install dependencies
npm install

# Start MongoDB (requires Docker)
docker compose up mongo mongo-init -d

# Terminal 1: Task Master API
cd apps/task-master
npm run dev:db    # Initialize database
npm run dev:api   # Start API on :3333

# Terminal 2: Task Master Web
cd apps/task-master
npm run dev:web   # Start UI on :5173

# Terminal 3: Talon Gateway
cd apps/talon
npm run build
node dist/entry.js gateway --port 18789
```

## 🔐 Authentication

### Task Master
Login with seeded demo users:
```bash
curl -X POST http://localhost:3333/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"amdsh","password":"password"}'
```

Use the returned `apiKey` in the `X-API-Key` header for subsequent requests.

### Talon Gateway
Use Bearer token authentication:
```bash
curl http://localhost:18789/v1/agents \
  -H 'Authorization: Bearer your-token'
```

## 📚 Documentation

- [Task Master README](apps/task-master/README.md)
- [Talon README](apps/talon/README.md)
- [Integration PRD](docs/prds/workflows-prd.md)

## 🔗 Integration Overview

Task Master and Talon work together to automate task execution:

1. **Agent Configuration**: Create/edit agents in Task Master UI
2. **Sync to Talon**: Agent configs are synced to Talon Gateway
3. **Task Automation**: Drag a task to "Todo" → triggers Talon agent
4. **Feedback Loop**: Agent posts comments and status updates back to Task Master

```
┌─────────────────┐         ┌─────────────────┐
│   Task Master   │ ◀─────▶ │      Talon      │
│   (UI + API)    │  sync   │   (AI Runtime)  │
└────────┬────────┘         └────────┬────────┘
         │                           │
         │    trigger on Todo move   │
         │ ─────────────────────────▶│
         │                           │
         │   comments + status       │
         │◀───────────────────────── │
         │                           │
└──────────────────────────────────────────────┘
                    MongoDB
```

## 📝 Notes

- MongoDB data persists in the `mongo-data` Docker volume
- First run seeds demo users. See `apps/task-master/apps/api/prisma/seed.js`
- Talon requires a model provider (Anthropic, OpenAI) configured for full functionality

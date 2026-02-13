# 🦅 Talon — AI Agent Runtime

**Talon** is a lightweight AI agent orchestration platform that runs on your own devices. It provides a WebSocket-based Gateway for managing agent sessions, tool execution, and multi-channel messaging.

## Features

- **Gateway Control Plane**: WebSocket server managing sessions, tools, and events
- **Multi-Provider Support**: Anthropic Claude, OpenAI GPT, Google Gemini, Ollama (local)
- **Tool Execution**: Bash, file operations, browser control, and custom skills
- **Session Management**: Persistent sessions with context and memory
- **Skills System**: Extensible via workspace-local skills

## Quick Start

### Prerequisites

- **Node.js ≥22** (required)
- **pnpm** (recommended for builds)

### Installation

```bash
# Clone and build
cd apps/talon
pnpm install
TALON_A2UI_SKIP_MISSING=1 pnpm build
```

### Running the Gateway

```bash
# Start the gateway server
node dist/entry.js gateway --port 18789 --allow-unconfigured --token your-secret-token
```

The gateway will listen on `ws://127.0.0.1:18789`.

### Running an Agent

```bash
# In a new terminal
export TALON_GATEWAY_TOKEN=your-secret-token
node dist/entry.js agent -m "Hello Talon!" --session-id my-session --gateway-port 18789
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    TALON GATEWAY                        │
├─────────────────────────────────────────────────────────┤
│  Gateway Layer (HTTP/WebSocket)                         │
│  ├── HTTP server (Express)                              │
│  ├── Token/Password auth                                │
│  ├── WebSocket connections                              │
│  └── Hook endpoints                                     │
├─────────────────────────────────────────────────────────┤
│  Agent Layer (Pi Runtime)                               │
│  ├── Pi embedded runner                                 │
│  ├── Tool execution (bash, file, etc.)                  │
│  ├── Session management                                 │
│  └── Skills system                                      │
├─────────────────────────────────────────────────────────┤
│  Provider Layer (LLM APIs)                              │
│  ├── Anthropic Claude                                   │
│  ├── OpenAI GPT                                         │
│  ├── Google Gemini                                      │
│  └── Ollama (local)                                     │
├─────────────────────────────────────────────────────────┤
│  Storage Layer                                          │
│  ├── JSON (sessions)                                    │
│  └── SQLite (memory, embeddings)                        │
└─────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TALON_GATEWAY_TOKEN` | Auth token for gateway access | Required |
| `TALON_GATEWAY_PORT` | Gateway listen port | `18789` |
| `ANTHROPIC_API_KEY` | Anthropic API key | - |
| `OPENAI_API_KEY` | OpenAI API key | - |
| `GOOGLE_API_KEY` | Google Gemini API key | - |

### Configuration File

Create `~/.talon/talon.json`:

```json
{
  "agent": {
    "model": "anthropic/claude-opus-4-6"
  },
  "gateway": {
    "port": 18789,
    "auth": {
      "token": "your-secret-token"
    }
  }
}
```

## Agent Workspace

- **Workspace root**: `~/.talon/workspace`
- **Injected prompt files**: `AGENTS.md`, `SOUL.md`, `TOOLS.md`
- **Skills**: `~/.talon/workspace/skills/<skill>/SKILL.md`

## CLI Commands

### Gateway

```bash
# Start gateway
node dist/entry.js gateway --port 18789 --token your-token

# With verbose logging
node dist/entry.js gateway --port 18789 --token your-token --verbose
```

### Agent

```bash
# Send a message
node dist/entry.js agent -m "Your message" --session-id my-session

# With thinking level
node dist/entry.js agent -m "Complex task" --thinking high
```

### Status

```bash
# Check gateway status
node dist/entry.js status
```

## API Endpoints

### Health Check

```bash
curl http://localhost:18789/health
```

### Chat Completions (OpenAI-compatible)

```bash
curl -X POST http://localhost:18789/v1/chat/completions \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "anthropic/claude-opus-4-6",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Hook Wake

```bash
curl -X POST http://localhost:18789/hook/wake \
  -H "X-Talon-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{"message": "Wake up!"}'
```

## Development

### Build

```bash
pnpm install
TALON_A2UI_SKIP_MISSING=1 pnpm build
```

### Dev Mode (auto-reload)

```bash
pnpm gateway:watch
```

### Tests

```bash
pnpm test
```

## Docker

```bash
# Build
docker build -t talon .

# Run
docker run -p 18789:18789 -e TALON_GATEWAY_TOKEN=your-token talon
```

### Interacting with the Agent inside Docker

You can run Talon CLI commands directly inside the running container to interact with the agent.

**1. Send a single message:**
```bash
docker exec -it savant-core-talon-1 node dist/entry.js agent -m "Hello, who are you?" --session-id test-session
```

**2. Open a shell in the container:**
```bash
docker exec -it savant-core-talon-1 /bin/bash

# Once inside, you can run commands:
node dist/entry.js agent -m "What is the capital of France?" --session-id test-session
```

## LLM Provider Setup

### Anthropic (Recommended)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Recommended model: `anthropic/claude-opus-4-6` for best long-context and safety.

### OpenAI

```bash
export OPENAI_API_KEY=sk-...
```

### Google Gemini

```bash
export GOOGLE_API_KEY=...
```

### Ollama (Local)

When using Ollama with the provided `docker-compose.yml`, the following are pre-configured:

- `OLLAMA_BASE_URL`: `http://host.docker.internal:11434/v1` (to access host machine)
- `OLLAMA_API_KEY`: `ollama` (required for some clients/providers)

**Prerequisites:**
1. Install [Ollama](https://ollama.com/)
2. Pull the required models:
   ```bash
   ollama pull granite-code:3b
   ollama pull smallthinker
   ```
3. Start the Ollama server:
   ```bash
   ollama serve
   ```

**Within Docker:**
The Talon service in `docker-compose.yml` is configured to use `granite-code:3b` as the primary model and `smallthinker` as a fallback.

**Manual Setup (without Docker):**
If running Talon outside of Docker, ensure your `OLLAMA_BASE_URL` points to your local instance (default: `http://127.0.0.1:11434/v1`).

## Session Persistence

Sessions are stored in `~/.talon/agents/<agent>/sessions/`:

```bash
# Check session data
ls -la ~/.talon/agents/default/sessions/
```

## Related

- [Root README](../../README.md) - Main project documentation and Docker setup
- [Task Master README](../task-master/README.md) - Task management application
- [Integration PRD](../../docs/prds/workflows-prd.md) - Task Master ↔ Talon integration

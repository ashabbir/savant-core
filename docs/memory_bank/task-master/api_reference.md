# Task Master API Reference (Practical)

## Base

- Local: `http://localhost:3333`
- Auth header: `x-api-key: <user-api-key>`

## Core Endpoints

- `POST /api/login`
- `GET /api/me`
- `GET /api/projects`
- `GET /api/projects/:projectId/board`
- `POST /api/tasks`
- `PATCH /api/tasks/:taskId`
- `PATCH /api/tasks/:taskId/move`
- `GET /api/tasks/:taskId/comments`
- `POST /api/tasks/:taskId/comments`

## Jarvis Endpoints

- `GET /api/jarvis/status`
- `GET /api/jarvis/sessions`
- `GET /api/jarvis/sessions/transcript?sessionKey=...`
- `POST /api/jarvis/sessions/label`
- `DELETE /api/jarvis/sessions?sessionKey=...`
- `POST /api/jarvis/chat`

## Context Repo Endpoints

- `GET /api/context/repos`
- `GET /api/context/repos/status`
- `POST /api/context/repos`
- `PATCH /api/context/repos/:name`
- `POST /api/context/repos/:name/reindex`
- `POST /api/context/repos/:name/sync`
- `DELETE /api/context/repos/:name`
- `POST /api/context/repos/index-completed`

## Agent/Talon Integration Endpoints

- `GET /api/agents`
- `POST /api/agents/:id/test`
- `POST /api/tasks/:taskId/agent-chat`
- `POST /api/tasks/:taskId/agent-chat/test`
- `POST /api/talon/auth/start`
- `POST /api/talon/auth/exchange`
- `GET /api/talon/providers/models`

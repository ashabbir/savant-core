# Talon Project Overview

Talon is a personal AI assistant designed to run on your own devices, providing a local-first, always-on experience. It integrates with various messaging channels and tools to automate tasks and assist users.

## Core Identity
- **Concept**: A personal AI assistant ("Exfoliate!") that feels local, fast, and always-on.
- **Product**: The assistant itself, not just the control plane (Gateway).
- **Mascot**: Talon. 🦅

## Architecture
- **Gateway**: The control plane (WebSocket server) managing sessions, channels, tools, and events. Run via `talon gateway`.
- **Runtime**: Node.js (≥22).
- **Communication**: WebSocket-based control plane (`ws://127.0.0.1:18789` default).
- **Agents**: Supports multiple agents (workspaces + per-agent sessions) with routing capabilities.
- **Pi Agent**: The default agent runtime operating in RPC mode.

## Key Subsystems
1. **Gateway**: Single control plane for clients, tools, and events.
2. **Channels**: Multi-channel inbox support including:
   - **Messaging**: WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, Microsoft Teams, Matrix, Zalo.
   - **Apple Ecosystem**: BlueBubbles (iMessage recommended), Legacy iMessage.
   - **Web**: WebChat.
   - **Mobile**: iOS and Android nodes.
3. **Tools**:
   - **Browser**: Dedicated Chrome/Chromium control with CDP.
   - **Canvas**: Agent-driven visual workspace (A2UI).
   - **Nodes**: Device-local actions (camera, screen record, notifications, location).
   - **Session Tools**: `sessions_list`, `sessions_history`, `sessions_send` for agent-to-agent coordination.
4. **Voice**: "Voice Wake" and "Talk Mode" for always-on speech interaction (using ElevenLabs).

## Capabilities
- **Local-First**: Designed to run on user devices or a small Linux instance/VPS.
- **Remote Access**: securely accessible via Tailscale (Serve/Funnel) or SSH tunnels.
- **Sandboxing**: Docker-based sandboxing for non-main sessions (groups/channels) to ensure security.
- **Skills**: Extensible via a skills registry and workspace-local skills (`~/.talon/workspace/skills`).

## Configuration
- **Root Config**: `~/.talon/talon.json`.
- **Workspace**: `~/.talon/workspace` containing `AGENTS.md`, `SOUL.md`, `TOOLS.md`.
- **Environment**: Supports `.env` files and environment variables for secrets (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

## Development
- **Monorepo Structure**: Located in `apps/talon` within the broader `savant-core` repository.
- **Build**: Uses `pnpm` for dependency management and building.
- **Tech Stack**: TypeScript, Node.js, Fastify (implied by Gateway), React (for UI components).

## Integration with Savant Core
- Talon acts as the "Reasoning Engine" or AI Agent Runtime component in the Savant Core architecture.
- It can be triggered by Task Master for automated task execution.

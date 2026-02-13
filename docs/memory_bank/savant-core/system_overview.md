# System Overview

## What Savant Core Is

`savant-core` is a monorepo for a multi-application productivity and agent suite.

- `Task Master` is the product-facing project/task system.
- `Talon` is the agent execution runtime.
- `MCP Gateway` is a dedicated MCP hub for shared context and ability knowledge tooling.

## Core Data Flow

1. User interacts with Task Master web.
2. Task Master API persists project/task state in MongoDB.
3. Task Master calls Talon Gateway for agent chat/workflows.
4. Talon returns agent output and Task Master records activity/comments.
5. Task Master and MCP Gateway exchange context indexing lifecycle signals.
6. MCP Gateway exposes MCP tools to agents and UI consumers.

## MCP Layer

MCP Gateway currently exposes two MCPs:

- `context`: repository indexing + memory/code retrieval tools
- `abilities`: filesystem-backed personas/rules/policies/repos resolver and authoring tools

This keeps AI context concerns separated from Task Master business logic while staying in the same product suite.

## Persistence Summary

- MongoDB volume: app/product state (Task Master)
- PostgreSQL + pgvector volume: vector-enabled relational store
- Talon data volume: agent sessions/auth/config
- MCP Gateway data volume: context indexes, audit, abilities content
- Shared workdir volume: cloned repos and worktrees used by agents/tools

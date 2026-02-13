# MCP Gateway Overview

## Purpose

`apps/mcp-gateway` is a standalone MCP hub service in the Savant suite.

It provides:

- MCP discovery (`/v1/mcps`)
- MCP details (`/v1/mcps/:mcp_id`)
- MCP tool catalogs and execution
- Dashboard UI at `/ui/`

## Available MCPs

## Context MCP

- Repository indexing
- Memory retrieval
- Code retrieval

Tools:

- `memory_search`
- `memory_read`
- `code_search`
- `code_read`

## Abilities MCP

- Filesystem-backed block management (personas/rules/policies/repos)
- Prompt composition and deterministic manifest generation

Tools:

- `resolve_abilities`
- `add_ability_block`
- `list_ability_blocks`
- `list_personas`
- `list_repos`
- `list_rules`
- `list_policies`

## Storage

- Root data dir from `CONTEXT_DATA_DIR` (default `./data`)
- Context store file: `context-store.json`
- Abilities root: `<data>/abilities`

## UI

The MCP Hub UI supports:

- MCP list and detail tabs
- Tool introspection
- Tool execution
- Connection snippets
- Context indexing controls
- Abilities block authoring (including nested directories)
- Live browser reload on UI file changes

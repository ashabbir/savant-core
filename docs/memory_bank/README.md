# Savant Core Memory Bank

This directory is the operational and architecture memory for the full `savant-core` suite.

## Scope

- `Task Master`: project/task management product (web + api)
- `Talon`: agent runtime and gateway
- `MCP Gateway`: suite MCP hub currently hosting:
  - `Context MCP`
  - `Abilities MCP`

## Document Map

- `savant-core/system_overview.md`
- `savant-core/local_development.md`
- `task-master/architecture.md`
- `task-master/api_reference.md`
- `talon/gateway_integration.md`
- `mcp-gateway/overview.md`
- `mcp-gateway/abilities_mcp.md`
- `testing/verification_matrix.md`

## Runtime Ports

- Task Master Web: `5173`
- Task Master API: `3333`
- Task Master OAuth callback listener: `1455`
- MCP Gateway Hub/API: `4444`
- Talon Gateway (host mapped): `18790` -> container `18789`
- MongoDB: `27017`
- PostgreSQL (pgvector): `5432`

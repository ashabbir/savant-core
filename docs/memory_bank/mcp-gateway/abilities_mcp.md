# Abilities MCP

## What It Is

Abilities MCP is a knowledge/rules authoring and resolution subsystem designed from the `abilities` prototype.

It models markdown blocks with frontmatter metadata:

- personas
- rules
- policies
- styles
- repo overlays

## File Layout

Under abilities root:

- `personas/`
- `rules/`
- `policies/`
- `repos/`

Nested directories are allowed and supported in Hub authoring.

Examples:

- `rules/backend/python/fastapi.md`
- `policies/security/no_secrets.md`
- `personas/engineer.md`

## Add Block Flow

Hub uses `add_ability_block` with:

- `type`
- `id`
- `relativeDir`
- `priority`
- `tags`
- `body`

The gateway writes markdown with normalized frontmatter and returns the created block descriptor.

## Resolve Flow

`resolve_abilities` accepts:

- `persona`
- `tags`
- optional `repo_id`
- optional `trace`

It returns:

- resolved persona/rules/policies bodies
- deterministic `manifest` with applied IDs, order, and hash
- optional trace for debugging

## Defaults Seeding

On first run (empty abilities root), gateway seeds defaults from:

- `apps/mcp-gateway/src/abilities-defaults/`

This was populated from the prototype reference tree you provided.

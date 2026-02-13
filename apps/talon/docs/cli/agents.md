---
summary: "CLI reference for `talon agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `talon agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
talon agents list
talon agents add work --workspace ~/.talon/workspace-work
talon agents set-identity --workspace ~/.talon/workspace --from-identity
talon agents set-identity --agent main --avatar avatars/talon.png
talon agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.talon/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
talon agents set-identity --workspace ~/.talon/workspace --from-identity
```

Override fields explicitly:

```bash
talon agents set-identity --agent main --name "Talon" --emoji "🦅" --avatar avatars/talon.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "Talon",
          theme: "space lobster",
          emoji: "🦅",
          avatar: "avatars/talon.png",
        },
      },
    ],
  },
}
```

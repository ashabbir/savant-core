---
summary: "CLI reference for `talon config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `talon config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `talon configure`).

## Examples

```bash
talon config get browser.executablePath
talon config set browser.executablePath "/usr/bin/google-chrome"
talon config set agents.defaults.heartbeat.every "2h"
talon config set agents.list[0].tools.exec.node "node-id-or-name"
talon config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
talon config get agents.defaults.workspace
talon config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
talon config get agents.list
talon config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--json` to require JSON5 parsing.

```bash
talon config set agents.defaults.heartbeat.every "0m"
talon config set gateway.port 19001 --json
talon config set channels.whatsapp.groups '["*"]' --json
```

Restart the gateway after edits.

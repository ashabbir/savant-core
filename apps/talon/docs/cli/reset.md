---
summary: "CLI reference for `talon reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `talon reset`

Reset local config/state (keeps the CLI installed).

```bash
talon reset
talon reset --dry-run
talon reset --scope config+creds+sessions --yes --non-interactive
```

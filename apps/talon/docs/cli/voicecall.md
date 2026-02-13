---
summary: "CLI reference for `talon voicecall` (voice-call plugin command surface)"
read_when:
  - You use the voice-call plugin and want the CLI entry points
  - You want quick examples for `voicecall call|continue|status|tail|expose`
title: "voicecall"
---

# `talon voicecall`

`voicecall` is a plugin-provided command. It only appears if the voice-call plugin is installed and enabled.

Primary doc:

- Voice-call plugin: [Voice Call](/plugins/voice-call)

## Common commands

```bash
talon voicecall status --call-id <id>
talon voicecall call --to "+15555550123" --message "Hello" --mode notify
talon voicecall continue --call-id <id> --message "Any questions?"
talon voicecall end --call-id <id>
```

## Exposing webhooks (Tailscale)

```bash
talon voicecall expose --mode serve
talon voicecall expose --mode funnel
talon voicecall unexpose
```

Security note: only expose the webhook endpoint to networks you trust. Prefer Tailscale Serve over Funnel when possible.
